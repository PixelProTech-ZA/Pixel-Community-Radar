/* Pixel Community Radar — charts.js
   Chart.js analytics: activity, timeline, category breakdown, health score. */

const PCRCharts = (() => {
  let activityChart = null;
  let timelineChart = null;
  let categoryChart = null;

  const FONT = "Inter, sans-serif";
  const GRID_COLOR = "rgba(255,255,255,0.06)";
  const TEXT_DIM = "#9E9CB8";

  Chart.defaults.font.family = FONT;
  Chart.defaults.color = TEXT_DIM;

  function dayLabels(n) {
    const out = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      out.push(d.toLocaleDateString(undefined, { weekday: "short" }));
    }
    return out;
  }

  function bucketByDay(reports, n) {
    const now = new Date();
    const buckets = new Array(n).fill(0);
    reports.forEach((r) => {
      const created = new Date(r.createdAt);
      const diffDays = Math.floor((now - created) / 86400000);
      if (diffDays >= 0 && diffDays < n) {
        buckets[n - 1 - diffDays] += 1;
      }
    });
    return buckets;
  }

  function renderActivity(reports) {
    const ctx = document.getElementById("chart-activity");
    if (!ctx) return;
    const labels = dayLabels(7);
    const data = bucketByDay(reports, 7);
    if (activityChart) activityChart.destroy();
    activityChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Reports",
            data,
            backgroundColor: (context) => {
              const { ctx: c, chartArea } = context.chart;
              if (!chartArea) return "#7B2FFF";
              const g = c.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
              g.addColorStop(0, "#7B2FFF");
              g.addColorStop(1, "#00D4AA");
              return g;
            },
            borderRadius: 6,
            maxBarThickness: 26,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: TEXT_DIM, font: { size: 10 } } },
          y: { beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: TEXT_DIM, font: { size: 10 }, precision: 0 } },
        },
      },
    });
  }

  function renderTimeline(reports) {
    const ctx = document.getElementById("chart-timeline");
    if (!ctx) return;
    const labels = dayLabels(14);
    const data = bucketByDay(reports, 14);
    // cumulative
    let running = 0;
    const cumulative = data.map((v) => (running += v));
    if (timelineChart) timelineChart.destroy();
    timelineChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Cumulative reports",
            data: cumulative,
            borderColor: "#00D4AA",
            backgroundColor: "rgba(0,212,170,0.12)",
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: TEXT_DIM, font: { size: 9 }, maxTicksLimit: 7 } },
          y: { beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: TEXT_DIM, font: { size: 10 }, precision: 0 } },
        },
      },
    });
  }

  function renderCategory(reports) {
    const ctx = document.getElementById("chart-category");
    if (!ctx) return;
    const cats = ["power", "water", "road", "safety", "network", "service", "waste"];
    const colors = { power: "#FFB020", water: "#4D9FFF", road: "#FF7A45", safety: "#FF4D6D", network: "#7B2FFF", service: "#00D4AA", waste: "#B08968" };
    const counts = cats.map((c) => reports.filter((r) => r.category === c).length);
    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: cats.map((c) => c[0].toUpperCase() + c.slice(1)),
        datasets: [
          {
            data: counts,
            backgroundColor: cats.map((c) => colors[c]),
            borderColor: "#1A1A2E",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: {
          legend: { position: "bottom", labels: { color: TEXT_DIM, font: { size: 10 }, boxWidth: 8, padding: 10 } },
        },
      },
    });
  }

  function updateScore(score) {
    const circumference = 2 * Math.PI * 42;
    const ring = document.getElementById("score-ring-fg");
    const valueEl = document.getElementById("score-value");
    const titleEl = document.getElementById("score-title");
    const statusEl = document.getElementById("score-status-text");
    if (!ring) return;
    const offset = circumference - (score / 100) * circumference;
    ring.style.strokeDasharray = `${circumference}`;
    requestAnimationFrame(() => {
      ring.style.strokeDashoffset = `${offset}`;
    });
    valueEl.textContent = `${score}`;
    let status = "Stable";
    if (score >= 80) status = "Improving";
    else if (score < 50) status = "Needs attention";
    titleEl.textContent = `${score}/100`;
    statusEl.textContent = `STATUS: ${status}`;
  }

  function renderAll(reports, score) {
    renderActivity(reports);
    renderTimeline(reports);
    renderCategory(reports);
    updateScore(score);
  }

  return { renderAll };
})();
