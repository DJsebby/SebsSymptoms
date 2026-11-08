// IndexedDB storage. Everything lives on this device only.
// Stores: entries (diary items), photos (image bytes), products (soaps/detergents),
// settings, weather (one summary per day).
//
// The connection is never trusted to stay open: iPhones close a web app's storage
// connection while it sits in the background, and a newer copy of the app can ask for
// it to be closed. Every operation reconnects if needed and retries once.

const DB_NAME = 'sebssymptoms';
const MIN_VERSION = 2;

// Everything the app needs. Upgrades only ever ADD what's missing; data is never removed.
const SCHEMA = {
  entries: { keyPath: 'id', indexes: { day: 'day' } },
  photos: { keyPath: 'id' },
  products: { keyPath: 'id' },
  settings: { keyPath: 'key' },
  weather: { keyPath: 'day' },
};
export const STORES = Object.keys(SCHEMA);

function openRequest(version) {
  return new Promise((resolve, reject) => {
    let req;
    try { req = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME); }
    catch (err) { reject(err); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(SCHEMA)) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: def.keyPath });
        for (const [index, path] of Object.entries(def.indexes || {})) store.createIndex(index, path);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => console.warn('Storage upgrade is waiting for another open copy of the app to close.');
  });
}

async function connect() {
  let db;
  try {
    db = await openRequest(MIN_VERSION);
  } catch (err) {
    if (err?.name !== 'VersionError') throw err;
    db = await openRequest(); // already at a newer version: open it as it is
  }
  if (!STORES.every(s => db.objectStoreNames.contains(s))) {
    const next = db.version + 1; // something is missing: upgrade once to add it
    db.close();
    db = await openRequest(next);
  }
  return db;
}

let current = null; // { promise, db } for the open connection

function getDB() {
  if (!current) {
    const entry = { db: null, promise: null };
    const forget = () => { if (current === entry) current = null; };
    entry.promise = connect().then(db => {
      entry.db = db;
      db.onversionchange = () => { db.close(); forget(); }; // a newer copy of the app is upgrading
      db.onclose = forget; // closed by the browser, e.g. iPhone suspending the app
      return db;
    }, err => { forget(); throw err; });
    current = entry;
  }
  return current.promise;
}

function drop(db) {
  if (current?.db === db) current = null;
  try { db.close(); } catch { /* already closed */ }
}

// Errors that mean "the connection went away", not "the data was bad".
const RETRYABLE = new Set(['InvalidStateError', 'TransactionInactiveError', 'UnknownError', 'AbortError']);

// Runs `work` inside one transaction and resolves only after the transaction has
// committed, so "saved" always means the data is really on disk. `work` queues the
// requests and may return a function that reads the result once everything is done.
// All operations here are safe to repeat, so one retry after reconnecting is harmless.
async function transact(stores, mode, work) {
  for (let attempt = 1; ; attempt++) {
    const db = await getDB();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(stores, mode); // throws if the connection was closed
        const read = work(tx);
        tx.oncomplete = () => resolve(read ? read() : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new DOMException('The save was interrupted.', 'AbortError'));
      });
    } catch (err) {
      if (attempt === 1 && RETRYABLE.has(err?.name)) { drop(db); continue; }
      throw err;
    }
  }
}

export const get = (store, key) => transact(store, 'readonly', tx => {
  const req = tx.objectStore(store).get(key);
  return () => req.result;
});

export const getAll = store => transact(store, 'readonly', tx => {
  const req = tx.objectStore(store).getAll();
  return () => req.result;
});

export const put = (store, value) => transact(store, 'readwrite', tx => { tx.objectStore(store).put(value); });
export const del = (store, key) => transact(store, 'readwrite', tx => { tx.objectStore(store).delete(key); });

export const putMany = (store, values) => transact(store, 'readwrite', tx => {
  const s = tx.objectStore(store);
  for (const v of values) s.put(v);
});

// Several changes that must happen together or not at all.
// ops: [['put', store, value] | ['delete', store, key], ...]
export function write(ops) {
  const stores = [...new Set(ops.map(op => op[1]))];
  return transact(stores, 'readwrite', tx => {
    for (const [op, store, arg] of ops) {
      if (op === 'put') tx.objectStore(store).put(arg);
      else tx.objectStore(store).delete(arg);
    }
  });
}

// Replaces all diary data in one all-or-nothing step (used by restore).
export const replaceAll = ({ entries, products, photos, weather = [] }) =>
  transact(['entries', 'products', 'photos', 'weather'], 'readwrite', tx => {
    const E = tx.objectStore('entries'), P = tx.objectStore('products'), F = tx.objectStore('photos'), W = tx.objectStore('weather');
    E.clear(); P.clear(); F.clear(); W.clear();
    for (const e of entries) E.put(e);
    for (const p of products) P.put(p);
    for (const f of photos) F.put(f);
    for (const w of weather) W.put(w);
  });

export const clearEverything = () => transact(STORES, 'readwrite', tx => {
  for (const s of STORES) tx.objectStore(s).clear();
});
