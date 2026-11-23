// IndexedDB katmanı. Tüm kullanıcı verileri yalnızca bu cihazda saklanır.
const DB_NAME = 'book-stand';
const DB_VERSION = 1;

export const STORES = {
  courses: { keyPath: 'id' },
  books: { keyPath: 'id', indexes: ['courseId'] },
  files: { keyPath: 'id' }, // { id, blob } — PDF dosyalarının kendisi
  ink: { keyPath: 'key', indexes: ['ownerId'] }, // { key, ownerId, page, strokes }
  progress: { keyPath: 'bookId' }, // son kalınan yer
  bookmarks: { keyPath: 'id', indexes: ['bookId'] },
  notebookPages: { keyPath: 'id', indexes: ['courseId'] },
  mistakes: { keyPath: 'id', indexes: ['courseId', 'bookId'] },
  solves: { keyPath: 'id', indexes: ['date', 'courseId', 'bookId'] },
};

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const os = db.createObjectStore(name, { keyPath: def.keyPath });
        for (const idx of def.indexes || []) os.createIndex(idx, idx);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Veritabanı başka bir sekmede açık.'));
  });
  return dbPromise;
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export async function get(name, key) {
  return reqP((await store(name)).get(key));
}

export async function all(name) {
  return reqP((await store(name)).getAll());
}

export async function byIndex(name, index, value) {
  return reqP((await store(name)).index(index).getAll(value));
}

export async function put(name, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite');
    tx.objectStore(name).put(value);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Kayıt iptal edildi'));
  });
}

export async function del(name, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite');
    tx.objectStore(name).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Birden çok depoda tek işlemde yazma/silme. ops: [{store, put}|{store, del}] */
export async function batch(ops) {
  if (!ops.length) return;
  const db = await openDB();
  const names = [...new Set(ops.map((o) => o.store))];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    for (const op of ops) {
      const os = tx.objectStore(op.store);
      if ('put' in op) os.put(op.put);
      else os.delete(op.del);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('İşlem iptal edildi'));
  });
}

export async function clearAll() {
  const db = await openDB();
  const names = Object.keys(STORES);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    for (const n of names) tx.objectStore(n).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
