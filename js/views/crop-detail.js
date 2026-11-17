// ② 作付けの詳細・記録の履歴

import * as db from '../db.js';
import { esc, formatDate, todayStr, daysBetween, roundLabel, areaChip, blobUrl, toast } from '../utils.js';
import { STAMP_MAP, sortStamps } from '../stamps.js';

export async function render(ctx) {
  const id = ctx.params.id;
  const [crop, areas, crops, records] = await Promise.all([
    db.getCrop(id), db.listAreas(), db.listCrops(), db.listRecordsByCrop(id),
  ]);
  if (!crop) {
    ctx.setHeader({ title: '見つかりません', back: '#/' });
    ctx.el.innerHTML = '<p class="empty">この作付けは削除されたようです。</p>';
    return;
  }
  ctx.setHeader({
    title: crop.name,
    back: '#/',
    actions: [{ href: `#/crop/${id}/edit`, icon: '✏️', label: '編集' }],
  });

  const area = areas.find((a) => a.id === crop.areaId);
  const cropMap = new Map(crops.map((c) => [c.id, c]));
  const isFinished = crop.status === 'finished';
  const rl = roundLabel(crop, crops);
  const days = daysBetween(crop.startedAt, isFinished && crop.finishedAt ? crop.finishedAt : todayStr());
  const harvestCount = records.filter((r) => r.stamps.includes('harvest')).length;

  // 記録を月ごとにまとめる
  let lastMonth = '';
  const recordHtml = records.map((r) => {
    const month = r.date.slice(0, 7);
    const monthHead = month !== lastMonth
      ? `<h3 class="month-title">${Number(month.slice(0, 4))}年${Number(month.slice(5))}月</h3>` : '';
    lastMonth = month;
    const others = r.cropIds.filter((c) => c !== id).map((c) => cropMap.get(c)).filter(Boolean);
    return `${monthHead}
      <article class="record">
        <div class="record-head">
          <span class="record-date">${formatDate(r.date)}</span>
          <a class="btn-small" href="#/record/${esc(r.id)}/edit?crop=${esc(id)}">編集</a>
        </div>
        ${r.stamps.length ? `<div class="stamp-chips">${sortStamps(r.stamps).map((s) => {
          const st = STAMP_MAP[s];
          return `<span class="stamp-chip ${st ? 'cat-' + st.category : ''}">${esc(st ? st.emoji : '❔')} ${esc(st ? st.label : s)}</span>`;
        }).join('')}</div>` : ''}
        ${r.memo ? `<p class="record-memo">${esc(r.memo)}</p>` : ''}
        ${r.photoIds?.length ? `<div class="thumbs">${r.photoIds.map((pid) =>
          `<button type="button" class="thumb" data-photo="${esc(pid)}" aria-label="写真を拡大"><img alt=""></button>`).join('')}</div>` : ''}
        ${others.length ? `<p class="record-with">一緒に記録：${others.map((c) => {
          const sub = [c.variety, roundLabel(c, crops)].filter(Boolean).join(' ');
          return `${esc(c.icon)}${esc(c.name)}${sub ? `（${esc(sub)}）` : ''}`;
        }).join('、')}</p>` : ''}
      </article>`;
  }).join('');

  ctx.el.innerHTML = `
    <section class="card crop-hero">
      <div class="hero-icon">${esc(crop.icon)}</div>
      <div class="hero-body">
        <div class="hero-name">${esc(crop.name)}${crop.variety ? ` <small>${esc(crop.variety)}</small>` : ''}${rl ? ` <span class="badge">${rl}</span>` : ''}</div>
        <div class="hero-meta">${areaChip(area)}${isFinished ? ' <span class="badge badge-muted">栽培終了</span>' : ''}</div>
        <div class="hero-meta">${formatDate(crop.startedAt)}〜${isFinished && crop.finishedAt ? formatDate(crop.finishedAt) : ''}</div>
        <div class="hero-stats">${isFinished ? `栽培期間 ${days}日` : `始めてから ${days}日`} ・ 記録 ${records.length}件${harvestCount ? ` ・ 収穫 ${harvestCount}回` : ''}</div>
      </div>
    </section>

    <a class="btn btn-primary btn-big" href="#/record/new?crop=${esc(id)}">📝 記録する</a>

    <div class="row-btns">
      <a class="btn" href="#/crop/new?from=${esc(id)}">🔁 もう一度植える</a>
      <button type="button" class="btn" data-act="status">${isFinished ? '↩️ 栽培中に戻す' : '🏁 栽培終了'}</button>
    </div>

    <h2 class="section-title">記録</h2>
    ${records.length ? recordHtml : '<p class="empty-small">まだ記録がありません。「記録する」から始めましょう。</p>'}
  `;

  // 栽培終了 / 再開
  ctx.el.querySelector('[data-act="status"]').addEventListener('click', async () => {
    if (isFinished) {
      await db.saveCrop({ ...crop, status: 'growing', finishedAt: null });
      toast('栽培中に戻しました');
    } else {
      if (!confirm(`${crop.name}の栽培を終了にしますか？\n（記録は残ります。一覧では「過去」に移ります）`)) return;
      await db.saveCrop({ ...crop, status: 'finished', finishedAt: todayStr() });
      toast('栽培終了にしました');
    }
    ctx.refresh();
  });

  // サムネイルを読み込む
  ctx.el.querySelectorAll('.thumb').forEach((btn) => {
    const img = btn.querySelector('img');
    db.getPhoto(btn.dataset.photo).then((p) => {
      if (p && ctx.isCurrent()) img.src = blobUrl(p.thumb);
    });
    btn.addEventListener('click', () => openViewer(btn.dataset.photo));
  });
}

// 写真を全画面で表示（タップで閉じる）
async function openViewer(photoId) {
  const p = await db.getPhoto(photoId);
  if (!p) return;
  const v = document.createElement('div');
  v.className = 'viewer';
  v.innerHTML = '<img alt="記録の写真"><p class="viewer-hint">タップで閉じる</p>';
  const url = URL.createObjectURL(p.blob);
  v.querySelector('img').src = url;
  v.addEventListener('click', () => { URL.revokeObjectURL(url); v.remove(); });
  document.body.appendChild(v);
}
