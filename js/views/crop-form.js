// 作付けの追加・編集
// #/crop/new              新規
// #/crop/new?area=ID      エリアを選んだ状態で新規
// #/crop/new?from=ID      「もう一度植える」（名前・品種・エリアを引き継ぐ）
// #/crop/ID/edit          編集

import * as db from '../db.js';
import { esc, uuid, todayStr, navigate, toast } from '../utils.js';

// よく育てる野菜（タップで名前とアイコンが入る）
const PRESETS = [
  ['ミニトマト', '🍅'], ['トマト', '🍅'], ['ナス', '🍆'], ['キュウリ', '🥒'], ['ピーマン', '🫑'],
  ['シシトウ', '🌶️'], ['オクラ', '🌱'], ['エダマメ', '🫛'], ['インゲン', '🫛'], ['トウモロコシ', '🌽'],
  ['ジャガイモ', '🥔'], ['サツマイモ', '🍠'], ['ニンジン', '🥕'], ['ダイコン', '🌱'], ['タマネギ', '🧅'],
  ['ニンニク', '🧄'], ['ネギ', '🌿'], ['キャベツ', '🥬'], ['ハクサイ', '🥬'], ['レタス', '🥬'],
  ['ホウレンソウ', '🥬'], ['コマツナ', '🥬'], ['ブロッコリー', '🥦'], ['カボチャ', '🎃'], ['スイカ', '🍉'],
  ['イチゴ', '🍓'], ['バジル', '🌿'], ['シソ', '🌿'],
];

// 最初に見せる候補の数（多すぎると品種・エリアの欄が画面の下に押し出されるため）
const QUICK_VISIBLE = 12;

const ICONS = ['🍅', '🍆', '🥒', '🫑', '🌶️', '🌽', '🫛', '🥔', '🍠', '🥕', '🧅', '🧄',
  '🥬', '🥦', '🎃', '🍉', '🍈', '🍓', '🫐', '🍋', '🌿', '🌱', '🌻', '🌸', '🍄', '🥜', '🫘', '🫚'];

export async function render(ctx) {
  const editId = ctx.params.id;
  const [areas, crops] = await Promise.all([db.listAreas(), db.listCrops()]);

  let crop;
  let backHash = '#/';
  if (editId) {
    crop = crops.find((c) => c.id === editId);
    if (!crop) {
      ctx.setHeader({ title: '見つかりません', back: '#/' });
      ctx.el.innerHTML = '<p class="empty">この作付けは削除されたようです。</p>';
      return;
    }
    backHash = `#/crop/${editId}`;
  } else {
    const src = ctx.query.from ? crops.find((c) => c.id === ctx.query.from) : null;
    crop = {
      name: src?.name || '',
      variety: src?.variety || '',
      icon: src?.icon || '🌱',
      areaId: src?.areaId || ctx.query.area || null,
      startedAt: todayStr(),
    };
    if (src) backHash = `#/crop/${src.id}`;
  }
  const isEdit = !!editId;
  ctx.setHeader({ title: isEdit ? '作付けを編集' : (ctx.query.from ? 'もう一度植える' : '作付けを追加'), back: backHash });

  // 過去に使った名前を先に出す
  const used = new Map();
  [...crops].sort((a, b) => b.createdAt - a.createdAt).forEach((c) => { if (!used.has(c.name)) used.set(c.name, c.icon); });
  const quick = [...used.entries()];
  PRESETS.forEach(([n, i]) => { if (!used.has(n)) quick.push([n, i]); });

  const state = {
    name: crop.name,
    variety: crop.variety || '',
    icon: crop.icon,
    areaId: crop.areaId && areas.some((a) => a.id === crop.areaId) ? crop.areaId : null,
    startedAt: crop.startedAt,
    round: crop.round || 1,
  };

  ctx.el.innerHTML = `
    <form class="form" novalidate>
      <div class="field">
        <label class="label" for="f-name">野菜の名前</label>
        <div class="name-row">
          <button type="button" class="icon-preview" data-act="icon-toggle" aria-label="アイコンを選ぶ">${esc(state.icon)}</button>
          <input id="f-name" name="name" class="input" type="text" autocomplete="off" placeholder="例：ミニトマト" value="${esc(state.name)}" required>
        </div>
        <div class="icon-grid" hidden>
          ${ICONS.map((i) => `<button type="button" class="icon-opt" data-icon="${esc(i)}" aria-pressed="${i === state.icon}">${esc(i)}</button>`).join('')}
        </div>
        <div class="quick-names">
          ${quick.map(([n, i], idx) => `<button type="button" class="chip" data-name="${esc(n)}" data-icon="${esc(i)}" ${idx >= QUICK_VISIBLE ? 'data-more hidden' : ''}>${esc(i)} ${esc(n)}</button>`).join('')}
          ${quick.length > QUICK_VISIBLE ? '<button type="button" class="chip chip-more" data-act="more">もっと見る ▾</button>' : ''}
        </div>
      </div>

      <div class="field">
        <label class="label" for="f-variety">品種 <span class="optional">（任意）</span></label>
        <input id="f-variety" name="variety" class="input" type="text" autocomplete="off" list="variety-list" placeholder="例：アイコ" value="${esc(state.variety)}">
        <datalist id="variety-list"></datalist>
      </div>

      <div class="field">
        <span class="label">エリア</span>
        <div class="area-picker">
          ${areas.map((a) => `<button type="button" class="area-opt" data-area="${esc(a.id)}" style="--area-color:${esc(a.color)}" aria-pressed="${state.areaId === a.id}">${esc(a.name)}</button>`).join('')}
          <button type="button" class="area-opt none" data-area="" aria-pressed="${!state.areaId}">未設定</button>
        </div>
      </div>

      <div class="field">
        <label class="label" for="f-date">植えた日・種を蒔いた日</label>
        <input id="f-date" name="startedAt" class="input" type="date" value="${esc(state.startedAt)}" required>
      </div>

      ${isEdit ? `
        <div class="field">
          <span class="label">何回目</span>
          <div class="stepper">
            <button type="button" class="btn" data-act="round-dec" aria-label="減らす">−</button>
            <span class="stepper-value"><span data-round>${state.round}</span>回目</span>
            <button type="button" class="btn" data-act="round-inc" aria-label="増やす">＋</button>
          </div>
        </div>` : ''}

      <div class="bottom-bar">
        ${isEdit ? '<button type="button" class="btn btn-danger" data-act="delete">削除</button>' : ''}
        <button type="submit" class="btn btn-primary">${isEdit ? '保存する' : '登録する'}</button>
      </div>
    </form>`;

  const el = ctx.el;
  const form = el.querySelector('form');
  const nameInput = el.querySelector('#f-name');
  const varietyInput = el.querySelector('#f-variety');
  const iconPreview = el.querySelector('.icon-preview');
  const iconGrid = el.querySelector('.icon-grid');

  const setIcon = (icon) => {
    state.icon = icon;
    iconPreview.textContent = icon;
    iconGrid.querySelectorAll('.icon-opt').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.icon === icon)));
  };

  // 名前に合わせて品種の候補を出す
  const updateVarieties = () => {
    const name = nameInput.value.trim();
    const vs = [...new Set(crops.filter((c) => c.name === name && c.variety).map((c) => c.variety))];
    el.querySelector('#variety-list').innerHTML = vs.map((v) => `<option value="${esc(v)}">`).join('');
  };
  updateVarieties();
  nameInput.addEventListener('input', updateVarieties);

  el.querySelector('[data-act="icon-toggle"]').addEventListener('click', () => { iconGrid.hidden = !iconGrid.hidden; });
  iconGrid.addEventListener('click', (e) => {
    const b = e.target.closest('.icon-opt');
    if (!b) return;
    setIcon(b.dataset.icon);
    iconGrid.hidden = true;
  });

  el.querySelector('.quick-names').addEventListener('click', (e) => {
    if (e.target.closest('[data-act="more"]')) {
      el.querySelectorAll('.quick-names [data-more]').forEach((x) => { x.hidden = false; });
      e.target.closest('[data-act="more"]').remove();
      return;
    }
    const b = e.target.closest('.chip');
    if (!b) return;
    nameInput.value = b.dataset.name;
    setIcon(b.dataset.icon);
    updateVarieties();
  });

  el.querySelector('.area-picker').addEventListener('click', (e) => {
    const b = e.target.closest('.area-opt');
    if (!b) return;
    state.areaId = b.dataset.area || null;
    el.querySelectorAll('.area-opt').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });

  if (isEdit) {
    const roundEl = el.querySelector('[data-round]');
    el.querySelector('[data-act="round-dec"]').addEventListener('click', () => {
      state.round = Math.max(1, state.round - 1); roundEl.textContent = state.round;
    });
    el.querySelector('[data-act="round-inc"]').addEventListener('click', () => {
      state.round += 1; roundEl.textContent = state.round;
    });
    el.querySelector('[data-act="delete"]').addEventListener('click', async () => {
      const n = (await db.listRecordsByCrop(editId)).length;
      const msg = `「${crop.name}」を削除しますか？\n` +
        (n ? `この作付けの記録 ${n}件も削除されます（ほかの野菜と一緒の記録は残ります）。\n` : '') +
        '元に戻せません。';
      if (!confirm(msg)) return;
      await db.deleteCrop(editId);
      toast('削除しました');
      navigate('#/', { replace: true });
    });
  }

  let saving = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;
    const name = nameInput.value.trim();
    const variety = varietyInput.value.trim();
    const startedAt = el.querySelector('#f-date').value || todayStr();
    if (!name) {
      toast('野菜の名前を入れてください');
      nameInput.focus();
      return;
    }
    saving = true;
    try {
      if (isEdit) {
        await db.saveCrop({ ...crop, name, variety, icon: state.icon, areaId: state.areaId, startedAt, round: state.round });
        toast('保存しました');
        ctx.goBackOr(`#/crop/${editId}`);
      } else {
        const round = await db.nextRound({ name, variety, startedAt });
        const saved = await db.saveCrop({
          id: uuid(), name, variety, icon: state.icon, areaId: state.areaId,
          startedAt, round, status: 'growing', finishedAt: null,
        });
        toast(round > 1 ? `${name}（${round}回目）を登録しました` : `${name}を登録しました`);
        navigate(`#/crop/${saved.id}`, { replace: true });
      }
    } catch (err) {
      saving = false;
      toast('保存できませんでした：' + err.message);
    }
  });
}
