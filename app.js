/* Pixel Community Radar — app.js
   PixelProTech Solutions — app shell, navigation, reports, insights, emergency mode. */

(() => {
  "use strict";

  const NAV_ITEMS = [
    { id: "home", label: "Home", icon: `<path d="M4 11.5L12 4l8 7.5"/><path d="M6 10v9a1 1 0 001 1h3v-6h4v6h3a1 1 0 001-1v-9"/>` },
    { id: "radar", label: "Radar", icon: `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>` },
    { id: "report", label: "Report", icon: `<path d="M12 5v14M5 12h14"/>`, isFab: true },
    { id: "insights", label: "Insights", icon: `<path d="M4 19V10M10 19V4M16 19v-7M22 19H2"/>` },
    { id: "profile", label: "Profile", icon: `<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6"/>` },
  ];

  const REPORT_CATEGORIES = ["power", "water", "road", "safety", "network", "waste", "service", "other"];

  const state = {
    view: "home",
    userPos: null,
    reports: [],
    businesses: [],
    online: navigator.onLine,
    profile: null,
    selectedCategory: null,
    reportPhoto: null,
    deferredInstallPrompt: null,
    mapInitialized: false,
  };

  /* ---------------------------------------------------------------------
     UTIL
  --------------------------------------------------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const uid = () => `pcr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
    const days = Math.floor(hrs / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  function toast(message, kind = "ok") {
    const stack = $("#toast-stack");
    const el = document.createElement("div");
    el.className = `toast ${kind === "ok" ? "" : kind}`;
    el.innerHTML = `<span class="t-dot"></span><span>${message}</span>`;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateY(-8px)";
      el.style.transition = "all 0.3s ease";
      setTimeout(() => el.remove(), 320);
    }, 3200);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---------------------------------------------------------------------
     NAVIGATION
  --------------------------------------------------------------------- */
  function buildNav() {
    const bottomNav = $("#bottom-nav");
    const sidebarNav = $("#sidebar-nav");
    bottomNav.innerHTML = "";
    sidebarNav.innerHTML = "";

    NAV_ITEMS.forEach((item) => {
      if (item.isFab) {
        // FAB itself doubles as the report nav trigger on mobile (spacer keeps grid alignment)
        const spacer = document.createElement("div");
        spacer.className = "nav-item fab-slot";
        bottomNav.appendChild(spacer);
      } else {
        const btn = document.createElement("button");
        btn.className = "nav-item" + (item.id === state.view ? " active" : "");
        btn.dataset.nav = item.id;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${item.icon}</svg><span>${item.label.toUpperCase()}</span>`;
        bottomNav.appendChild(btn);
      }

      const sBtn = document.createElement("button");
      sBtn.className = "nav-item" + (item.id === state.view ? " active" : "");
      sBtn.dataset.nav = item.id;
      sBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18">${item.icon}</svg><span>${item.label}</span>`;
      sidebarNav.appendChild(sBtn);
    });

    $$('[data-nav]').forEach((btn) => {
      btn.addEventListener("click", () => goToView(btn.dataset.nav));
    });
  }

  const VIEW_TITLES = {
    home: ["HOME", "Community overview"],
    radar: ["RADAR", "Live community map"],
    report: ["REPORT", "File a new report"],
    insights: ["INSIGHTS", "Analytics & trends"],
    profile: ["PROFILE", "Account & privacy"],
  };

  function goToView(viewId) {
    state.view = viewId;
    $$(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === viewId));
    $$('[data-nav]').forEach((btn) => btn.classList.toggle("active", btn.dataset.nav === viewId));
    const [label, title] = VIEW_TITLES[viewId] || ["", ""];
    $("#desktop-view-label").textContent = label;
    $("#desktop-view-title").textContent = title;

    if (viewId === "radar") {
      ensureMap();
      setTimeout(() => PCRMap.invalidate(), 50);
    }
    if (viewId === "insights") {
      renderInsights();
    }
    if (viewId === "report") {
      renderReportCatGrid("report-cat-grid");
      renderMyReports();
    }
  }

  /* ---------------------------------------------------------------------
     DATA LOAD / REFRESH
     NOTE: This app has no backend — there is no shared community feed.
     Every report in local storage was created on THIS device. Earlier
     versions masked that by injecting a batch of fabricated "community"
     reports (fake confirm counts, fake ages, fake confidence %) the first
     time the app ran. That fake data never changed and drowned out real
     user reports, which is why the app always looked the same on reopen.
     It has been removed — state now reflects only what's really stored.
  --------------------------------------------------------------------- */
  async function loadData() {
    const reports = await PCRStorage.getAllReports();
    const businesses = await PCRStorage.getAllBusinesses();
    state.reports = reports;
    state.businesses = businesses;
    renderHome();
    if (state.mapInitialized) PCRMap.render(reports);
  }

  /* ---------------------------------------------------------------------
     HOME VIEW
  --------------------------------------------------------------------- */
  function renderHome() {
    const active = state.reports.filter((r) => r.status !== "resolved");
    const count = (cat) => active.filter((r) => r.category === cat).length;
    $("#stat-power-count").textContent = count("power");
    $("#stat-water-count").textContent = count("water");
    $("#stat-road-count").textContent = count("road");
    // "Local services" reflects active reports in the service category
    // (e.g. a pop-up clinic or aid point someone reported). There is no
    // verified-business backend, so nothing else is folded into this number.
    $("#stat-service-count").textContent = count("service");

    const feed = $("#home-feed");
    const recent = [...state.reports]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 6);

    if (recent.length === 0) {
      feed.innerHTML = `<div class="empty-state"><div class="e-icon">📡</div><p>No reports yet. Be the first to report something in your area.</p></div>`;
      return;
    }

    feed.innerHTML = recent
      .map((r) => {
        const meta = PCRMap.CATEGORIES[r.category] || PCRMap.CATEGORIES.other;
        return `<div class="feed-item" data-report-id="${r.id}">
          <div class="feed-icon" style="background:${meta.color}22; color:${meta.color};">${meta.emoji}</div>
          <div class="feed-body">
            <div class="feed-title">${escapeHtml(r.description)}</div>
            <div class="feed-meta">${meta.label.toUpperCase()} · ${timeAgo(r.createdAt)} <span class="status-tag ${r.status}" style="margin-left:6px;">${r.status}</span></div>
          </div>
          <div class="feed-confidence">${r.confidence}%</div>
        </div>`;
      })
      .join("");

    $$(".feed-item", feed).forEach((el) => {
      el.addEventListener("click", () => {
        const r = state.reports.find((x) => x.id === el.dataset.reportId);
        if (r) openDetailSheet(r);
      });
    });
  }

  /* ---------------------------------------------------------------------
     MAP / RADAR VIEW
  --------------------------------------------------------------------- */
  function ensureMap() {
    if (state.mapInitialized) return;
    const center = state.userPos || PCRLocation.FALLBACK;
    PCRMap.init("map", center, { onMarkerClick: openDetailSheet });
    state.mapInitialized = true;
    buildFilterBar();
    PCRMap.render(state.reports);
  }

  function buildFilterBar() {
    const bar = $("#map-filter-bar");
    bar.innerHTML = "";
    Object.entries(PCRMap.CATEGORIES).forEach(([key, meta]) => {
      const chip = document.createElement("button");
      chip.className = "filter-chip on";
      chip.dataset.cat = key;
      chip.innerHTML = `${meta.emoji} ${meta.label}`;
      chip.addEventListener("click", () => {
        const isOn = chip.classList.toggle("on");
        PCRMap.setFilter(key, isOn);
        PCRMap.render(state.reports);
      });
      bar.appendChild(chip);
    });
  }

  function openDetailSheet(report) {
    const meta = PCRMap.CATEGORIES[report.category] || PCRMap.CATEGORIES.other;
    const body = $("#detail-sheet-body");
    body.innerHTML = `
      <div class="report-card">
        <div class="rc-cat">${meta.emoji} ${meta.label}</div>
        <h4>${escapeHtml(report.description)}</h4>
        <div class="rc-row"><span>Status</span><span class="status-tag ${report.status}">${report.status}</span></div>
        <div class="rc-row"><span>Still happening (this device)</span><span>${report.confirmed}×</span></div>
        <div class="rc-row"><span>Marked incorrect (this device)</span><span>${report.reported}×</span></div>
        <div class="rc-row"><span>Updated</span><span>${timeAgo(report.createdAt)}</span></div>
        <div style="margin-top:10px;">
          <div class="rc-row" style="border-top:none; padding-bottom:0;"><span>Confidence (local only)</span><span>${report.confidence}%</span></div>
          <div class="confidence-bar-track"><div class="confidence-bar-fill" style="width:${report.confidence}%;"></div></div>
          <p style="font-size:11px; color:var(--text-faint); margin-top:6px;">This isn't verified by other people yet — Pixel Community Radar doesn't sync between devices.</p>
        </div>
        <div class="rc-actions">
          <button class="confirm" data-action="confirm">✓ Still happening</button>
          <button class="incorrect" data-action="incorrect">✕ Not accurate</button>
          <button class="fixed" data-action="fixed">★ Mark resolved</button>
        </div>
      </div>`;

    $$('[data-action]', body).forEach((btn) => {
      btn.addEventListener("click", () => handleVerification(report.id, btn.dataset.action));
    });

    openSheet("detail-sheet-overlay");
  }

  async function handleVerification(reportId, action) {
    const report = state.reports.find((r) => r.id === reportId);
    if (!report) return;
    if (action === "confirm") {
      report.confirmed += 1;
      toast("Thanks — report confirmed.");
    } else if (action === "incorrect") {
      report.reported += 1;
      toast("Marked as incorrect. Confidence updated.", "warn");
    } else if (action === "fixed") {
      report.status = "resolved";
      toast("Marked as fixed. Great news!");
    }
    const total = report.confirmed + report.reported;
    report.confidence = total > 0 ? Math.round((report.confirmed / total) * 100) : report.confidence;
    if (report.status === "active" && report.confidence < 50) report.status = "monitoring";
    await PCRStorage.putReport(report);
    closeSheet("detail-sheet-overlay");
    renderHome();
    if (state.mapInitialized) PCRMap.render(state.reports);
  }

  /* ---------------------------------------------------------------------
     REPORT CREATION FLOW
  --------------------------------------------------------------------- */
  function renderReportCatGrid(targetId) {
    const grid = $(`#${targetId}`);
    grid.innerHTML = REPORT_CATEGORIES.map((key) => {
      const meta = PCRMap.CATEGORIES[key];
      return `<div class="cat-pick" data-cat="${key}"><span class="cat-emoji">${meta.emoji}</span>${meta.label}</div>`;
    }).join("");

    $$(".cat-pick", grid).forEach((el) => {
      el.addEventListener("click", () => {
        state.selectedCategory = el.dataset.cat;
        $$(".cat-pick", grid).forEach((e) => e.classList.toggle("selected", e === el));
        if (targetId === "sheet-cat-grid") {
          $("#report-form-fields").style.display = "block";
          validateReportForm();
        } else {
          openReportSheet(el.dataset.cat);
        }
      });
    });
  }

  function openReportSheet(preselectCategory) {
    renderReportCatGrid("sheet-cat-grid");
    if (preselectCategory) {
      state.selectedCategory = preselectCategory;
      $$(".cat-pick", $("#sheet-cat-grid")).forEach((e) => e.classList.toggle("selected", e.dataset.cat === preselectCategory));
      $("#report-form-fields").style.display = "block";
    } else {
      $("#report-form-fields").style.display = "none";
    }
    $("#report-description").value = "";
    state.reportPhoto = null;
    $("#photo-upload-label").textContent = "Tap to add a photo";
    const existingImg = $("#photo-upload-zone img");
    if (existingImg) existingImg.remove();
    updateGpsChip();
    validateReportForm();
    openSheet("report-sheet-overlay");
  }

  function updateGpsChip() {
    const chip = $("#report-gps-text");
    if (state.userPos && !state.userPos.denied) {
      chip.textContent = `${state.userPos.lat.toFixed(4)}, ${state.userPos.lng.toFixed(4)}`;
    } else {
      chip.textContent = "Location unavailable — using approximate area";
    }
  }

  function validateReportForm() {
    const desc = $("#report-description").value.trim();
    const btn = $("#submit-report-btn");
    btn.disabled = !(state.selectedCategory && desc.length >= 4);
  }

  async function submitReport() {
    const desc = $("#report-description").value.trim();
    if (!state.selectedCategory || desc.length < 4) return;
    const anon = $("#report-anon-toggle").checked;
    const precise = $("#toggle-precise") ? $("#toggle-precise").checked : true;
    const base = state.userPos || PCRLocation.FALLBACK;
    const coords = PCRLocation.fuzz(base.lat, base.lng, precise);

    // NOTE: this app has no backend, so "submitting" a report always just
    // means writing it to this device's IndexedDB. There is no server to
    // sync to, so we never claim the report reached one.
    const report = {
      id: uid(),
      category: state.selectedCategory,
      description: desc,
      lat: coords.lat,
      lng: coords.lng,
      confirmed: 1,
      reported: 0,
      confidence: 100,
      status: "active",
      createdAt: new Date().toISOString(),
      anonymous: anon,
      photo: state.reportPhoto || null,
    };

    await PCRStorage.putReport(report);
    state.reports.push(report);
    closeSheet("report-sheet-overlay");
    renderHome();
    renderMyReports();
    if (state.mapInitialized) PCRMap.render(state.reports);

    toast("Report saved on this device.");
  }

  function renderMyReports() {
    const el = $("#my-reports-feed");
    if (!el) return;
    const mine = [...state.reports].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (mine.length === 0) {
      el.innerHTML = `<div class="empty-state"><div class="e-icon">🗂</div><p>Reports you file will appear here.</p></div>`;
      return;
    }
    el.innerHTML = mine
      .map((r) => {
        const meta = PCRMap.CATEGORIES[r.category] || PCRMap.CATEGORIES.other;
        return `<div class="feed-item" data-report-id="${r.id}">
          <div class="feed-icon" style="background:${meta.color}22; color:${meta.color};">${meta.emoji}</div>
          <div class="feed-body">
            <div class="feed-title">${escapeHtml(r.description)}</div>
            <div class="feed-meta">${timeAgo(r.createdAt)} <span class="status-tag ${r.status}" style="margin-left:6px;">${r.status}</span></div>
          </div>
        </div>`;
      })
      .join("");
    $$(".feed-item", el).forEach((item) => {
      item.addEventListener("click", () => {
        const r = state.reports.find((x) => x.id === item.dataset.reportId);
        if (r) openDetailSheet(r);
      });
    });
  }

  function handlePhotoUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.reportPhoto = reader.result;
      const zone = $("#photo-upload-zone");
      $("#photo-upload-label").textContent = "Photo attached — tap to replace";
      let img = zone.querySelector("img");
      if (!img) {
        img = document.createElement("img");
        zone.appendChild(img);
      }
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ---------------------------------------------------------------------
     INSIGHTS VIEW
  --------------------------------------------------------------------- */
  // Below this many real reports, a "health score" ratio is more noise than
  // signal — show an honest "not enough data" state instead (see charts.js
  // updateScore).
  const MIN_REPORTS_FOR_SCORE = 3;

  function computeHealthScore() {
    const total = state.reports.length;
    if (total < MIN_REPORTS_FOR_SCORE) return null;
    const resolved = state.reports.filter((r) => r.status === "resolved").length;
    const active = state.reports.filter((r) => r.status === "active").length;
    let score = Math.round(100 - (active / total) * 60 + (resolved / total) * 20);
    score = Math.max(5, Math.min(98, score));
    return score;
  }

  function renderInsights() {
    const hasData = state.reports.length > 0;
    $("#insights-empty-state").style.display = hasData ? "none" : "block";
    $("#insights-charts-wrap").style.display = hasData ? "" : "none";
    if (hasData) {
      const score = computeHealthScore();
      PCRCharts.renderAll(state.reports, score);
    }

    // There is no verified-business backend behind this app, so this
    // directory can only ever be empty right now — that's stated plainly
    // rather than filled with invented listings.
    const dir = $("#biz-directory");
    if (state.businesses.length === 0) {
      dir.innerHTML = `<div class="empty-state"><div class="e-icon">🏪</div><p>No verified businesses yet — this directory isn't populated automatically and needs a real backend/data source to show anything here.</p></div>`;
      return;
    }
    dir.innerHTML = state.businesses
      .map(
        (b) => `<div class="biz-card">
          <div class="biz-icon">${b.icon}</div>
          <div class="biz-body">
            <div class="biz-badge">✓ PIXEL VERIFIED</div>
            <h4>${escapeHtml(b.name)}</h4>
            <div class="biz-dist">${b.distKm.toFixed(1)}km away</div>
            <div class="biz-services">${b.services.map((s) => `<span>${escapeHtml(s)}</span>`).join("")}</div>
          </div>
        </div>`
      )
      .join("");
  }

  /* ---------------------------------------------------------------------
     PROFILE VIEW
  --------------------------------------------------------------------- */
  async function initProfile() {
    let profile = await PCRStorage.getKV("profile");
    if (!profile) {
      profile = { id: uid().slice(-8).toUpperCase(), createdAt: new Date().toISOString(), confirmations: 0 };
      await PCRStorage.setKV("profile", profile);
    }
    state.profile = profile;
    $("#profile-id").textContent = `ID: ${profile.id}`;
    $("#profile-avatar").textContent = "A";

    const settings = (await PCRStorage.getKV("settings")) || { anon: true, precise: true };
    $("#toggle-anon").checked = settings.anon;
    $("#toggle-precise").checked = settings.precise;

    [["toggle-anon", "anon"], ["toggle-precise", "precise"]].forEach(([id, key]) => {
      $(`#${id}`).addEventListener("change", async (e) => {
        const s = (await PCRStorage.getKV("settings")) || {};
        s[key] = e.target.checked;
        await PCRStorage.setKV("settings", s);
      });
    });

    renderProfileStats();
    const usage = await PCRStorage.estimateUsage();
    $("#storage-sub").textContent = usage ? `${(usage / 1024).toFixed(0)} KB used on this device` : "Data stored locally on this device";
  }

  function renderProfileStats() {
    const mine = state.reports;
    $("#profile-reports").textContent = mine.length;
    const confirms = mine.reduce((sum, r) => sum + Math.max(0, r.confirmed - 1), 0);
    $("#profile-confirms").textContent = confirms;
    const trust = mine.length === 0 ? "—" : `${Math.min(99, 60 + mine.length * 4)}%`;
    $("#profile-trust").textContent = trust;
  }

  /* ---------------------------------------------------------------------
     EMERGENCY MODE
  --------------------------------------------------------------------- */
  function openEmergency() {
    openSheet("emergency-sheet-overlay");
    const pos = state.userPos || PCRLocation.FALLBACK;
    $("#emergency-coords").textContent = `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;

    // There's no verified-business backend, so state.businesses is always
    // empty right now — say so honestly rather than pretending a "nearest
    // service" lookup ran.
    if (state.businesses.length) {
      const nearest = state.businesses.reduce((a, b) => (a.distKm < b.distKm ? a : b));
      $("#emergency-nearest").textContent = `${nearest.name} — ${nearest.distKm.toFixed(1)}km away`;
    } else {
      $("#emergency-nearest").textContent = "No verified services directory available yet.";
    }

    // Real, publicly published South African emergency numbers — static
    // reference information, not something this app generates or verifies.
    const contacts = [
      { label: "Local emergency services", number: "10111" },
      { label: "Ambulance", number: "10177" },
    ];
    $("#emergency-contacts").innerHTML = contacts
      .map((c) => `<div class="emergency-contact"><span>${c.label}</span><a href="tel:${c.number.replace(/\s/g, "")}">${c.number}</a></div>`)
      .join("");
  }

  async function shareLocation() {
    const pos = state.userPos || PCRLocation.FALLBACK;
    const link = `https://www.openstreetmap.org/?mlat=${pos.lat}&mlon=${pos.lng}#map=17/${pos.lat}/${pos.lng}`;
    const text = `My current location (shared via Pixel Community Radar): ${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "My location", text, url: link });
        return;
      } catch (e) {
        /* user cancelled or unsupported, fall through to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      toast("Location link copied to clipboard.");
    } catch (e) {
      toast("Could not copy link — long-press to copy manually.", "warn");
    }
  }

  /* ---------------------------------------------------------------------
     SHEETS
  --------------------------------------------------------------------- */
  function openSheet(id) {
    $(`#${id}`).classList.add("open");
  }
  function closeSheet(id) {
    $(`#${id}`).classList.remove("open");
  }

  /* ---------------------------------------------------------------------
     ONLINE / OFFLINE
     There is no backend, so "online" only matters for things that are
     genuinely network-dependent here: loading map tiles and the courtesy
     reverse-geocode lookup in location.js. It does not mean reports get
     uploaded anywhere — nothing in this app talks to a report server, so
     the UI no longer implies otherwise.
  --------------------------------------------------------------------- */
  function updateOnlineUI() {
    state.online = navigator.onLine;
    $("#offline-banner").classList.toggle("show", !state.online);
    const badges = [$("#home-status-badge"), $("#sidebar-status-badge")];
    badges.forEach((b) => {
      if (!b) return;
      b.classList.toggle("offline", !state.online);
      b.innerHTML = state.online ? `<span class="dot"></span> ONLINE` : `<span class="dot"></span> OFFLINE MODE`;
    });
    $("#net-status").textContent = state.online ? "ONLINE" : "OFFLINE";
    $("#net-status").className = state.online ? "ok" : "pending";
  }

  /* ---------------------------------------------------------------------
     PWA INSTALL
  --------------------------------------------------------------------- */
  function setupInstall() {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      state.deferredInstallPrompt = e;
      $("#install-banner").classList.add("show");
      $("#install-sub").textContent = "Tap install for the full app experience";
    });

    const triggerInstall = async () => {
      if (!state.deferredInstallPrompt) {
        toast("Use your browser's 'Add to Home Screen' option to install.");
        return;
      }
      state.deferredInstallPrompt.prompt();
      const choice = await state.deferredInstallPrompt.userChoice;
      if (choice.outcome === "accepted") toast("Installing Pixel Community Radar…");
      state.deferredInstallPrompt = null;
      $("#install-banner").classList.remove("show");
    };

    $("#install-go-btn").addEventListener("click", triggerInstall);
    $("#install-btn-profile").addEventListener("click", triggerInstall);
    $("#install-dismiss-btn").addEventListener("click", () => $("#install-banner").classList.remove("show"));

    window.addEventListener("appinstalled", () => {
      $("#install-banner").classList.remove("show");
      toast("Pixel Community Radar installed.");
    });
  }

  /* ---------------------------------------------------------------------
     LOADING SEQUENCE
  --------------------------------------------------------------------- */
  async function runLoadingSequence() {
    updateOnlineUI();
    const pos = await PCRLocation.requestOnce();
    state.userPos = pos;
    $("#loc-status").textContent = pos.denied ? "APPROXIMATE" : "LOCKED";
    $("#loc-status").className = "ok";

    await loadData();

    $("#home-area-name").textContent = pos.areaName;
    $("#home-coords").textContent = `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;

    setTimeout(() => {
      $("#loading-screen").classList.add("hidden");
    }, 1400);

    PCRLocation.startWatch();
    PCRLocation.onUpdate((p) => {
      state.userPos = p;
      $("#home-coords").textContent = `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;
      if (state.mapInitialized) PCRMap.setUserLocation(p);
    });
  }

  /* ---------------------------------------------------------------------
     EVENT WIRING
  --------------------------------------------------------------------- */
  function wireEvents() {
    $("#fab-report").addEventListener("click", () => openReportSheet(null));
    $$('[data-close-sheet]').forEach((btn) => {
      btn.addEventListener("click", () => closeSheet(btn.dataset.closeSheet));
    });
    $$(".sheet-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.classList.remove("open");
      });
    });

    $("#report-description").addEventListener("input", validateReportForm);
    $("#submit-report-btn").addEventListener("click", submitReport);
    $("#photo-upload-zone").addEventListener("click", () => $("#photo-input").click());
    $("#photo-input").addEventListener("change", (e) => handlePhotoUpload(e.target.files[0]));

    $("#locate-btn").addEventListener("click", () => {
      const pos = state.userPos || PCRLocation.FALLBACK;
      PCRMap.panTo(pos, 15);
    });

    $("#home-emergency-btn").addEventListener("click", openEmergency);
    $("#share-location-btn").addEventListener("click", shareLocation);

    $("#clear-data-btn").addEventListener("click", async () => {
      if (!confirm("Clear all locally cached reports on this device?")) return;
      await PCRStorage.deleteAllReports();
      await loadData();
      if (state.mapInitialized) PCRMap.render(state.reports);
      toast("Local data cleared.");
    });

    window.addEventListener("online", updateOnlineUI);
    window.addEventListener("offline", updateOnlineUI);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && state.view === "profile") renderProfileStats();
    });
  }

  /* ---------------------------------------------------------------------
     BOOT
  --------------------------------------------------------------------- */
  async function boot() {
    buildNav();
    wireEvents();
    setupInstall();
    goToView("home");
    await runLoadingSequence();
    await initProfile();

    if ("serviceWorker" in navigator) {
      try {
        await navigator.serviceWorker.register("service-worker.js");
        // When a new service worker takes control (a fresh deployment
        // finished installing and activating), reload once so this tab
        // actually runs the new code instead of the version it booted
        // with. Guarded so it can only fire once per page load.
        let refreshedOnce = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshedOnce) return;
          refreshedOnce = true;
          window.location.reload();
        });
      } catch (e) {
        console.warn("Service worker registration failed:", e);
      }
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
