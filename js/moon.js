// 月齢と月の満ち欠けの計算（サーバー不要・端末内で計算）
// 新月・上弦・満月・下弦の時刻は J. Meeus『Astronomical Algorithms』第49章の方法で求める（誤差は数分程度）。
// 月齢 = 直前の新月からの経過日数。暦の慣例どおり、その日の正午の値を表示する。

import { parseDate, toDateStr } from './utils.js';

const SYNODIC = 29.530588861; // 朔望月（日）
const RAD = Math.PI / 180;
const DELTA_T_DAYS = 70 / 86400; // 力学時と世界時の差（約70秒）

export const PHASES = {
  new:   { label: '新月', emoji: '🌑' },
  first: { label: '上弦', emoji: '🌓' },
  full:  { label: '満月', emoji: '🌕' },
  last:  { label: '下弦', emoji: '🌗' },
};

const sin = (deg) => Math.sin(deg * RAD);
const cos = (deg) => Math.cos(deg * RAD);

// k: 2000年1月の新月を0とした通し番号。.0=新月 .25=上弦 .5=満月 .75=下弦
function phaseJDE(k) {
  const T = k / 1236.85;
  const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  let jde = 2451550.09766 + SYNODIC * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const M = 2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3;
  const Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4;
  const F = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4;
  const O = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3;

  const frac = Math.round((k - Math.floor(k)) * 4) / 4;
  let c;
  if (frac === 0 || frac === 0.5) {
    const isNew = frac === 0;
    c = (isNew ? -0.4072 : -0.40614) * sin(Mp)
      + (isNew ? 0.17241 : 0.17302) * E * sin(M)
      + (isNew ? 0.01608 : 0.01614) * sin(2 * Mp)
      + (isNew ? 0.01039 : 0.01043) * sin(2 * F)
      + (isNew ? 0.00739 : 0.00734) * E * sin(Mp - M)
      - (isNew ? 0.00514 : 0.00515) * E * sin(Mp + M)
      + (isNew ? 0.00208 : 0.00209) * E * E * sin(2 * M)
      - 0.00111 * sin(Mp - 2 * F)
      - 0.00057 * sin(Mp + 2 * F)
      + 0.00056 * E * sin(2 * Mp + M)
      - 0.00042 * sin(3 * Mp)
      + 0.00042 * E * sin(M + 2 * F)
      + 0.00038 * E * sin(M - 2 * F)
      - 0.00024 * E * sin(2 * Mp - M)
      - 0.00017 * sin(O)
      - 0.00007 * sin(Mp + 2 * M)
      + 0.00004 * sin(2 * Mp - 2 * F)
      + 0.00004 * sin(3 * M)
      + 0.00003 * sin(Mp + M - 2 * F)
      + 0.00003 * sin(2 * Mp + 2 * F)
      - 0.00003 * sin(Mp + M + 2 * F)
      + 0.00003 * sin(Mp - M + 2 * F)
      - 0.00002 * sin(Mp - M - 2 * F)
      - 0.00002 * sin(3 * Mp + M)
      + 0.00002 * sin(4 * Mp);
  } else {
    c = -0.62801 * sin(Mp)
      + 0.17172 * E * sin(M)
      - 0.01183 * E * sin(Mp + M)
      + 0.00862 * sin(2 * Mp)
      + 0.00804 * sin(2 * F)
      + 0.00454 * E * sin(Mp - M)
      + 0.00204 * E * E * sin(2 * M)
      - 0.0018 * sin(Mp - 2 * F)
      - 0.0007 * sin(Mp + 2 * F)
      - 0.0004 * sin(3 * Mp)
      - 0.00034 * E * sin(2 * Mp - M)
      + 0.00032 * E * sin(M + 2 * F)
      + 0.00032 * E * sin(M - 2 * F)
      - 0.00028 * E * E * sin(Mp + 2 * M)
      + 0.00027 * E * sin(2 * Mp + M)
      - 0.00017 * sin(O)
      - 0.00005 * sin(Mp - M - 2 * F)
      + 0.00004 * sin(2 * Mp + 2 * F)
      - 0.00004 * sin(Mp + M + 2 * F)
      + 0.00004 * sin(Mp - 2 * M)
      + 0.00003 * sin(Mp + M - 2 * F)
      + 0.00003 * sin(3 * M)
      + 0.00002 * sin(2 * Mp - 2 * F)
      + 0.00002 * sin(Mp - M + 2 * F)
      - 0.00002 * sin(3 * Mp + M);
    const W = 0.00306 - 0.00038 * E * cos(M) + 0.00026 * cos(Mp)
      - 0.00002 * cos(Mp - M) + 0.00002 * cos(Mp + M) + 0.00002 * cos(2 * F);
    c += frac === 0.25 ? W : -W;
  }
  return jde + c - DELTA_T_DAYS; // 世界時のユリウス日
}

const jdToMs = (jd) => (jd - 2440587.5) * 86400000;
const msToJd = (ms) => ms / 86400000 + 2440587.5;

// その瞬間の月齢（日）
export function moonAgeAt(date) {
  const jd = msToJd(date.getTime());
  let k = Math.floor((jd - 2451550.09766) / SYNODIC);
  while (phaseJDE(k) > jd) k--;
  while (phaseJDE(k + 1) <= jd) k++;
  return jd - phaseJDE(k);
}

// 期間内の新月・上弦・満月・下弦（端末のタイムゾーンでの日付つき）
export function phaseEvents(fromStr, toStr) {
  const from = parseDate(fromStr).getTime();
  const to = parseDate(toStr).getTime() + 86400000;
  const k0 = Math.floor((msToJd(from) - 2451550.09766) / SYNODIC) - 1;
  const k1 = Math.ceil((msToJd(to) - 2451550.09766) / SYNODIC) + 1;
  const out = [];
  for (let k = k0; k <= k1; k++) {
    [['new', 0], ['first', 0.25], ['full', 0.5], ['last', 0.75]].forEach(([type, f]) => {
      const ms = jdToMs(phaseJDE(k + f));
      if (ms >= from && ms < to) {
        const at = new Date(ms);
        out.push({ type, at, date: toDateStr(at), ...PHASES[type] });
      }
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

// 月齢に合う絵文字（北半球から見た形）
export function moonEmoji(age) {
  const p = age / SYNODIC; // 0〜1
  const idx = Math.round(p * 8) % 8;
  return ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'][idx];
}

// "YYYY-MM-DD" の日の月の情報（正午の月齢）
// events を渡すと、その日に新月・満月などがあれば名前を付ける
export function moonOfDay(dateStr, events = null) {
  const noon = parseDate(dateStr);
  noon.setHours(12, 0, 0, 0);
  const age = moonAgeAt(noon);
  const evs = events || phaseEvents(dateStr, dateStr);
  const ev = evs.find((e) => e.date === dateStr);
  return {
    age,
    ageText: age.toFixed(1),
    emoji: ev ? ev.emoji : moonEmoji(age),
    phase: ev ? ev.label : '',
    phaseType: ev ? ev.type : null,
  };
}
