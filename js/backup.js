// バックアップの書き出し・読み込み
// サーバーがないので、機種変更や Safari のデータ削除に備えて JSON ファイルに丸ごと書き出す。

import * as db from './db.js';
import { toDateStr } from './utils.js';

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataURLToBlob(url) {
  const res = await fetch(url);
  return res.blob();
}

export async function exportBackup() {
  const [areas, crops, records, photos, notes] = await Promise.all([
    db.listAreas(), db.listCrops(), db.listRecords(), db.listPhotos(), db.listNotes(),
  ]);
  const photosOut = [];
  for (const p of photos) {
    photosOut.push({ ...p, blob: await blobToDataURL(p.blob), thumb: await blobToDataURL(p.thumb) });
  }
  const data = {
    app: 'garden-app',
    version: 2,
    exportedAt: new Date().toISOString(),
    areas, crops, records, notes, photos: photosOut,
  };
  const file = new File(
    [JSON.stringify(data)],
    `garden-backup-${toDateStr(new Date())}.json`,
    { type: 'application/json' },
  );
  return { file, counts: { crops: crops.length, records: records.length, notes: notes.length, photos: photos.length } };
}

// iPhone では共有シート（「ファイルに保存」など）、それ以外はダウンロード
export async function saveFile(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
      // 共有に失敗したらダウンロードにする
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

// 同じ id のデータは上書き、それ以外は追加（今のデータは消さない）
export async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('バックアップファイルを読めませんでした');
  }
  if (data.app !== 'garden-app' || !Array.isArray(data.crops)) {
    throw new Error('このアプリのバックアップファイルではありません');
  }
  // Blob への変換はトランザクションの外で済ませておく
  const photos = [];
  for (const p of data.photos || []) {
    photos.push({ ...p, blob: await dataURLToBlob(p.blob), thumb: await dataURLToBlob(p.thumb) });
  }
  await db.putMany({
    areas: data.areas || [],
    crops: data.crops || [],
    records: data.records || [],
    notes: data.notes || [],
    photos,
  });
  return {
    crops: data.crops.length, records: (data.records || []).length,
    notes: (data.notes || []).length, photos: photos.length,
  };
}
