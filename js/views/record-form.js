// ③ 記録する（スタンプ・写真・メモ）
// #/record/new?crop=ID   その作付けの記録
// #/record/new           まとめて記録（野菜を選ぶ）
// #/record/ID/edit       記録の編集

import * as db from '../db.js';
import { esc, uuid, todayStr, roundLabel, compareCrops, blobUrl, toast } from '../utils.js';
import { STAMPS } from '../stamps.js';
import { processPhoto } from '../photo.js';

const STAMP_ROWS = [
  { label: '', cats: ['work'] },
  { label: '様子・天気', cats: ['observe', 'weather'] },
];

export async function render(ctx) {
  const editId = ctx.params.id;
  const [areas, crops, record] = await Promise.all([
    db.listAreas(), db.listCrops(), editId ? db.getRecord(editId) : null,
  ]);
  const fromCrop = ctx.query.crop || null;
  const backHash = fromCrop ? `#/crop/${fromCrop}` : '#/';

  if (editId && !record) {
    ctx.setHeader({ title: '見つかりません', back: backHash });
    ctx.el.innerHTML = '<p class="empty">この記録は削除されたようです。</p>';
    return;
  }
  const isEdit = !!editId;
  const isBulk = !isEdit && !fromCrop;
  ctx.setHeader({ title: isEdit ? '記録を編集' : (isBulk ? 'まとめて記録' : '記録する'), back: backHash });

  const state = {
    date: record?.date || todayStr(),
    cropIds: new Set(record?.cropIds || (fromCrop ? [fromCrop] : [])),
    stamps: new Set(record?.stamps || []),
    memo: record?.memo || '',
    keptPhotoIds: [...(record?.photoIds || [])],
    removedPhotoIds: [],
    newPhotos: [], // { blob, thumb, url }
  };

  const cropMap = new Map(crops.map((c) => [c.id, c]));
  const areaIds = new Set(areas.map((a) => a.id));
  // 選べる野菜：栽培中のもの＋すでに選ばれているもの
  const candidates = crops
    .filter((c) => c.status !== 'finished' || state.cropIds.has(c.id))
    .sort(compareCrops);
  const groups = areas.map((a) => ({ area: a, crops: candidates.filter((c) => c.areaId === a.id) }));
  groups.push({ area: null, crops: candidates.filter((c) => !areaIds.has(c.areaId)) });

  const cropChip = (c) => {
    const rl = roundLabel(c, crops);
    const sub = [c.variety, rl].filter(Boolean).join(' ');
    return `<button type="button" class="chip toggle crop-chip" data-crop="${esc(c.id)}" aria-pressed="${state.cropIds.has(c.id)}">
      ${esc(c.icon)} ${esc(c.name)}${sub ? ` <small>${esc(sub)}</small>` : ''}</button>`;
  };

  // 作業 / 様子・天気 の2段に分けてスタンプを並べる（病害虫・晴れ・雨で1行）
  const stampSections = STAMP_ROWS.map(({ label, cats }) => {
    const list = STAMPS.filter((s) => cats.includes(s.category));
    return `
      ${label ? `<p class="stamp-cat">${label}</p>` : ''}
      <div class="stamp-grid">
        ${list.map((s) => `
          <button type="button" class="stamp cat-${s.category}" data-stamp="${s.id}" aria-pressed="${state.stamps.has(s.id)}">
            <span class="stamp-emoji">${s.emoji}</span><span class="stamp-label">${s.label}</span>
          </button>`).join('')}
      </div>`;
  }).join('');

  ctx.el.innerHTML = `
    <form class="form" novalidate>
      <div class="field">
        <span class="label">野菜</span>
        <div class="target-summary"></div>
        <button type="button" class="btn btn-ghost" data-act="toggle-picker">${isBulk ? '' : 'ほかの野菜も選ぶ ▾'}</button>
        <div class="crop-picker" ${isBulk ? '' : 'hidden'}>
          ${groups.filter((g) => g.crops.length).map((g) => `
            <div class="picker-group" style="--area-color:${esc(g.area ? g.area.color : '#999')}">
              <div class="picker-head">
                <span><span class="area-dot"></span>${esc(g.area ? g.area.name : 'エリア未設定')}</span>
                <button type="button" class="btn-small" data-all="${esc(g.area ? g.area.id : '')}">全部</button>
              </div>
              <div class="chip-wrap">${g.crops.map(cropChip).join('')}</div>
            </div>`).join('') || '<p class="empty-small">栽培中の野菜がありません</p>'}
        </div>
      </div>

      <div class="field">
        <span class="label">したこと・様子</span>
        ${stampSections}
      </div>

      <div class="field">
        <span class="label">写真</span>
        <div class="photo-btns">
          <label class="btn">📷 撮る<input type="file" accept="image/*" capture="environment" data-photo-input hidden></label>
          <label class="btn">🖼️ アルバム<input type="file" accept="image/*" multiple data-photo-input hidden></label>
        </div>
        <div class="photo-previews"></div>
      </div>

      <div class="field">
        <label class="label" for="f-memo">メモ <span class="optional">（任意）</span></label>
        <textarea id="f-memo" class="input" rows="3" placeholder="気づいたこと、収穫量など">${esc(state.memo)}</textarea>
      </div>

      <div class="field">
        <label class="label" for="f-date">日付</label>
        <input id="f-date" class="input" type="date" value="${esc(state.date)}" required>
      </div>

      <div class="bottom-bar">
        ${isEdit ? '<button type="button" class="btn btn-danger" data-act="delete">削除</button>' : ''}
        <button type="submit" class="btn btn-primary">保存する</button>
      </div>
    </form>`;

  const el = ctx.el;
  const summary = el.querySelector('.target-summary');
  const picker = el.querySelector('.crop-picker');
  const toggleBtn = el.querySelector('[data-act="toggle-picker"]');
  const previews = el.querySelector('.photo-previews');
  if (isBulk) toggleBtn.hidden = true;

  const drawSummary = () => {
    const selected = [...state.cropIds].map((id) => cropMap.get(id)).filter(Boolean);
    summary.innerHTML = selected.length
      ? selected.map((c) => `<span class="target-chip">${esc(c.icon)} ${esc(c.name)}${c.variety ? ` <small>${esc(c.variety)}</small>` : ''}</span>`).join('')
      : '<span class="hint">↓ 記録する野菜を選んでください</span>';
    picker.querySelectorAll('.crop-chip').forEach((b) => b.setAttribute('aria-pressed', String(state.cropIds.has(b.dataset.crop))));
  };
  drawSummary();

  toggleBtn.addEventListener('click', () => {
    picker.hidden = !picker.hidden;
    toggleBtn.textContent = picker.hidden ? 'ほかの野菜も選ぶ ▾' : '閉じる ▴';
  });

  picker.addEventListener('click', (e) => {
    const chip = e.target.closest('.crop-chip');
    if (chip) {
      const id = chip.dataset.crop;
      if (state.cropIds.has(id)) state.cropIds.delete(id); else state.cropIds.add(id);
      drawSummary();
      return;
    }
    const all = e.target.closest('[data-all]');
    if (all) {
      const ids = [...all.closest('.picker-group').querySelectorAll('.crop-chip')].map((b) => b.dataset.crop);
      const allOn = ids.every((id) => state.cropIds.has(id));
      ids.forEach((id) => (allOn ? state.cropIds.delete(id) : state.cropIds.add(id)));
      drawSummary();
    }
  });

  el.querySelectorAll('.stamp').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.dataset.stamp;
      if (state.stamps.has(id)) state.stamps.delete(id); else state.stamps.add(id);
      b.setAttribute('aria-pressed', String(state.stamps.has(id)));
    });
  });

  // ---- 写真 ----
  const drawPhotos = () => {
    previews.innerHTML =
      state.keptPhotoIds.map((pid) => `
        <div class="preview"><img data-photo="${esc(pid)}" alt=""><button type="button" class="preview-del" data-del-old="${esc(pid)}" aria-label="写真を外す">✕</button></div>`).join('') +
      state.newPhotos.map((p, i) => `
        <div class="preview"><img src="${p.url}" alt=""><button type="button" class="preview-del" data-del-new="${i}" aria-label="写真を外す">✕</button></div>`).join('');
    previews.querySelectorAll('img[data-photo]').forEach((img) => {
      db.getPhoto(img.dataset.photo).then((p) => { if (p && ctx.isCurrent()) img.src = blobUrl(p.thumb); });
    });
  };
  drawPhotos();

  previews.addEventListener('click', (e) => {
    const oldBtn = e.target.closest('[data-del-old]');
    if (oldBtn) {
      const pid = oldBtn.dataset.delOld;
      state.keptPhotoIds = state.keptPhotoIds.filter((x) => x !== pid);
      state.removedPhotoIds.push(pid);
      drawPhotos();
      return;
    }
    const newBtn = e.target.closest('[data-del-new]');
    if (newBtn) {
      state.newPhotos.splice(Number(newBtn.dataset.delNew), 1);
      drawPhotos();
    }
  });

  let processing = 0;
  el.querySelectorAll('[data-photo-input]').forEach((input) => {
    input.addEventListener('change', async () => {
      const files = [...input.files];
      input.value = '';
      for (const f of files) {
        processing++;
        try {
          const p = await processPhoto(f);
          state.newPhotos.push({ ...p, url: blobUrl(p.thumb) });
          if (ctx.isCurrent()) drawPhotos();
        } catch (err) {
          toast(err.message);
        } finally {
          processing--;
        }
      }
    });
  });

  // ---- 削除 ----
  if (isEdit) {
    el.querySelector('[data-act="delete"]').addEventListener('click', async () => {
      if (!confirm('この記録を削除しますか？\n（写真も削除されます。元に戻せません）')) return;
      await db.deleteRecord(editId);
      toast('削除しました');
      ctx.goBackOr(backHash);
    });
  }

  // ---- 保存 ----
  let saving = false;
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;
    if (processing > 0) { toast('写真を準備中です。少し待ってください'); return; }
    const memo = el.querySelector('#f-memo').value.trim();
    const date = el.querySelector('#f-date').value || todayStr();
    if (state.cropIds.size === 0) {
      toast('野菜を選んでください');
      picker.hidden = false;
      return;
    }
    if (state.stamps.size === 0 && !memo && state.newPhotos.length === 0 && state.keptPhotoIds.length === 0) {
      toast('スタンプ・写真・メモのどれかを入れてください');
      return;
    }
    saving = true;
    try {
      await db.saveRecord({
        ...(record || {}),
        id: record?.id || uuid(),
        cropIds: [...state.cropIds],
        date,
        stamps: [...state.stamps],
        memo,
        photoIds: state.keptPhotoIds,
      }, {
        newPhotos: state.newPhotos.map(({ blob, thumb }) => ({ blob, thumb })),
        removedPhotoIds: state.removedPhotoIds,
      });
      toast(state.cropIds.size > 1 ? `${state.cropIds.size}つの野菜に記録しました` : '記録しました');
      ctx.goBackOr(backHash);
    } catch (err) {
      saving = false;
      toast('保存できませんでした：' + err.message);
    }
  });
}
