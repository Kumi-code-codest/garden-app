// ノート（基礎知識・気付き）の共通部品

import { esc, toDateStr, formatDate } from './utils.js';

export const KINDS = [
  { id: 'basic', label: '基礎知識', emoji: '📘' },
  { id: 'insight', label: '気付き', emoji: '💡' },
];
export const KIND_MAP = Object.fromEntries(KINDS.map((k) => [k.id, k]));

// 野菜を決めないノートの見出し
export const GENERAL = { label: '全般', icon: '📒' };

// 野菜名 → アイコン（いちばん新しい作付けのもの）
export function vegIcons(crops) {
  const m = new Map();
  [...crops].sort((a, b) => a.createdAt - b.createdAt).forEach((c) => m.set(c.name, c.icon));
  return m;
}

// 題名がなければ本文の1行目を題名にする
export function noteTitle(n) {
  if (n.title) return n.title;
  const first = (n.body || '').split('\n').find((l) => l.trim());
  return first ? first.trim().slice(0, 40) : '（無題）';
}

export function noteExcerpt(n) {
  if (!n.title) return ''; // 1行目を題名にしたときは重複するので出さない
  return (n.body || '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

export const noteDate = (n) => formatDate(toDateStr(new Date(n.updatedAt)), { weekday: false });

// 戻り先として使ってよいハッシュか
export const safeBack = (s) => (s && s.startsWith('#/') ? s : null);

// 一覧や詳細画面で使う1行分
export function noteItem(n, { back } = {}) {
  const k = KIND_MAP[n.kind] || KINDS[0];
  const ex = noteExcerpt(n);
  const href = `#/note/${encodeURIComponent(n.id)}${back ? `?back=${encodeURIComponent(back)}` : ''}`;
  return `
    <a class="note-item" href="${href}">
      <span class="note-kind" title="${k.label}">${k.emoji}</span>
      <span class="note-main">
        <span class="note-title">${esc(noteTitle(n))}</span>
        ${ex ? `<span class="note-ex">${esc(ex)}</span>` : ''}
      </span>
      <span class="note-date">${noteDate(n)}</span>
    </a>`;
}
