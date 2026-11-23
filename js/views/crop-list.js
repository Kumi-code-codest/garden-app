// ① 一覧（エリア別 / すべて）

import * as db from '../db.js';
import { esc, formatDate, shortDate, roundLabel, compareCrops, areaChip, todayStr } from '../utils.js';
import { stampEmoji, sortStamps } from '../stamps.js';
import { moonOfDay } from '../moon.js';

const MODE_KEY = 'garden.listMode';
function loadMode() {
  try { return localStorage.getItem(MODE_KEY) || 'area'; } catch { return 'area'; }
}
function saveMode(m) {
  try { localStorage.setItem(MODE_KEY, m); } catch { /* 保存できなくても動く */ }
}

export async function render(ctx) {
  const [areas, crops, records] = await Promise.all([db.listAreas(), db.listCrops(), db.listRecords()]);
  ctx.setHeader({
    title: '菜園きろく',
    actions: [
      { href: '#/calendar', icon: '📅', label: 'カレンダー' },
      { href: '#/notes', icon: '📖', label: 'ノート' },
      { href: '#/settings', icon: '⚙️', label: '設定' },
    ],
  });
  const moon = moonOfDay(todayStr());
  const todayLine = `
    <a class="today-line" href="#/calendar">
      <span>今日 ${formatDate(todayStr())}</span>
      <span>${moon.emoji} 月齢 ${moon.ageText}${moon.phase ? `（${moon.phase}）` : ''}</span>
    </a>`;

  // 作付けごとの最新の記録
  const latest = new Map();
  for (const r of records) {
    for (const cid of r.cropIds) {
      const cur = latest.get(cid);
      if (!cur || r.date > cur.date || (r.date === cur.date && r.createdAt > cur.createdAt)) latest.set(cid, r);
    }
  }
  const areaMap = new Map(areas.map((a) => [a.id, a]));
  const growing = crops.filter((c) => c.status !== 'finished').sort(compareCrops);
  const finished = crops.filter((c) => c.status === 'finished').sort(compareCrops);

  const card = (c, { showArea = false } = {}) => {
    const rl = roundLabel(c, crops);
    const last = latest.get(c.id);
    const lastText = last
      ? `最終 ${formatDate(last.date, { weekday: false })} ${sortStamps(last.stamps).map(stampEmoji).join('')}${last.photoIds?.length ? '📷' : ''}`
      : 'まだ記録なし';
    return `
      <a class="crop-card" href="#/crop/${esc(c.id)}">
        <span class="crop-icon">${esc(c.icon)}</span>
        <span class="crop-main">
          <span class="crop-name">${esc(c.name)}${c.variety ? ` <small>${esc(c.variety)}</small>` : ''}${rl ? ` <span class="badge">${rl}</span>` : ''}</span>
          <span class="crop-sub">${showArea ? areaChip(areaMap.get(c.areaId)) + ' ' : ''}${formatDate(c.startedAt, { weekday: false })}〜</span>
          <span class="crop-sub">${esc(lastText)}</span>
        </span>
        <span class="chev">›</span>
      </a>`;
  };

  // 栽培を終えた作付けを年ごとにまとめる
  const pastList = (list) => {
    const byYear = new Map();
    list.forEach((c) => {
      const y = c.startedAt.slice(0, 4);
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(c);
    });
    return [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([y, cs]) => `
      <h3 class="year-title">${y}年</h3>
      ${cs.map((c) => `
        <a class="past-item" href="#/crop/${esc(c.id)}">
          <span>${esc(c.icon)} ${esc(c.name)}${c.variety ? ` <small>${esc(c.variety)}</small>` : ''}${roundLabel(c, crops) ? ` <span class="badge">${roundLabel(c, crops)}</span>` : ''}</span>
          <span class="past-dates">${shortDate(c.startedAt)}〜${shortDate(c.finishedAt)}</span>
        </a>`).join('')}`).join('');
  };

  const areaView = () => {
    const sections = areas.map((a) => ({
      area: a,
      grow: growing.filter((c) => c.areaId === a.id),
      past: finished.filter((c) => c.areaId === a.id),
    }));
    const none = {
      area: null,
      grow: growing.filter((c) => !areaMap.has(c.areaId)),
      past: finished.filter((c) => !areaMap.has(c.areaId)),
    };
    if (none.grow.length || none.past.length) sections.push(none);

    return sections.map(({ area, grow, past }) => `
      <section class="area-section" style="--area-color:${esc(area ? area.color : 'var(--area-none)')}">
        <h2 class="area-title"><span class="area-dot"></span>${esc(area ? area.name : 'エリア未設定')}<span class="count">${grow.length}</span></h2>
        ${grow.length
          ? grow.map((c) => card(c)).join('')
          : `<p class="empty-small">今は何も植わっていません${area ? ` <a href="#/crop/new?area=${esc(area.id)}">＋ここに植える</a>` : ''}</p>`}
        ${past.length ? `
          <details class="past">
            <summary>過去にこのエリアで育てたもの（${past.length}）</summary>
            ${pastList(past)}
          </details>` : ''}
      </section>`).join('');
  };

  const allView = () => {
    const groups = new Map();
    growing.forEach((c) => {
      if (!groups.has(c.name)) groups.set(c.name, []);
      groups.get(c.name).push(c);
    });
    const growHtml = growing.length
      ? [...groups.entries()].map(([name, cs]) => `
          <section class="name-group">
            <h2 class="group-title">${esc(cs[0].icon)} ${esc(name)}<span class="count">${cs.length}</span></h2>
            ${cs.map((c) => card(c, { showArea: true })).join('')}
          </section>`).join('')
      : '<p class="empty-small">栽培中の野菜はありません</p>';
    const pastHtml = finished.length ? `
      <details class="past">
        <summary>栽培を終えたもの（${finished.length}）</summary>
        ${pastList(finished)}
      </details>` : '';
    return growHtml + pastHtml;
  };

  const draw = () => {
    const mode = loadMode();
    if (crops.length === 0) {
      ctx.el.innerHTML = `
        <div class="welcome">
          <p class="welcome-icon">🌱</p>
          <p>まずは植えた野菜を登録しましょう。</p>
          <a class="btn btn-primary btn-big" href="#/crop/new">＋ 作付けを追加</a>
          <p class="hint">エリアの名前は ⚙️設定 で変えられます。</p>
        </div>`;
      return;
    }
    ctx.el.innerHTML = `
      ${todayLine}
      <div class="seg" role="tablist">
        <button type="button" data-mode="area" aria-pressed="${mode === 'area'}">エリア別</button>
        <button type="button" data-mode="all" aria-pressed="${mode === 'all'}">すべて</button>
      </div>
      ${mode === 'area' ? areaView() : allView()}
      <div class="bottom-bar">
        <a class="btn" href="#/crop/new">＋ 作付け</a>
        ${growing.length ? '<a class="btn btn-primary" href="#/record/new">📝 まとめて記録</a>' : ''}
      </div>`;
    ctx.el.querySelectorAll('.seg button').forEach((b) => {
      b.addEventListener('click', () => { saveMode(b.dataset.mode); draw(); });
    });
  };
  draw();
}
