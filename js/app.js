// 起動と画面切り替え（URL の #/... で表示する画面を決める）

import * as db from './db.js';
import { esc, revokeBlobUrls, navigate } from './utils.js';
import * as cropList from './views/crop-list.js';
import * as cropDetail from './views/crop-detail.js';
import * as cropForm from './views/crop-form.js';
import * as recordForm from './views/record-form.js';
import * as settings from './views/settings.js';

const routes = [
  { re: /^\/$/, view: cropList },
  { re: /^\/crop\/new$/, view: cropForm },
  { re: /^\/crop\/([^/]+)\/edit$/, view: cropForm, keys: ['id'] },
  { re: /^\/crop\/([^/]+)$/, view: cropDetail, keys: ['id'] },
  { re: /^\/record\/new$/, view: recordForm },
  { re: /^\/record\/([^/]+)\/edit$/, view: recordForm, keys: ['id'] },
  { re: /^\/settings$/, view: settings },
];

const main = document.getElementById('main');
const backBtn = document.getElementById('back');
const titleEl = document.getElementById('title');
const actionsEl = document.getElementById('actions');

let renderToken = 0;
let currentHash = null;
let prevHash = null;
const scrollPositions = new Map();

function parseHash() {
  const raw = location.hash.slice(1) || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs)) };
}

// 直前の画面が行き先と同じなら「戻る」、違えば置き換えて移動（履歴に同じ画面が重ならないように）
function goBackOr(hash) {
  if (prevHash === hash) history.back();
  else navigate(hash, { replace: true });
}

function applyHeader({ title = '菜園きろく', back = null, actions = [] }) {
  titleEl.textContent = title;
  document.title = title === '菜園きろく' ? title : `${title} - 菜園きろく`;
  backBtn.hidden = !back;
  backBtn.onclick = back ? () => goBackOr(back) : null;
  actionsEl.innerHTML = actions.map((a) =>
    `<a class="icon-btn" href="${esc(a.href)}" aria-label="${esc(a.label)}">${esc(a.icon)}<span>${esc(a.label)}</span></a>`,
  ).join('');
}

async function route() {
  const token = ++renderToken;
  const hash = location.hash || '#/';
  if (hash !== currentHash) {
    if (currentHash) scrollPositions.set(currentHash, window.scrollY);
    prevHash = currentHash;
    currentHash = hash;
  }
  document.querySelectorAll('.viewer').forEach((v) => v.remove());

  const { path, query } = parseHash();
  let matched = null;
  let params = {};
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) {
      matched = r;
      (r.keys || []).forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      break;
    }
  }

  const el = document.createElement('div');
  el.className = 'view';
  let header = { title: '菜園きろく' };
  const ctx = {
    el, params, query,
    setHeader: (h) => { header = h; },
    refresh: () => route(),
    goBackOr,
    isCurrent: () => token === renderToken,
  };

  if (!matched) {
    header = { title: '見つかりません', back: '#/' };
    el.innerHTML = '<p class="empty">ページが見つかりません。</p>';
  } else {
    try {
      await matched.view.render(ctx);
    } catch (err) {
      console.error(err);
      header = { title: 'エラー', back: '#/' };
      el.innerHTML = `<p class="empty">エラーが起きました：${esc(err.message)}</p>`;
    }
  }

  if (token !== renderToken) return; // 読み込み中に別の画面へ移動した
  revokeBlobUrls();
  applyHeader(header);
  main.replaceChildren(el);
  window.scrollTo(0, scrollPositions.get(hash) || 0);
  if (ctx.afterMount) ctx.afterMount();
}

async function start() {
  try {
    await db.openDB();
    await db.ensureDefaults();
  } catch (err) {
    main.innerHTML = `<p class="empty">データを開けませんでした：${esc(err.message)}<br>プライベートブラウズでは使えない場合があります。</p>`;
    return;
  }
  window.addEventListener('hashchange', route);
  route();

  // データが勝手に消されないよう、永続化をお願いしておく
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then((p) => { if (!p) navigator.storage.persist(); }).catch(() => {});
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service Worker 登録失敗', e));
  }
}

start();
