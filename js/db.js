// IndexedDB の読み書き
// ストア: areas（エリア）/ crops（作付け）/ records（記録）/ photos（写真）/ meta（設定・初期化フラグ）

import { uuid, AREA_COLORS } from './utils.js';

const DB_NAME = 'garden-app';
const DB_VERSION = 1;

let dbPromise;

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        // 将来ストアを足すときは if (e.oldVersion < 2) { ... } を追加する
        if (e.oldVersion < 1) {
          db.createObjectStore('areas', { keyPath: 'id' });

          const crops = db.createObjectStore('crops', { keyPath: 'id' });
          crops.createIndex('status', 'status');
          crops.createIndex('areaId', 'areaId');
          crops.createIndex('name', 'name');

          const records = db.createObjectStore('records', { keyPath: 'id' });
          records.createIndex('cropIds', 'cropIds', { multiEntry: true });
          records.createIndex('date', 'date');

          const photos = db.createObjectStore('photos', { keyPath: 'id' });
          photos.createIndex('recordId', 'recordId');

          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('ほかのタブでアプリが開かれています。閉じてから再読み込みしてください。'));
    });
  }
  return dbPromise;
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// トランザクションを1つ開き、完了したら fn の戻り値を返す
async function run(storeNames, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    let p;
    try {
      p = Promise.resolve(fn(tx)); // 同期的に呼ぶ（トランザクションが有効なうちにリクエストを出すため）
    } catch (err) {
      p = Promise.reject(err);
    }
    p.then((r) => { result = r; })
      .catch((err) => { try { tx.abort(); } catch { /* 既に終了 */ } reject(err); });
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('保存を中断しました'));
  });
}

const getAll = (store) => run([store], 'readonly', (tx) => reqP(tx.objectStore(store).getAll()));
const getOne = (store, id) => run([store], 'readonly', (tx) => reqP(tx.objectStore(store).get(id)));
const putOne = (store, obj) => run([store], 'readwrite', (tx) => { tx.objectStore(store).put(obj); return obj; });

// ---- meta ----

export async function getMeta(key) {
  const row = await getOne('meta', key);
  return row ? row.value : undefined;
}

export function setMeta(key, value) {
  return putOne('meta', { key, value });
}

// 初回起動時だけ仮のエリアを作る
export function ensureDefaults() {
  return run(['meta', 'areas'], 'readwrite', async (tx) => {
    const done = await reqP(tx.objectStore('meta').get('initialized'));
    if (done) return;
    const now = Date.now();
    ['エリア1', 'エリア2', 'エリア3'].forEach((name, i) => {
      tx.objectStore('areas').put({
        id: uuid(), name, color: AREA_COLORS[i], sortOrder: i, createdAt: now, updatedAt: now,
      });
    });
    tx.objectStore('meta').put({ key: 'initialized', value: true });
  });
}

// ---- areas ----

export async function listAreas() {
  const areas = await getAll('areas');
  return areas.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function saveArea(area) {
  const now = Date.now();
  return putOne('areas', { ...area, createdAt: area.createdAt ?? now, updatedAt: now });
}

export function saveAreas(areas) {
  const now = Date.now();
  return run(['areas'], 'readwrite', (tx) => {
    areas.forEach((a) => tx.objectStore('areas').put({ ...a, updatedAt: now }));
  });
}

// エリアを消しても作付けは残し、エリア未設定にする
export function deleteArea(id) {
  return run(['areas', 'crops'], 'readwrite', async (tx) => {
    tx.objectStore('areas').delete(id);
    const crops = await reqP(tx.objectStore('crops').index('areaId').getAll(id));
    crops.forEach((c) => tx.objectStore('crops').put({ ...c, areaId: null }));
  });
}

// ---- crops ----

export const listCrops = () => getAll('crops');
export const getCrop = (id) => getOne('crops', id);

export function saveCrop(crop) {
  const now = Date.now();
  return putOne('crops', { ...crop, createdAt: crop.createdAt ?? now, updatedAt: now });
}

// 同じ年・名前・品種の作付けのうち何回目か
export async function nextRound({ name, variety, startedAt }) {
  const crops = await listCrops();
  const year = startedAt.slice(0, 4);
  const max = crops
    .filter((c) => c.name === name && (c.variety || '') === (variety || '') && c.startedAt.slice(0, 4) === year)
    .reduce((m, c) => Math.max(m, c.round || 1), 0);
  return max + 1;
}

// 作付けを消すと、その作付けだけの記録と写真も消す（ほかの野菜と一緒の記録は残す）
export function deleteCrop(id) {
  return run(['crops', 'records', 'photos'], 'readwrite', async (tx) => {
    const rs = tx.objectStore('records');
    const ps = tx.objectStore('photos');
    tx.objectStore('crops').delete(id);
    const recs = await reqP(rs.index('cropIds').getAll(id));
    for (const r of recs) {
      if (r.cropIds.length <= 1) {
        rs.delete(r.id);
        (r.photoIds || []).forEach((pid) => ps.delete(pid));
      } else {
        rs.put({ ...r, cropIds: r.cropIds.filter((c) => c !== id) });
      }
    }
  });
}

// ---- records ----

export function sortRecords(records) {
  return records.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

export const listRecords = () => getAll('records');
export const getRecord = (id) => getOne('records', id);

export async function listRecordsByCrop(cropId) {
  const recs = await run(['records'], 'readonly',
    (tx) => reqP(tx.objectStore('records').index('cropIds').getAll(cropId)));
  return sortRecords(recs);
}

// newPhotos: [{ blob, thumb }] / removedPhotoIds: 消す写真の id
export function saveRecord(record, { newPhotos = [], removedPhotoIds = [] } = {}) {
  const now = Date.now();
  const rec = { ...record, createdAt: record.createdAt ?? now, updatedAt: now };
  return run(['records', 'photos'], 'readwrite', (tx) => {
    const ps = tx.objectStore('photos');
    removedPhotoIds.forEach((pid) => ps.delete(pid));
    const ids = (rec.photoIds || []).filter((pid) => !removedPhotoIds.includes(pid));
    newPhotos.forEach((p) => {
      const pid = uuid();
      ps.put({ id: pid, recordId: rec.id, blob: p.blob, thumb: p.thumb, createdAt: now });
      ids.push(pid);
    });
    rec.photoIds = ids;
    tx.objectStore('records').put(rec);
    return rec;
  });
}

export function deleteRecord(id) {
  return run(['records', 'photos'], 'readwrite', async (tx) => {
    const r = await reqP(tx.objectStore('records').get(id));
    if (!r) return;
    tx.objectStore('records').delete(id);
    (r.photoIds || []).forEach((pid) => tx.objectStore('photos').delete(pid));
  });
}

// ---- photos ----

export const getPhoto = (id) => getOne('photos', id);
export const listPhotos = () => getAll('photos');

// ---- バックアップ復元用：まとめて書き込む ----

export function putMany({ areas = [], crops = [], records = [], photos = [] }) {
  return run(['areas', 'crops', 'records', 'photos', 'meta'], 'readwrite', (tx) => {
    areas.forEach((x) => tx.objectStore('areas').put(x));
    crops.forEach((x) => tx.objectStore('crops').put(x));
    records.forEach((x) => tx.objectStore('records').put(x));
    photos.forEach((x) => tx.objectStore('photos').put(x));
    tx.objectStore('meta').put({ key: 'initialized', value: true });
  });
}
