// ノートを書く・直す
// #/note/new                 新規
// #/note/new?veg=名前&kind=insight&back=#/...   野菜・種類を選んだ状態で新規
// #/note/ID/edit?back=#/...  編集

import * as db from '../db.js';
import { esc, uuid, navigate, toast } from '../utils.js';
import { KINDS, GENERAL, vegIcons, safeBack } from '../notes.js';

export async function render(ctx) {
  const editId = ctx.params.id;
  const [crops, notes] = await Promise.all([db.listCrops(), db.listNotes()]);
  const backParam = safeBack(ctx.query.back);

  let note;
  if (editId) {
    note = notes.find((n) => n.id === editId);
    if (!note) {
      ctx.setHeader({ title: '見つかりません', back: backParam || '#/notes' });
      ctx.el.innerHTML = '<p class="empty">このノートは削除されたようです。</p>';
      return;
    }
  } else {
    note = {
      kind: KINDS.some((k) => k.id === ctx.query.kind) ? ctx.query.kind : 'insight',
      vegName: ctx.query.veg || null,
      title: '',
      body: '',
    };
  }
  const isEdit = !!editId;
  const backHash = backParam || (isEdit ? `#/note/${encodeURIComponent(editId)}` : '#/notes');
  ctx.setHeader({ title: isEdit ? 'ノートを直す' : 'ノートを書く', back: backHash });

  // 野菜の候補：栽培中 → 過去の作付け → ノートで使った名前
  const icons = vegIcons(crops);
  const names = [];
  const add = (n) => { if (n && !names.includes(n)) names.push(n); };
  [...crops].filter((c) => c.status !== 'finished').sort((a, b) => b.createdAt - a.createdAt).forEach((c) => add(c.name));
  [...crops].sort((a, b) => b.createdAt - a.createdAt).forEach((c) => add(c.name));
  notes.forEach((n) => add(n.vegName));
  add(note.vegName);

  const state = { kind: note.kind, vegName: note.vegName || null };

  ctx.el.innerHTML = `
    <form class="form" novalidate>
      <div class="field">
        <span class="label">種類</span>
        <div class="kind-picker">
          ${KINDS.map((k) => `<button type="button" class="kind-opt" data-kind="${k.id}" aria-pressed="${state.kind === k.id}">${k.emoji} ${k.label}</button>`).join('')}
        </div>
      </div>

      <div class="field">
        <span class="label">どの野菜？</span>
        <div class="chip-wrap veg-picker">
          <button type="button" class="chip toggle" data-veg="" aria-pressed="${!state.vegName}">${GENERAL.icon} ${GENERAL.label}</button>
          ${names.map((n) => `<button type="button" class="chip toggle" data-veg="${esc(n)}" aria-pressed="${state.vegName === n}">${esc(icons.get(n) || '🌱')} ${esc(n)}</button>`).join('')}
          <button type="button" class="chip chip-more" data-act="other">＋ ほかの野菜</button>
        </div>
      </div>

      <div class="field">
        <label class="label" for="f-title">題名 <span class="optional">（なければ本文の1行目）</span></label>
        <input id="f-title" class="input" type="text" autocomplete="off" placeholder="例：わき芽かきのコツ" value="${esc(note.title || '')}">
      </div>

      <div class="field">
        <label class="label" for="f-body">内容</label>
        <textarea id="f-body" class="input note-textarea" rows="8" placeholder="育て方のポイント、失敗したこと、来年気をつけることなど">${esc(note.body || '')}</textarea>
      </div>

      <div class="bottom-bar">
        ${isEdit ? '<button type="button" class="btn btn-danger" data-act="delete">削除</button>' : ''}
        <button type="submit" class="btn btn-primary">保存する</button>
      </div>
    </form>`;

  const el = ctx.el;

  el.querySelector('.kind-picker').addEventListener('click', (e) => {
    const b = e.target.closest('.kind-opt');
    if (!b) return;
    state.kind = b.dataset.kind;
    el.querySelectorAll('.kind-opt').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });

  const vegPicker = el.querySelector('.veg-picker');
  const selectVeg = (name) => {
    state.vegName = name || null;
    vegPicker.querySelectorAll('[data-veg]').forEach((x) => x.setAttribute('aria-pressed', String((x.dataset.veg || null) === state.vegName)));
  };
  vegPicker.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="other"]')) {
      const name = (prompt('野菜の名前') || '').trim();
      if (!name) return;
      if (!vegPicker.querySelector(`[data-veg="${CSS.escape(name)}"]`)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip toggle';
        b.dataset.veg = name;
        b.textContent = `🌱 ${name}`;
        e.target.closest('[data-act="other"]').before(b);
      }
      selectVeg(name);
      return;
    }
    const b = e.target.closest('[data-veg]');
    if (b) selectVeg(b.dataset.veg);
  });

  if (isEdit) {
    el.querySelector('[data-act="delete"]').addEventListener('click', async () => {
      if (!confirm('このノートを削除しますか？\n元に戻せません。')) return;
      await db.deleteNote(editId);
      toast('削除しました');
      // 読む画面は消えたので、その画面の戻り先へ
      let target = '#/notes';
      try { target = safeBack(new URLSearchParams((backHash.split('?')[1]) || '').get('back')) || target; } catch { /* そのまま */ }
      navigate(target, { replace: true });
    });
  }

  let saving = false;
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;
    const title = el.querySelector('#f-title').value.trim();
    const body = el.querySelector('#f-body').value.trim();
    if (!title && !body) {
      toast('題名か内容を書いてください');
      el.querySelector('#f-body').focus();
      return;
    }
    saving = true;
    try {
      if (isEdit) {
        await db.saveNote({ ...note, kind: state.kind, vegName: state.vegName, title, body });
        toast('保存しました');
        ctx.goBackOr(backHash);
      } else {
        const saved = await db.saveNote({ id: uuid(), kind: state.kind, vegName: state.vegName, title, body });
        toast('保存しました');
        navigate(`#/note/${encodeURIComponent(saved.id)}${backParam ? `?back=${encodeURIComponent(backParam)}` : ''}`, { replace: true });
      }
    } catch (err) {
      saving = false;
      toast('保存できませんでした：' + err.message);
    }
  });
}
