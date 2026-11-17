// スタンプ（作業の種類）の定義
// 記録には id だけを保存する。表示名や絵文字はここを変えれば過去の記録にも反映される。
// category: work=作業 / observe=観察 / weather=天気（あとで Open-Meteo の自動取得に置き換えやすいよう分けておく）

export const STAMPS = [
  { id: 'sow',       label: '種蒔き',   emoji: '🌱', category: 'work' },
  { id: 'plant',     label: '植え付け', emoji: '🪴', category: 'work' },
  { id: 'water',     label: '水やり',   emoji: '💧', category: 'work' },
  { id: 'fertilize', label: '追肥',     emoji: '🧪', category: 'work' },
  { id: 'thin',      label: '間引き',   emoji: '✂️', category: 'work' },
  { id: 'stake',     label: '支柱立て', emoji: '🪵', category: 'work' },
  { id: 'hill',      label: '土寄せ',   emoji: '⛰️', category: 'work' },
  { id: 'prune',     label: '剪定',     emoji: '🌿', category: 'work' },
  { id: 'shade',     label: '陽よけ',   emoji: '⛱️', category: 'work' },
  { id: 'cover',     label: '寒冷紗',   emoji: '🕸️', category: 'work' },
  { id: 'harvest',   label: '収穫',     emoji: '🧺', category: 'work' },
  { id: 'seed',      label: '種取り',   emoji: '🫘', category: 'work' },
  { id: 'pest',      label: '病害虫',   emoji: '🐛', category: 'observe' },
  { id: 'sunny',     label: '晴れ',     emoji: '☀️', category: 'weather' },
  { id: 'rain',      label: '雨',       emoji: '🌧️', category: 'weather' },
];

export const STAMP_MAP = Object.fromEntries(STAMPS.map((s) => [s.id, s]));

export function stampEmoji(id) {
  return STAMP_MAP[id]?.emoji || '❔';
}

export function stampLabel(id) {
  return STAMP_MAP[id]?.label || id;
}

// 記録内のスタンプを定義順に並べる
export function sortStamps(ids) {
  const order = new Map(STAMPS.map((s, i) => [s.id, i]));
  return [...ids].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
}
