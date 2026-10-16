// Googleカレンダーとの通信(認証・空き状況・祝日・予定の作成)
// 認証情報はNetlifyの環境変数から読む。コードには一切書かない
import { BOOKING } from './config.mjs';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';

export class GoogleError extends Error {
  constructor(message, status, reason = '') {
    super(message);
    this.status = status;
    this.reason = reason; // Googleが返したエラー名(invalid_grant / notFound など。秘密の値は含まない)
  }
}

// エラー名だけを取り出す。英字と記号の短い名前だけを通し、それ以外(説明文・IDなど)はログに出さない
function safeName(v) {
  return typeof v === 'string' && /^[A-Za-z_.]{1,60}$/.test(v) ? v : '';
}

// Googleのエラー応答から、エラー名と理由だけを取り出す
async function errorReason(res) {
  try {
    const b = await res.json();
    if (typeof b.error === 'string') return safeName(b.error); // 合鍵の確認: invalid_grant / invalid_client など
    const e = b.error || {};
    const reasons = (e.errors || []).map((x) => safeName(x.reason)).filter(Boolean);
    return [safeName(e.status)].concat(reasons).filter(Boolean).join(',') || 'unknown';
  } catch {
    return 'unknown';
  }
}

export function readEnv(env = process.env) {
  return {
    clientId: env.GOOGLE_CLIENT_ID || '',
    clientSecret: env.GOOGLE_CLIENT_SECRET || '',
    refreshToken: env.GOOGLE_REFRESH_TOKEN || '',
    calendarId: env.BOOKING_CALENDAR_ID || '',
  };
}

export function hasCredentials(e) {
  return Boolean(e.clientId && e.clientSecret && e.refreshToken && e.calendarId);
}

// アクセストークンは1時間ほど有効。同じ実行環境の中では使い回す
let cached = { token: '', exp: 0 };

async function accessToken(e) {
  if (cached.token && Date.now() < cached.exp - 60 * 1000) return cached.token;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: e.clientId,
      client_secret: e.clientSecret,
      refresh_token: e.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new GoogleError('token', res.status, await errorReason(res));
  const data = await res.json();
  cached = { token: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000 };
  return cached.token;
}

async function call(e, path, { method = 'GET', query, body } = {}) {
  const token = await accessToken(e);
  const url = new URL(API + path);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new GoogleError(`${method} ${path.split('/')[1]}`, res.status, await errorReason(res));
  return res.json();
}

// 担当者カレンダーの埋まっている時間帯
export async function getBusy(e, startMs, endMs) {
  const data = await call(e, '/freeBusy', {
    method: 'POST',
    body: {
      timeMin: new Date(startMs).toISOString(),
      timeMax: new Date(endMs).toISOString(),
      timeZone: BOOKING.timeZone,
      items: [{ id: e.calendarId }],
    },
  });
  const cal = data.calendars && data.calendars[e.calendarId];
  if (!cal) throw new GoogleError('freeBusy calendar', 502, 'calendar_missing_in_response');
  if (cal.errors && cal.errors.length) {
    throw new GoogleError('freeBusy calendar', 502, cal.errors.map((x) => safeName(x.reason)).filter(Boolean).join(',') || 'unknown');
  }
  return (cal.busy || []).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
}

// Googleの「日本の祝日」カレンダーの予定が、国民の祝日(振替休日を含む)かどうか
// 説明欄の1行目が「祝日」なら祝日、「祭日」なら記念日(七五三・クリスマス・節分など)。
// 記念日の説明欄の2行目には「…[日本の祝日] に移動してください」と「祝日」の文字が入るため、1行目だけで判定する。
// 説明欄が無い場合は、予約を誤って受けないよう祝日として扱う
export function isPublicHoliday(ev) {
  const d = (ev && ev.description) || '';
  if (!d.trim()) return true;
  return d.split(/\r?\n|\\n/)[0].trim() === '祝日';
}

// 期間内の祝日('YYYY-MM-DD'の集合)
export async function getHolidays(e, startMs, endMs) {
  const data = await call(e, `/calendars/${encodeURIComponent(BOOKING.holidayCalendarId)}/events`, {
    query: {
      timeMin: new Date(startMs).toISOString(),
      timeMax: new Date(endMs).toISOString(),
      singleEvents: 'true',
      maxResults: 100,
    },
  });
  const set = new Set();
  for (const ev of data.items || []) {
    if (isPublicHoliday(ev) && ev.start && ev.start.date) set.add(ev.start.date);
  }
  return set;
}

// 指定した時間帯に入っている予定(キャンセル済み・「空き時間」扱いの予定は除く)
export async function listEvents(e, startMs, endMs) {
  const data = await call(e, `/calendars/${encodeURIComponent(e.calendarId)}/events`, {
    query: {
      timeMin: new Date(startMs).toISOString(),
      timeMax: new Date(endMs).toISOString(),
      singleEvents: 'true',
      maxResults: 50,
    },
  });
  return (data.items || []).filter((ev) => ev.status !== 'cancelled' && ev.transparency !== 'transparent');
}

// 予定を作る(Google Meetを自動発行し、参加者に招待メールを送る)
export async function insertEvent(e, event) {
  return call(e, `/calendars/${encodeURIComponent(e.calendarId)}/events`, {
    method: 'POST',
    query: { conferenceDataVersion: 1, sendUpdates: 'all' },
    body: event,
  });
}

export async function getEvent(e, id) {
  return call(e, `/calendars/${encodeURIComponent(e.calendarId)}/events/${encodeURIComponent(id)}`);
}

export async function deleteEvent(e, id) {
  return call(e, `/calendars/${encodeURIComponent(e.calendarId)}/events/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: { sendUpdates: 'all' },
  });
}

// 予定に付いたMeetのURL
export function meetUrl(ev) {
  if (!ev) return '';
  if (ev.hangoutLink) return ev.hangoutLink;
  const ep = ev.conferenceData && (ev.conferenceData.entryPoints || []).find((p) => p.entryPointType === 'video');
  return ep ? ep.uri : '';
}
