// 空き枠の計算(外部と通信しない、計算だけの部品)
// 入力: 現在時刻・埋まっている時間帯・祝日・設定値 → 出力: 予約できる枠の一覧
import { BOOKING } from './config.mjs';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

function hm(text) {
  const [h, m] = text.split(':').map(Number);
  return h * 60 + m;
}

// UTCのミリ秒 → 日本時間の年月日・曜日
export function jstDate(ms, cfg = BOOKING) {
  const d = new Date(ms + cfg.utcOffsetMinutes * MIN);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay() };
}

// 'YYYY-MM-DD'(日本時間の日付)
export function dayKey(ms, cfg = BOOKING) {
  const p = jstDate(ms, cfg);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

// 日本時間のその日の0:00を、UTCのミリ秒で返す
function jstMidnight(ms, cfg) {
  const p = jstDate(ms, cfg);
  return Date.UTC(p.y, p.m - 1, p.d) - cfg.utcOffsetMinutes * MIN;
}

// UTCのミリ秒 → '2026-10-16T14:00:00+09:00'
export function toIso(ms, cfg = BOOKING) {
  const d = new Date(ms + cfg.utcOffsetMinutes * MIN);
  const pad = (n) => String(n).padStart(2, '0');
  const off = cfg.utcOffsetMinutes;
  const sign = off >= 0 ? '+' : '-';
  const oh = pad(Math.floor(Math.abs(off) / 60));
  const om = pad(Math.abs(off) % 60);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00${sign}${oh}:${om}`;
}

// 空き状況を問い合わせる期間(今日の0:00 〜 maxDaysAhead日後の24:00、日本時間)
export function queryRange(now, cfg = BOOKING) {
  const start = jstMidnight(now, cfg);
  return { start, end: start + (cfg.maxDaysAhead + 1) * DAY };
}

/**
 * 予約できる枠を計算する
 * @param {object} p
 * @param {number} p.now       現在時刻(UTCのミリ秒)
 * @param {Array<{start:number,end:number}>} p.busy 埋まっている時間帯(UTCのミリ秒)
 * @param {Set<string>} p.holidays 祝日の日付('YYYY-MM-DD')
 * @returns {Array<{start:number,end:number}>}
 */
export function computeSlots({ now, busy = [], holidays = new Set(), cfg = BOOKING }) {
  const out = [];
  const first = jstMidnight(now, cfg);
  const open = hm(cfg.dayStart);
  const close = hm(cfg.dayEnd);
  const buffer = cfg.bufferMinutes * MIN;
  const deadline = now + cfg.minLeadHours * 60 * MIN; // これより前に始まる枠は締め切り済み

  for (let i = 0; i <= cfg.maxDaysAhead; i++) {
    const midnight = first + i * DAY;
    const p = jstDate(midnight, cfg);
    if (!cfg.weekdays.includes(p.dow)) continue;
    if (holidays.has(dayKey(midnight, cfg))) continue;

    for (let t = open; t + cfg.slotMinutes <= close; t += cfg.stepMinutes) {
      const start = midnight + t * MIN;
      const end = start + cfg.slotMinutes * MIN;
      if (start < deadline) continue;
      // 前後のバッファも含めて、埋まっている時間帯と少しでも重なれば除外
      const from = start - buffer;
      const to = end + buffer;
      const clash = busy.some((b) => b.start < to && b.end > from);
      if (!clash) out.push({ start, end });
    }
  }
  return out;
}
