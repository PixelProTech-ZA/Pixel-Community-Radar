/* Pixel Community Radar — map.js
   Leaflet + OpenStreetMap live community map. */

const PCRMap = (() => {
  const CATEGORIES = {
    power:   { label: "Electricity", emoji: "⚡", color: "#FFB020" },
    water:   { label: "Water",       emoji: "💧", color: "#4D9FFF" },
    road:    { label: "Road damage", emoji: "🚧", color: "#FF7A45" },
    safety:  { label: "Safety alert",emoji: "🚨", color: "#FF4D6D" },
    network: { label: "Network",     emoji: "📶", color: "#7B2FFF" },
    service: { label: "Service",     emoji: "🏥", color: "#00D4AA" },
    waste:   { label: "Waste",       emoji: "🗑", color: "#B08968" },
    place:   { label: "Community place", emoji: "📍", color: "#9E9CB8" },
    other:   { label: "Other", emoji: "❓", color: "#9E9CB8" },
  };

  let map = null;
  let markerLayer = null;
  let userMarker = null;
  let activeFilters = new Set(Object.keys(CATEGORIES));
  let onMarkerClick = null;
  let reportsIndex = new Map();

  function makeDivIcon(category, status) {
    const meta = CATEGORIES[category] || CATEGORIES.place;
    // Resolved reports stay visible (so the map keeps telling the truth
    // about history) but are visually pushed back rather than competing
    // with what's still active.
    const opacity = status === "resolved" ? 0.45 : 1;
    return L.divIcon({
      className: "",
      html: `<div class="pcr-marker" style="background:${meta.color}; opacity:${opacity};"><span>${meta.emoji}</span></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 28],
      popupAnchor: [0, -26],
    });
  }

  function init(elId, center, opts = {}) {
    map = L.map(elId, {
      zoomControl: false,
      attributionControl: true,
      center: [center.lat, center.lng],
      zoom: 14,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    L.control.zoom({ position: "bottomleft" }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);
    onMarkerClick = opts.onMarkerClick || null;
    setUserLocation(center);
    return map;
  }

  function setUserLocation(pos) {
    if (!map) return;
    if (userMarker) {
      userMarker.setLatLng([pos.lat, pos.lng]);
    } else {
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#00D4AA;border:3px solid #0A0A0F;box-shadow:0 0 0 4px rgba(0,212,170,0.35), 0 0 14px rgba(0,212,170,0.6);"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      userMarker = L.marker([pos.lat, pos.lng], { icon, zIndexOffset: 1000 }).addTo(map);
    }
  }

  function panTo(pos, zoom) {
    if (!map) return;
    map.setView([pos.lat, pos.lng], zoom || map.getZoom());
  }

  function render(reports) {
    if (!markerLayer) return;
    markerLayer.clearLayers();
    reportsIndex = new Map();
    reports.forEach((r) => {
      reportsIndex.set(r.id, r);
      if (!activeFilters.has(r.category)) return;
      const marker = L.marker([r.lat, r.lng], { icon: makeDivIcon(r.category, r.status) });
      marker.on("click", () => {
        if (onMarkerClick) onMarkerClick(r);
      });
      marker.addTo(markerLayer);
    });
  }

  function setFilter(category, on) {
    if (on) activeFilters.add(category);
    else activeFilters.delete(category);
  }

  function getFilters() {
    return activeFilters;
  }

  function invalidate() {
    if (map) setTimeout(() => map.invalidateSize(), 60);
  }

  return {
    CATEGORIES,
    init,
    setUserLocation,
    panTo,
    render,
    setFilter,
    getFilters,
    invalidate,
  };
})();
