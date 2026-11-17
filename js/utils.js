// 共通の小さな関数

export function uuid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// ---- 日付（"YYYY-MM-DD" 文字列で扱う。タイムゾーンのずれを避けるためローカル日付） ----

export function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayStr() {
  return toDateStr(new Date());
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const WEEKDAYS = '日月火水木金土';

// "2026-11-17" → "11月17日(火)"。今年以外は年も付ける
export function formatDate(s, { withYear = false, weekday = true } = {}) {
  if (!s) return '';
  const d = parseDate(s);
  const showYear = withYear || d.getFullYear() !== new Date().getFullYear();
  const y = showYear ? `${d.getFullYear()}年` : '';
  const w = weekday ? `(${WEEKDAYS[d.getDay()]})` : '';
  return `${y}${d.getMonth() + 1}月${d.getDate()}日${w}`;
}

// "2026-11-17" → "11/17"
export function shortDate(s) {
  if (!s) return '';
  const d = parseDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

// ---- HTML ----

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// 画面を切り替えるたびにまとめて解放する Blob URL
let blobUrls = [];
export function blobUrl(blob) {
  const u = URL.createObjectURL(blob);
  blobUrls.push(u);
  return u;
}
export function revokeBlobUrls() {
  blobUrls.forEach((u) => URL.revokeObjectURL(u));
  blobUrls = [];
}

// ---- 画面遷移 ----

export function navigate(hash, { replace = false } = {}) {
  if (replace) location.replace(hash);
  else location.hash = hash;
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---- 作付けの表示 ----

export const AREA_COLORS = ['#4f8a3c', '#d08a2e', '#3b7fb5', '#b0526b', '#7a5bb5', '#2e9c8f', '#8a6d3b', '#c45a3a'];

function sameKind(a, b) {
  return a.name === b.name && (a.variety || '') === (b.variety || '') &&
    a.startedAt.slice(0, 4) === b.startedAt.slice(0, 4);
}

// 同じ年・同じ名前・同じ品種がほかにもあるときだけ「N回目」を出す
export function roundLabel(crop, allCrops) {
  const siblings = allCrops.filter((c) => sameKind(c, crop));
  return siblings.length > 1 ? `${crop.round || 1}回目` : '';
}

export function compareCrops(a, b) {
  return a.name.localeCompare(b.name, 'ja') ||
    (a.variety || '').localeCompare(b.variety || '', 'ja') ||
    a.startedAt.localeCompare(b.startedAt) ||
    (a.round || 1) - (b.round || 1);
}

export function areaChip(area) {
  if (!area) return '<span class="area-chip none">エリア未設定</span>';
  return `<span class="area-chip" style="--area-color:${esc(area.color)}">${esc(area.name)}</span>`;
}
