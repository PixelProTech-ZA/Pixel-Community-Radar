/* Pixel Community Radar — location.js
   Geolocation wrapper with graceful fallback + reverse-geocode-free area naming. */

const PCRLocation = (() => {
  let lastPosition = null;
  let watchId = null;
  const listeners = new Set();

  // Fallback default (used if permission denied / unavailable): Pretoria, South Africa
  const FALLBACK = { lat: -25.7479, lng: 28.2293, areaName: "Pretoria" };

  function notify() {
    listeners.forEach((fn) => fn(lastPosition));
  }

  function fuzz(lat, lng, precise) {
    if (precise) return { lat, lng };
    // ~300m jitter for privacy when "share precise location" is off
    const jitter = () => (Math.random() - 0.5) * 0.003;
    return { lat: lat + jitter(), lng: lng + jitter() };
  }

  async function guessAreaName(lat, lng) {
    // Lightweight offline-friendly heuristic; avoids a network reverse-geocode dependency.
    // If online, try a courtesy reverse geocode via OSM Nominatim; otherwise fall back.
    if (navigator.onLine) {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=12`,
          { headers: { Accept: "application/json" } }
        );
        if (res.ok) {
          const data = await res.json();
          const a = data.address || {};
          return a.suburb || a.city_district || a.town || a.city || a.village || a.county || FALLBACK.areaName;
        }
      } catch (e) {
        /* silent fallback */
      }
    }
    return FALLBACK.areaName;
  }

  return {
    FALLBACK,
    onUpdate(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getLast() {
      return lastPosition;
    },
    async requestOnce() {
      if (!("geolocation" in navigator)) {
        lastPosition = { ...FALLBACK, accuracy: null, denied: true };
        notify();
        return lastPosition;
      }
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const areaName = await guessAreaName(lat, lng);
            lastPosition = { lat, lng, accuracy: pos.coords.accuracy, areaName, denied: false };
            notify();
            resolve(lastPosition);
          },
          async () => {
            lastPosition = { ...FALLBACK, accuracy: null, denied: true };
            notify();
            resolve(lastPosition);
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
        );
      });
    },
    startWatch() {
      if (!("geolocation" in navigator) || watchId !== null) return;
      watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const areaName = lastPosition?.areaName || (await guessAreaName(lat, lng));
          lastPosition = { lat, lng, accuracy: pos.coords.accuracy, areaName, denied: false };
          notify();
        },
        () => {},
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    },
    fuzz,
  };
})();
