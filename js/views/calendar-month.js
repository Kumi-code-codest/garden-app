// カレンダー「月」：日ごとの記録スタンプと月齢

import * as db from '../db.js';
import { esc, todayStr, formatDate, blobUrl, roundLabel } from '../utils.js';
import { STAMP_MAP, stampEmoji, sortStamps } from '../stamps.js';
import { phaseEvents, moonOfDay } from '../moon.js';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const pad = (n) => String(n).padStart(2, '0');
const MAX_STAMPS_IN_CELL = 3;

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function timeText(date) {
  return `${date.getHours()}:${pad(date.getMinutes())}`;
}

export async function renderMonth(ctx, el, { ym, d, go, selfHash }) {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const first = `${ym}-01`;
  const last = `${ym}-${pad(lastDay)}`;
  const today = todayStr();

  const [records, crops] = await Promise.all([db.listRecordsBetween(first, last), db.listCrops()]);
  const cropMap = new Map(crops.map((c) => [c.id, c]));
  const events = phaseEvents(first, last);

  const byDate = new Map();
  records.forEach((r) => {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  });

  // 選択中の日：指定がなければ今月なら今日
  let selected = d && d.startsWith(ym) ? d : (today.startsWith(ym) ? today : null);

  const lead = new Date(y, m - 1, 1).getDay();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span class="cal-blank"></span>');
  for (let day = 1; day <= lastDay; day++) {
    const ds = `${ym}-${pad(day)}`;
    const wd = (lead + day - 1) % 7;
    const moon = moonOfDay(ds, events);
    const recs = byDate.get(ds) || [];
    const stamps = sortStamps([...new Set(recs.flatMap((r) => r.stamps))]);
    const hasPhoto = recs.some((r) => r.photoIds?.length);
    const hasMemoOnly = recs.length && !stamps.length && !hasPhoto;
    const shown = stamps.slice(0, MAX_STAMPS_IN_CELL).map(stampEmoji).join('');
    const more = stamps.length > MAX_STAMPS_IN_CELL ? `<span class="cal-more">+${stamps.length - MAX_STAMPS_IN_CELL}</span>` : '';
    const cls = [
      'cal-day',
      wd === 0 ? 'sun' : wd === 6 ? 'sat' : '',
      ds === today ? 'today' : '',
      moon.phaseType ? `phase-${moon.phaseType}` : '',
    ].filter(Boolean).join(' ');
    cells.push(`
      <button type="button" class="${cls}" data-date="${ds}" aria-pressed="${ds === selected}"
        aria-label="${formatDate(ds)} 月齢${moon.ageText}${moon.phase ? ' ' + moon.phase : ''}${recs.length ? ` 記録${recs.length}件` : ''}">
        <span class="cal-top"><span class="cal-num">${day}</span><span class="cal-moon">${moon.emoji}</span></span>
        <span class="cal-stamps">${shown}${more}${hasPhoto ? '📷' : ''}${hasMemoOnly ? '📝' : ''}</span>
      </button>`);
  }

  const isThisMonth = today.startsWith(ym);
  el.innerHTML = `
    <div class="cal-nav">
      <button type="button" class="btn-small" data-move="-1" aria-label="前の月">‹</button>
      <h2 class="cal-title">${y}年${m}月</h2>
      <button type="button" class="btn-small" data-move="1" aria-label="次の月">›</button>
    </div>
    ${isThisMonth ? '' : '<div class="cal-today-link"><button type="button" class="btn-small" data-act="today">今月へ</button></div>'}
    <div class="cal-grid">
      ${WEEK.map((w, i) => `<span class="cal-wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</span>`).join('')}
      ${cells.join('')}
    </div>
    <div class="phase-list">
      ${events.map((e) => `<span class="phase-item"><span class="phase-emoji">${e.emoji}</span>${e.label} ${e.at.getMonth() + 1}/${e.at.getDate()} ${timeText(e.at)}</span>`).join('')}
    </div>
    <div class="day-panel-wrap"></div>
  `;

  const panelWrap = el.querySelector('.day-panel-wrap');

  const drawPanel = () => {
    if (!selected) { panelWrap.innerHTML = '<p class="hint">日付をタップすると、その日の記録が見られます。</p>'; return; }
    const moon = moonOfDay(selected, events);
    const recs = byDate.get(selected) || [];
    const back = encodeURIComponent(selfHashFor(selected));
    panelWrap.innerHTML = `
      <section class="card day-panel">
        <div class="day-head">
          <strong>${formatDate(selected)}</strong>
          <span class="moon-info">${moon.emoji} 月齢 ${moon.ageText}${moon.phase ? `（${moon.phase}）` : ''}</span>
        </div>
        ${recs.length ? recs.map((r) => {
          const cs = r.cropIds.map((id) => cropMap.get(id)).filter(Boolean);
          return `
            <a class="day-record" href="#/record/${esc(r.id)}/edit?back=${back}">
              <span class="day-crops">${cs.map((c) => {
                const sub = [c.variety, roundLabel(c, crops)].filter(Boolean).join(' ');
                return `${esc(c.icon)}${esc(c.name)}${sub ? `<small>（${esc(sub)}）</small>` : ''}`;
              }).join('、') || '（削除された野菜）'}</span>
              ${r.stamps.length ? `<span class="stamp-chips">${sortStamps(r.stamps).map((s) => {
                const st = STAMP_MAP[s];
                return `<span class="stamp-chip ${st ? 'cat-' + st.category : ''}">${esc(st ? st.emoji : '❔')} ${esc(st ? st.label : s)}</span>`;
              }).join('')}</span>` : ''}
              ${r.memo ? `<span class="day-memo">${esc(r.memo)}</span>` : ''}
              ${r.photoIds?.length ? `<span class="thumbs">${r.photoIds.map((pid) => `<span class="thumb"><img data-photo="${esc(pid)}" alt=""></span>`).join('')}</span>` : ''}
            </a>`;
        }).join('') : '<p class="empty-small">この日の記録はありません</p>'}
        <a class="btn btn-primary day-add" href="#/record/new?date=${selected}&back=${back}">＋ この日の記録を追加</a>
      </section>`;
    panelWrap.querySelectorAll('img[data-photo]').forEach((img) => {
      db.getPhoto(img.dataset.photo).then((p) => { if (p && ctx.isCurrent()) img.src = blobUrl(p.thumb); });
    });
  };

  // 戻ってきたとき同じ日が選ばれた状態にするため、選択日を URL に残す
  function selfHashFor(ds) {
    const base = selfHash.split('?')[0];
    const q = new URLSearchParams(selfHash.split('?')[1] || '');
    q.set('view', 'month');
    q.set('ym', ym);
    q.set('d', ds);
    return `${base}?${q.toString()}`;
  }

  el.querySelector('.cal-grid').addEventListener('click', (e) => {
    const b = e.target.closest('.cal-day');
    if (!b) return;
    selected = b.dataset.date;
    el.querySelectorAll('.cal-day').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    history.replaceState(null, '', selfHashFor(selected));
    drawPanel();
  });

  el.querySelectorAll('[data-move]').forEach((b) => {
    b.addEventListener('click', () => go({ view: 'month', ym: shiftMonth(ym, Number(b.dataset.move)) }));
  });
  el.querySelector('[data-act="today"]')?.addEventListener('click', () => go({ view: 'month', ym: today.slice(0, 7) }));

  drawPanel();
}
