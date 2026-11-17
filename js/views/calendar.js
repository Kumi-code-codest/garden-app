// カレンダー（「月」と「年」をタブで切り替え）
// #/calendar?view=month&ym=2026-11&d=2026-11-17
// #/calendar?view=year&y=2026

import { navigate, todayStr } from '../utils.js';
import { renderMonth } from './calendar-month.js';
import { renderYear } from './calendar-year.js';

export function calendarHash(params) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''));
  return `#/calendar?${q.toString()}`;
}

export async function render(ctx) {
  const view = ctx.query.view === 'year' ? 'year' : 'month';
  const today = todayStr();
  const ym = /^\d{4}-\d{2}$/.test(ctx.query.ym || '') ? ctx.query.ym : today.slice(0, 7);
  const y = /^\d{4}$/.test(ctx.query.y || '') ? Number(ctx.query.y) : Number(ym.slice(0, 4));

  ctx.setHeader({ title: 'カレンダー', back: '#/' });

  // カレンダー内の移動は履歴に積まない（戻るで一覧に戻れるように）
  const go = (params) => navigate(calendarHash(params), { replace: true });
  const selfHash = location.hash;

  const tabs = document.createElement('div');
  tabs.className = 'seg';
  tabs.innerHTML = `
    <button type="button" data-view="month" aria-pressed="${view === 'month'}">月</button>
    <button type="button" data-view="year" aria-pressed="${view === 'year'}">年</button>`;
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.view === view) return;
    if (b.dataset.view === 'year') go({ view: 'year', y: ym.slice(0, 4) });
    else go({ view: 'month', ym: y === Number(today.slice(0, 4)) ? today.slice(0, 7) : `${y}-01` });
  });

  const body = document.createElement('div');
  ctx.el.append(tabs, body);

  if (view === 'year') await renderYear(ctx, body, { y, go });
  else await renderMonth(ctx, body, { ym, d: ctx.query.d, go, selfHash });
}
