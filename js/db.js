// IndexedDB storage. Everything lives on this device only.
// Stores: entries (diary items), photos (image bytes), products (soaps/detergents), settings.

const DB_NAME = 'sebssymptoms';
const DB_VERSION = 1;
export const STORES = ['entries', 'photos', 'products', 'settings'];

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        const entries = db.createObjectStore('entries', { keyPath: 'id' });
        entries.createIndex('day', 'day');
        db.createObjectStore('photos', { keyPath: 'id' });
        db.createObjectStore('products', { keyPath: 'id' });
        db.createObjectStore('settings', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Storage is busy — close other copies of the app and retry.'));
    });
  }
  return dbPromise;
}

// Runs one request in its own transaction and resolves only once the transaction
// has committed, so a "saved" message always means the data is really on disk.
async function run(store, mode, makeRequest) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = makeRequest(tx.objectStore(store));
    let result;
    req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || req.error);
    tx.onabort = () => reject(tx.error || new Error('Save was cancelled'));
  });
}

export const get = (store, key) => run(store, 'readonly', s => s.get(key));
export const getAll = store => run(store, 'readonly', s => s.getAll());
export const put = (store, value) => run(store, 'readwrite', s => s.put(value));
export const del = (store, key) => run(store, 'readwrite', s => s.delete(key));

// Replace all diary data in one all-or-nothing transaction (used by restore).
export async function replaceAll({ entries, products, photos }) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['entries', 'products', 'photos'], 'readwrite');
    const E = tx.objectStore('entries'), P = tx.objectStore('products'), F = tx.objectStore('photos');
    E.clear(); P.clear(); F.clear();
    for (const e of entries) E.put(e);
    for (const p of products) P.put(p);
    for (const f of photos) F.put(f);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Restore was cancelled'));
  });
}

export async function clearEverything() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, 'readwrite');
    for (const s of STORES) tx.objectStore(s).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Delete was cancelled'));
  });
}
