// 予約APIの共通部品(動作モードの判定・入力チェック・連続送信の制限・仮データ)
import { BOOKING } from './config.mjs';
import { readEnv, hasCredentials } from './google.mjs';
import { jstDate, queryRange } from './slots.mjs';

// 動作モード
//  live        … 環境変数に認証情報がある → 本物のGoogleカレンダーを使う
//  mock        … 認証情報がなく、本番以外(デプロイプレビュー等)で動いている → 仮の空き枠で動かす
//  unavailable … 認証情報がない本番 → 予約APIは使えない(画面は外部の予約ページを案内する)
// 本番か否かが判定できない場合は、本番として扱う(仮データが本番で動かないように)
const NON_PRODUCTION = ['deploy-preview', 'branch-deploy', 'dev'];

export function decideMode(context, env = process.env) {
  const e = readEnv(env);
  if (hasCredentials(e)) return { mode: 'live', env: e };
  const deploy = context && context.deploy && context.deploy.context;
  if (NON_PRODUCTION.includes(deploy)) return { mode: 'mock' };
  return { mode: 'unavailable' };
}

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// 同じサイトのページからの呼び出しだけを受け付ける
export function sameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    return origin === new URL(req.url).origin;
  } catch {
    return false;
  }
}

// 連続送信の簡易制限(同じ接続元から短時間に何度も呼ばれたら断る)
// 実行環境ごとのメモリで数えるため、厳密な上限ではない(目安の歯止め)
const hits = new Map();
export function rateLimited(key, limit, windowMs, now = Date.now()) {
  if (!key) return false;
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > limit;
}

// ---- 入力チェック ----
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function text(v, max, { multiline = false } = {}) {
  if (typeof v !== 'string') return '';
  let s = v.replace(CTRL, '');
  if (!multiline) s = s.replace(/[\r\n\t]+/g, ' ');
  s = s.trim();
  return s.length > max ? null : s;
}

const EMAIL = /^[^\s@<>()"',;:\\]+@[^\s@<>()"',;:\\]+\.[^\s@<>()"',;:\\]{2,}$/;

export function validateBooking(body) {
  const errors = {};
  const out = {};
  const b = body && typeof body === 'object' ? body : {};

  out.source = b.source === 'shigyo' ? 'shigyo' : 'consult';

  const fields = [
    ['name', 50],
    ['company', 100],
    ['email', 254],
    ['phone', 30],
  ];
  for (const [key, max] of fields) {
    const v = text(b[key], max);
    if (v === null) errors[key] = 'too_long';
    else if (!v) errors[key] = 'required';
    else out[key] = v;
  }
  if (out.email && !EMAIL.test(out.email)) errors.email = 'invalid';
  if (out.phone) {
    const half = out.phone.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[－ー‐]/g, '-');
    const digits = half.replace(/\D/g, '');
    if (!/^[0-9+\-() ]+$/.test(half) || digits.length < 10 || digits.length > 15) errors.phone = 'invalid';
    else out.phone = half;
  }
  const message = text(b.message, 1000, { multiline: true });
  if (message === null) errors.message = 'too_long';
  else out.message = message;

  const start = typeof b.start === 'string' ? Date.parse(b.start) : NaN;
  if (!Number.isFinite(start)) errors.start = 'invalid';
  else out.start = start;

  return { ok: Object.keys(errors).length === 0, errors, value: out };
}

// ---- 仮データ(デプロイプレビューで認証情報がないときだけ使う) ----
// 実在の予定ではなく、画面の流れを確かめるための決まった並びの「埋まり」を作る
const mockBooked = [];

export function mockBusy(now) {
  const { start, end } = queryRange(now);
  const busy = [];
  const H = 60 * 60 * 1000;
  for (let day = start, i = 0; day < end; day += 24 * H, i++) {
    const p = jstDate(day);
    if (p.dow === 0 || p.dow === 6) continue;
    const at = (h, m = 0) => day + (h * 60 + m) * 60 * 1000;
    busy.push({ start: at(12), end: at(13) });                      // 毎日の昼休み
    if (i % 3 === 0) busy.push({ start: at(15), end: at(16, 30) }); // 3日に1回の打合せ
    if (i % 4 === 1) busy.push({ start: at(14), end: at(19) });     // 4日に1回は午後がまるごと埋まり
  }
  return busy.concat(mockBooked);
}

export function mockBook(startMs, endMs) {
  mockBooked.push({ start: startMs, end: endMs });
}

export { BOOKING };

// ---- 予約できる枠の取得(本物/仮データ共通) ----
import { computeSlots } from './slots.mjs';
import { getBusy, getHolidays } from './google.mjs';

export async function availableSlots(m, now) {
  const { start, end } = queryRange(now);
  let busy;
  let holidays;
  if (m.mode === 'mock') {
    busy = mockBusy(now);
    holidays = new Set();
  } else {
    [busy, holidays] = await Promise.all([getBusy(m.env, start, end), getHolidays(m.env, start, end)]);
  }
  return computeSlots({ now, busy, holidays });
}
