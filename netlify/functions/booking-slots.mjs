// 空き枠取得API: GET /api/booking/slots
// 担当者カレンダーの埋まり状況と祝日から、予約できる枠を計算して返す
import { decideMode, json, rateLimited, availableSlots, BOOKING } from '../booking/common.mjs';
import { toIso } from '../booking/slots.mjs';

export default async (req, context) => {
  if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });
  if (rateLimited('slots:' + ((context && context.ip) || ''), 60, 60 * 1000)) return json(429, { error: 'rate_limited' });

  const m = decideMode(context);
  if (m.mode === 'unavailable') return json(503, { error: 'unavailable' });

  try {
    const slots = await availableSlots(m, Date.now());
    return json(200, {
      mock: m.mode === 'mock',
      timeZone: BOOKING.timeZone,
      slots: slots.map((s) => ({ start: toIso(s.start), end: toIso(s.end) })),
    });
  } catch (err) {
    // 個人情報は記録しない(エラーの種類だけ)
    console.error('booking-slots failed:', err && err.message, err && err.status, (err && err.reason) || '');
    return json(503, { error: 'unavailable' });
  }
};

export const config = { path: '/api/booking/slots' };
