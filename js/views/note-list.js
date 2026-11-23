// ノート一覧（基礎知識・気付き）：野菜ごとにまとめて表示、種類で絞り込み・言葉で検索

import * as db from '../db.js';
import { esc } from '../utils.js';
import { KINDS, GENERAL, vegIcons, noteTitle, noteItem } from '../notes.js';

const KIND_KEY = 'garden.noteKind';
function loadKind() {
  try { return localStorage.getItem(KIND_KEY) || 'all'; } catch { return 'all'; }
}
function saveKind(k) {
  try { localStorage.setItem(KIND_KEY, k); } catch { /* 保存できなくても動く */ }
}

export async function render(ctx) {
  const [notes, crops] = await Promise.all([db.listNotes(), db.listCrops()]);
  ctx.setHeader({ title: 'ノート', back: '#/' });
  const icons = vegIcons(crops);
  let kind = loadKind();
  let query = '';

  ctx.el.innerHTML = `
    <div class="seg" role="group" aria-label="ノートの種類">
      <button type="button" data-kind="all" aria-pressed="${kind === 'all'}">すべて</button>
      ${KINDS.map((k) => `<button type="button" data-kind="${k.id}" aria-pressed="${kind === k.id}">${k.emoji} ${k.label}</button>`).join('')}
    </div>
    ${notes.length ? '<input class="input note-search" type="search" placeholder="🔍 言葉で探す" aria-label="ノートを検索">' : ''}
    <div class="note-results"></div>
    <div class="bottom-bar">
      <a class="btn btn-primary" data-act="new" href="#/note/new">＋ ノートを書く</a>
    </div>`;

  const results = ctx.el.querySelector('.note-results');
  const newBtn = ctx.el.querySelector('[data-act="new"]');

  const draw = () => {
    newBtn.href = kind === 'all' ? '#/note/new' : `#/note/new?kind=${kind}`;
    if (!notes.length) {
      results.innerHTML = `
        <div class="welcome">
          <p class="welcome-icon">📖</p>
          <p>育て方の基礎知識や、作業で気付いたことを書き留めておけます。</p>
          <p class="hint">野菜ごとにまとまり、野菜の詳細画面からも開けます。</p>
        </div>`;
      return;
    }
    const q = query.trim().toLowerCase();
    const shown = notes.filter((n) => (kind === 'all' || n.kind === kind)
      && (!q || [noteTitle(n), n.body, n.vegName].some((t) => (t || '').toLowerCase().includes(q))));
    if (!shown.length) {
      results.innerHTML = `<p class="empty-small">${q ? '見つかりませんでした' : 'この種類のノートはまだありません'}</p>`;
      return;
    }
    // 野菜ごとにまとめる（全般を先頭、あとは名前順）
    const groups = new Map();
    shown.forEach((n) => {
      const key = n.vegName || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(n);
    });
    const keys = [...groups.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, 'ja')));
    results.innerHTML = keys.map((key) => {
      const label = key ? `${esc(icons.get(key) || '🌱')} ${esc(key)}` : `${GENERAL.icon} ${GENERAL.label}`;
      return `
        <section class="name-group">
          <h2 class="group-title">${label}<span class="count">${groups.get(key).length}</span></h2>
          <div class="card note-list">${groups.get(key).map((n) => noteItem(n)).join('')}</div>
        </section>`;
    }).join('');
  };

  ctx.el.querySelector('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    kind = b.dataset.kind;
    saveKind(kind);
    ctx.el.querySelectorAll('.seg [data-kind]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  });
  ctx.el.querySelector('.note-search')?.addEventListener('input', (e) => { query = e.target.value; draw(); });

  draw();
}
