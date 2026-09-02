// 本地 IndexedDB 封装 —— 数据存你自己的浏览器，终身归属你
const DB_NAME = 'knowledge-app-db'
const STORES = ['bases', 'points', 'raws', 'links', 'media']

let dbPromise = null
function open() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

let onChange = null
export function setOnChange(fn) { onChange = fn }

function run(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    req.onsuccess = () => {
      if (mode === 'readwrite' && onChange) onChange()
      resolve(req.result)
    }
    req.onerror = () => reject(req.error)
  }))
}

export const all = (store) => run(store, 'readonly', s => s.getAll())
export const get = (store, id) => run(store, 'readonly', s => s.get(id))
export const put = (store, row) => run(store, 'readwrite', s => s.put(row))
export const del = (store, id) => run(store, 'readwrite', s => s.delete(id))
