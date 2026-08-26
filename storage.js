/* Pixel Community Radar — storage.js
   IndexedDB wrapper: reports, businesses, profile, sync queue. */

const PCRStorage = (() => {
  const DB_NAME = "pcr-db";
  const DB_VERSION = 1;
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        // Runs for first-ever open (oldVersion 0) AND for any future version
        // bump. Every branch is additive/idempotent so existing reports,
        // businesses, profile and settings survive an upgrade untouched —
        // only missing stores/indexes get created.
        const db = e.target.result;
        if (!db.objectStoreNames.contains("reports")) {
          const store = db.createObjectStore("reports", { keyPath: "id" });
          store.createIndex("byCategory", "category", { unique: false });
          store.createIndex("bySynced", "synced", { unique: false });
        }
        if (!db.objectStoreNames.contains("businesses")) {
          db.createObjectStore("businesses", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("kv")) {
          db.createObjectStore("kv", { keyPath: "key" });
        }
      };
      req.onblocked = () => {
        // Another tab has an older version of the DB open. Data is safe;
        // this tab just waits rather than corrupting anything.
        console.warn("PCRStorage: DB upgrade blocked by another open tab.");
      };
      req.onsuccess = () => {
        const db = req.result;
        // If another tab/version requests an upgrade later, release our
        // connection cleanly instead of blocking it (and instead of
        // silently keeping a stale connection open).
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(storeName, mode) {
    const db = await openDB();
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  return {
    async putReport(report) {
      const store = await tx("reports", "readwrite");
      return new Promise((resolve, reject) => {
        const req = store.put(report);
        req.onsuccess = () => resolve(report);
        req.onerror = () => reject(req.error);
      });
    },

    async getAllReports() {
      const store = await tx("reports", "readonly");
      return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },

    async getUnsyncedReports() {
      const all = await this.getAllReports();
      return all.filter((r) => !r.synced);
    },

    async markSynced(id) {
      const store = await tx("reports", "readwrite");
      return new Promise((resolve, reject) => {
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const rec = getReq.result;
          if (!rec) return resolve(null);
          rec.synced = true;
          const putReq = store.put(rec);
          putReq.onsuccess = () => resolve(rec);
          putReq.onerror = () => reject(putReq.error);
        };
        getReq.onerror = () => reject(getReq.error);
      });
    },

    async deleteAllReports() {
      const store = await tx("reports", "readwrite");
      return new Promise((resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },

    async putBusinesses(list) {
      const store = await tx("businesses", "readwrite");
      return Promise.all(
        list.map(
          (b) =>
            new Promise((resolve, reject) => {
              const req = store.put(b);
              req.onsuccess = () => resolve();
              req.onerror = () => reject(req.error);
            })
        )
      );
    },

    async getAllBusinesses() {
      const store = await tx("businesses", "readonly");
      return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },

    async setKV(key, value) {
      const store = await tx("kv", "readwrite");
      return new Promise((resolve, reject) => {
        const req = store.put({ key, value });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },

    async getKV(key, fallback = null) {
      const store = await tx("kv", "readonly");
      return new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : fallback);
        req.onerror = () => reject(req.error);
      });
    },

    async estimateUsage() {
      if (navigator.storage && navigator.storage.estimate) {
        try {
          const { usage } = await navigator.storage.estimate();
          return usage || 0;
        } catch (e) {
          return 0;
        }
      }
      return 0;
    },
  };
})();
