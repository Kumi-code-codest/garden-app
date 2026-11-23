// ノートを読む

import * as db from '../db.js';
import { esc, formatDate, toDateStr } from '../utils.js';
import { KIND_MAP, KINDS, GENERAL, vegIcons, noteTitle, safeBack } from '../notes.js';

export async function render(ctx) {
  const id = ctx.params.id;
  const back = safeBack(ctx.query.back) || '#/notes';
  const [note, crops] = await Promise.all([db.getNote(id), db.listCrops()]);
  if (!note) {
    ctx.setHeader({ title: '見つかりません', back });
    ctx.el.innerHTML = '<p class="empty">このノートは削除されたようです。</p>';
    return;
  }
  const selfHash = location.hash;
  ctx.setHeader({
    title: noteTitle(note),
    back,
    actions: [{ href: `#/note/${encodeURIComponent(id)}/edit?back=${encodeURIComponent(selfHash)}`, icon: '✏️', label: '編集' }],
  });
  const k = KIND_MAP[note.kind] || KINDS[0];
  const veg = note.vegName
    ? `${esc(vegIcons(crops).get(note.vegName) || '🌱')} ${esc(note.vegName)}`
    : `${GENERAL.icon} ${GENERAL.label}`;
  const d = (ts) => formatDate(toDateStr(new Date(ts)), { weekday: false });

  ctx.el.innerHTML = `
    <article class="card note-full">
      <div class="note-tags"><span class="badge">${k.emoji} ${k.label}</span> <span class="note-veg">${veg}</span></div>
      <h2 class="note-heading">${esc(noteTitle(note))}</h2>
      ${note.body ? `<div class="note-body">${esc(note.body)}</div>` : ''}
      <p class="hint">書いた日 ${d(note.createdAt)}${note.updatedAt - note.createdAt > 60000 ? ` ・ 直した日 ${d(note.updatedAt)}` : ''}</p>
    </article>`;
}
