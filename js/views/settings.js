// 設定：エリアの編集・バックアップ

import * as db from '../db.js';
import { esc, uuid, AREA_COLORS, toast } from '../utils.js';
import { exportBackup, importBackup, saveFile } from '../backup.js';

export async function render(ctx) {
  const [areas, crops, lastBackupAt] = await Promise.all([db.listAreas(), db.listCrops(), db.getMeta('lastBackupAt')]);
  ctx.setHeader({ title: '設定', back: '#/' });

  let storageText = '';
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const [est, persisted] = await Promise.all([
        navigator.storage.estimate(),
        navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false),
      ]);
      storageText = `使用量 約${(est.usage / 1024 / 1024).toFixed(1)}MB ・ ${persisted ? '自動削除されない設定です' : '端末の空き容量が少ないと消される可能性があります'}`;
    } catch { /* 表示しないだけ */ }
  }

  const countIn = (areaId) => crops.filter((c) => c.areaId === areaId && c.status !== 'finished').length;

  ctx.el.innerHTML = `
    <h2 class="section-title">エリア</h2>
    <p class="hint">色の丸をタップすると色が変わります。名前は入力後に自動で保存されます。</p>
    <div class="area-rows">
      ${areas.map((a, i) => `
        <div class="area-row" data-id="${esc(a.id)}">
          <button type="button" class="color-dot" style="--area-color:${esc(a.color)}" data-act="color" aria-label="色を変える"></button>
          <input class="input" type="text" value="${esc(a.name)}" data-act="name" aria-label="エリアの名前">
          <button type="button" class="btn-small" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="上へ">▲</button>
          <button type="button" class="btn-small" data-act="down" ${i === areas.length - 1 ? 'disabled' : ''} aria-label="下へ">▼</button>
          <button type="button" class="btn-small danger" data-act="delete" aria-label="削除">🗑</button>
        </div>`).join('')}
    </div>
    <button type="button" class="btn" data-act="add">＋ エリアを追加</button>

    <h2 class="section-title">バックアップ</h2>
    <p class="hint">データはこの端末の中だけに保存されています。機種変更やデータ消失に備えて、ときどき書き出してください。</p>
    <p class="hint">最終バックアップ：${lastBackupAt ? esc(new Date(lastBackupAt).toLocaleDateString('ja-JP')) : 'まだありません'}</p>
    <div class="row-btns">
      <button type="button" class="btn" data-act="export">⬇️ 書き出す</button>
      <label class="btn">⬆️ 読み込む<input type="file" accept="application/json,.json" data-act="import" hidden></label>
    </div>
    ${storageText ? `<p class="hint">${esc(storageText)}</p>` : ''}
  `;

  const el = ctx.el;

  el.querySelectorAll('.area-row').forEach((row) => {
    const area = areas.find((a) => a.id === row.dataset.id);
    const idx = areas.indexOf(area);

    row.querySelector('[data-act="name"]').addEventListener('change', async (e) => {
      const name = e.target.value.trim();
      if (!name) { e.target.value = area.name; return; }
      area.name = name;
      await db.saveArea(area);
      toast('保存しました');
    });

    row.querySelector('[data-act="color"]').addEventListener('click', async (e) => {
      const next = AREA_COLORS[(AREA_COLORS.indexOf(area.color) + 1) % AREA_COLORS.length];
      area.color = next;
      e.currentTarget.style.setProperty('--area-color', next);
      await db.saveArea(area);
    });

    const move = async (dir) => {
      const other = areas[idx + dir];
      if (!other) return;
      const list = [...areas];
      [list[idx], list[idx + dir]] = [list[idx + dir], list[idx]];
      await db.saveAreas(list.map((a, i) => ({ ...a, sortOrder: i })));
      ctx.refresh();
    };
    row.querySelector('[data-act="up"]').addEventListener('click', () => move(-1));
    row.querySelector('[data-act="down"]').addEventListener('click', () => move(1));

    row.querySelector('[data-act="delete"]').addEventListener('click', async () => {
      const n = countIn(area.id);
      const msg = `エリア「${area.name}」を削除しますか？` +
        (n ? `\n栽培中の${n}件は「エリア未設定」になります（記録は消えません）。` : '');
      if (!confirm(msg)) return;
      await db.deleteArea(area.id);
      toast('削除しました');
      ctx.refresh();
    });
  });

  el.querySelector('[data-act="add"]').addEventListener('click', async () => {
    const i = areas.length;
    await db.saveArea({
      id: uuid(),
      name: `エリア${i + 1}`,
      color: AREA_COLORS[i % AREA_COLORS.length],
      sortOrder: i ? Math.max(...areas.map((a) => a.sortOrder)) + 1 : 0,
    });
    await ctx.refresh();
    const inputs = document.querySelectorAll('.area-row [data-act="name"]');
    const last = inputs[inputs.length - 1];
    if (last) { last.focus(); last.select(); }
  });

  el.querySelector('[data-act="export"]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '準備中…';
    try {
      const { file, counts } = await exportBackup();
      const done = await saveFile(file);
      if (done) {
        await db.setMeta('lastBackupAt', Date.now());
        toast(`書き出しました（作付け${counts.crops}・記録${counts.records}・ノート${counts.notes}・写真${counts.photos}）`);
        ctx.refresh();
        return;
      }
    } catch (err) {
      toast('書き出せませんでした：' + err.message);
    }
    btn.disabled = false;
    btn.textContent = '⬇️ 書き出す';
  });

  el.querySelector('[data-act="import"]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm('バックアップを読み込みますか？\n今のデータは消えません。同じデータは上書きされます。')) return;
    try {
      const c = await importBackup(file);
      toast(`読み込みました（作付け${c.crops}・記録${c.records}・ノート${c.notes}・写真${c.photos}）`);
      ctx.refresh();
    } catch (err) {
      toast(err.message);
    }
  });
}
