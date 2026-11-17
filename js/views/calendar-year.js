// カレンダー「年」：作付けごとの栽培期間を横棒で表示（エリアごとにまとめる）

import * as db from '../db.js';
import { esc, todayStr, parseDate, roundLabel, compareCrops, formatDate } from '../utils.js';

// 横棒の上に印を付けるスタンプ
const MARKS = [
  { cls: 'mark-start', label: '種蒔き・植え付け', stamps: ['sow', 'plant'] },
  { cls: 'mark-harvest', label: '収穫', stamps: ['harvest'] },
  { cls: 'mark-pest', label: '病害虫', stamps: ['pest'] },
];

export async function renderYear(ctx, el, { y, go }) {
  const yFirst = `${y}-01-01`;
  const yLast = `${y}-12-31`;
  const today = todayStr();
  const [areas, crops, records] = await Promise.all([
    db.listAreas(), db.listCrops(), db.listRecordsBetween(yFirst, yLast),
  ]);

  const t0 = new Date(y, 0, 1).getTime();
  const t1 = new Date(y + 1, 0, 1).getTime();
  const pos = (ds) => Math.min(100, Math.max(0, ((parseDate(ds).getTime() - t0) / (t1 - t0)) * 100));
  const posEnd = (ds) => Math.min(100, Math.max(0, ((parseDate(ds).getTime() + 86400000 - t0) / (t1 - t0)) * 100));

  // その年にかかっている作付け
  const endOf = (c) => (c.status === 'finished' ? (c.finishedAt || c.startedAt) : today);
  const inYear = crops.filter((c) => c.startedAt <= yLast && endOf(c) >= yFirst).sort(compareCrops);

  const recsByCrop = new Map();
  records.forEach((r) => r.cropIds.forEach((id) => {
    if (!recsByCrop.has(id)) recsByCrop.set(id, []);
    recsByCrop.get(id).push(r);
  }));

  const areaIds = new Set(areas.map((a) => a.id));
  const groups = areas.map((a) => ({ area: a, crops: inYear.filter((c) => c.areaId === a.id) }));
  groups.push({ area: null, crops: inYear.filter((c) => !areaIds.has(c.areaId)) });

  // 月の区切り線と月ラベル
  const monthStarts = Array.from({ length: 12 }, (_, i) => pos(`${y}-${String(i + 1).padStart(2, '0')}-01`));
  const monthLabels = monthStarts.map((p, i) => {
    const next = i < 11 ? monthStarts[i + 1] : 100;
    return `<span class="yr-mlabel" style="left:${p}%;width:${next - p}%">${i + 1}</span>`;
  }).join('');
  const lines = monthStarts.slice(1).map((p) => `<span class="yr-line" style="left:${p}%"></span>`).join('');
  const todayLine = today.startsWith(String(y)) ? `<span class="yr-today" style="left:${pos(today)}%"></span>` : '';

  const row = (c, area) => {
    const start = c.startedAt < yFirst ? yFirst : c.startedAt;
    const end = endOf(c) > yLast ? yLast : endOf(c);
    const left = pos(start);
    const width = Math.max(0.6, posEnd(end) - left);
    const ongoing = c.status !== 'finished' && endOf(c) <= yLast;
    const recs = recsByCrop.get(c.id) || [];
    const marks = MARKS.flatMap((m) => {
      const dates = [...new Set(recs.filter((r) => r.stamps.some((s) => m.stamps.includes(s))).map((r) => r.date))];
      return dates.map((ds) => `<span class="yr-mark ${m.cls}" style="left:${(pos(ds) + posEnd(ds)) / 2}%"></span>`);
    }).join('');
    const sub = [c.variety, roundLabel(c, crops)].filter(Boolean).join(' ');
    const period = `${formatDate(c.startedAt, { weekday: false })}〜${c.status === 'finished' ? formatDate(endOf(c), { weekday: false }) : '栽培中'}`;
    return `
      <a class="yr-row" href="#/crop/${esc(c.id)}" aria-label="${esc(c.name)} ${esc(sub)} ${period}">
        <span class="yr-label"><span class="yr-name">${esc(c.icon)} ${esc(c.name)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</span>
        <span class="yr-track">
          <span class="yr-bar${ongoing ? ' ongoing' : ''}" style="left:${left}%;width:${width}%;--area-color:${esc(area ? area.color : 'var(--area-none)')}"></span>
          ${marks}
        </span>
      </a>`;
  };

  const body = groups.filter((g) => g.crops.length).map((g) => `
    <div class="yr-group" style="--area-color:${esc(g.area ? g.area.color : 'var(--area-none)')}">
      <div class="yr-area"><span class="area-dot"></span>${esc(g.area ? g.area.name : 'エリア未設定')}</div>
      ${g.crops.map((c) => row(c, g.area)).join('')}
    </div>`).join('');

  const thisYear = Number(today.slice(0, 4));
  el.innerHTML = `
    <div class="cal-nav">
      <button type="button" class="btn-small" data-move="-1" aria-label="前の年">‹</button>
      <h2 class="cal-title">${y}年</h2>
      <button type="button" class="btn-small" data-move="1" aria-label="次の年">›</button>
    </div>
    ${y === thisYear ? '' : '<div class="cal-today-link"><button type="button" class="btn-small" data-act="today">今年へ</button></div>'}
    ${inYear.length ? `
      <div class="yr-chart">
        <div class="yr-head"><span class="yr-label"></span><span class="yr-track yr-months">${monthLabels}</span></div>
        <div class="yr-body">
          <div class="yr-overlay"><span class="yr-label"></span><span class="yr-track">${lines}${todayLine}</span></div>
          ${body}
        </div>
      </div>
      <div class="yr-legend">
        ${MARKS.map((m) => `<span><span class="yr-mark-sample ${m.cls}"></span>${m.label}</span>`).join('')}
        <span><span class="yr-bar-sample ongoing"></span>栽培中</span>
      </div>
      <p class="hint">行をタップするとその作付けの詳細を開きます。</p>`
    : '<p class="empty-small">この年の作付けはありません</p>'}
  `;

  el.querySelectorAll('[data-move]').forEach((b) => {
    b.addEventListener('click', () => go({ view: 'year', y: y + Number(b.dataset.move) }));
  });
  el.querySelector('[data-act="today"]')?.addEventListener('click', () => go({ view: 'year', y: thisYear }));
}
