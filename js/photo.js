// 撮影した写真を縮小して保存用の Blob にする
// 原寸のままだと1枚数MBになり、端末の保存容量をすぐ使い切るため。

const MAIN_SIZE = 1280; // 長辺(px)
const THUMB_SIZE = 320;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読み込めませんでした')); };
    img.src = url; // 最近のブラウザは EXIF の向きを自動で反映して描画する
  });
}

function resize(img, maxSize, quality) {
  const w0 = img.naturalWidth;
  const h0 = img.naturalHeight;
  const scale = Math.min(1, maxSize / Math.max(w0, h0));
  const w = Math.round(w0 * scale);
  const h = Math.round(h0 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('画像の変換に失敗しました'))),
      'image/jpeg',
      quality,
    );
  });
}

export async function processPhoto(file) {
  const img = await loadImage(file);
  const blob = await resize(img, MAIN_SIZE, 0.82);
  const thumb = await resize(img, THUMB_SIZE, 0.75);
  return { blob, thumb };
}
