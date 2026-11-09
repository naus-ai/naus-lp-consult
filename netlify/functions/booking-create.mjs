// 予約作成API: POST /api/booking/create
// 登録の直前に「枠がまだ空いているか」「締め切りを過ぎていないか」をサーバー側で確認し直してから、
// Googleカレンダーに予定を作る(Google Meetを自動発行し、申込者に招待メールを送る)
// 予約が確定したら、Slack の #new-leads にも知らせる(社内向け。カレンダーの予定には入れない)
import { randomUUID } from 'node:crypto';
import {
  decideMode, json, sameOrigin, rateLimited, validateBooking, availableSlots, mockBook, BOOKING,
} from '../booking/common.mjs';
import { TITLES, COMPANY_LABELS, ROUTE_MEMOS } from '../booking/config.mjs';
import { toIso } from '../booking/slots.mjs';
import { insertEvent, listEvents, deleteEvent, getEvent, meetUrl } from '../booking/google.mjs';
import { buildBookingMessage } from '../notify/new-lead-message.mjs';
import { postToSlack } from '../notify/slack.mjs';
import { sendToIntake } from '../notify/intake.mjs';

const MIN = 60 * 1000;

// 予約が入ったことを、CRM の受付窓口に送る。届かなかったときだけ、Slack の #new-leads に直接知らせる（先頭に「⚠」）。
// 何経由か・予約したページは、要求の Referer(この LP のページのときだけ)から決める。
// 知らせに失敗しても、お客様への返事(予約の結果)は変えない。記録に個人の情報は残さない
const SOURCE_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'landing_page', 'referrer_host', 'doc_code'];

async function notifyIntake(v, slot, route, created, referrer, receivedAt) {
  try {
    const fields = {
      source: v.source,
      start: toIso(slot.start),
      end: toIso(slot.end),
      route,
      name: v.name,
      company: v.company,
      email: v.email,
      phone: v.phone,
      message: v.message,
    };
    for (const key of SOURCE_KEYS) fields[key] = v[key];
    const delivered = await sendToIntake({ kind: 'booking', id: String(created.id), page: referrer || '', fields });
    if (delivered) return;
    await postToSlack(buildBookingMessage({ ...v, start: slot.start, end: slot.end, referrer }, receivedAt, { fallback: true }), 4000);
  } catch {
    console.error('予約の知らせを送れませんでした');
  }
}

function buildEvent(v, start, end, memo) {
  const title = TITLES[v.source].replace('{company}', v.company).replace('{name}', v.name);
  const lines = [
    `氏名: ${v.name}`,
    `${COMPANY_LABELS[v.source]}: ${v.company}`,
    `メールアドレス: ${v.email}`,
    `電話番号: ${v.phone}`,
    '',
    '相談内容:',
    v.message || '(記入なし)',
  ];
  if (memo) lines.push('', memo);
  const description = lines.join('\n');
  return {
    summary: title,
    description,
    start: { dateTime: toIso(start), timeZone: BOOKING.timeZone },
    end: { dateTime: toIso(end), timeZone: BOOKING.timeZone },
    attendees: [{ email: v.email, displayName: v.name }],
    conferenceData: {
      createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
    },
  };
}

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!sameOrigin(req)) return json(403, { error: 'forbidden' });
  if (rateLimited('create:' + ((context && context.ip) || ''), 5, 10 * MIN)) return json(429, { error: 'rate_limited' });

  let body;
  try {
    const raw = await req.text();
    if (raw.length > 10000) return json(413, { error: 'too_large' });
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  // スパム対策: 人には見えない入力欄に値が入っていたら受け付けない
  if (body && typeof body.website === 'string' && body.website.trim() !== '') return json(400, { error: 'invalid' });

  const check = validateBooking(body);
  if (!check.ok) return json(400, { error: 'validation', fields: check.errors });
  const v = check.value;
  // 予約したページの目印: 決まった値のときだけ、決まった文言にする(それ以外の値は無視する)
  const route = typeof body.route === 'string' && Object.hasOwn(ROUTE_MEMOS, body.route) ? body.route : '';
  const memo = route ? ROUTE_MEMOS[route] : '';

  const m = decideMode(context);
  if (m.mode === 'unavailable') return json(503, { error: 'unavailable' });

  try {
    // 枠がまだ空いているか・締め切り前か・受付時間内か を、最新の状態で確認し直す
    const now = Date.now();
    const slots = await availableSlots(m, now);
    const slot = slots.find((s) => s.start === v.start);
    if (!slot) return json(409, { error: 'slot_unavailable' });

    if (m.mode === 'mock') {
      mockBook(slot.start, slot.end);
      return json(200, { ok: true, mock: true, start: toIso(slot.start), end: toIso(slot.end), meetUrl: '' });
    }

    const created = await insertEvent(m.env, buildEvent(v, slot.start, slot.end, memo));

    // ほぼ同時に同じ枠へ別の予約が入った場合に備え、登録後にもう一度重なりを確認する。
    // 自分より先に作られた予定と重なっていたら、自分の予定を取り消してエラーを返す
    const buffer = BOOKING.bufferMinutes * MIN;
    const around = await listEvents(m.env, slot.start - buffer, slot.end + buffer);
    const earlier = around.some((ev) => {
      if (ev.id === created.id) return false;
      const s = Date.parse((ev.start && (ev.start.dateTime || ev.start.date)) || '');
      const e = Date.parse((ev.end && (ev.end.dateTime || ev.end.date)) || '');
      const overlaps = s < slot.end + buffer && e > slot.start - buffer;
      return overlaps && Date.parse(ev.created || 0) <= Date.parse(created.created || 0);
    });
    if (earlier) {
      await deleteEvent(m.env, created.id);
      return json(409, { error: 'slot_unavailable' });
    }

    // 予約が確定した(本物の予定ができ、ほかの予約とも重ならなかった)ので、Slack に知らせる。
    // 仮の予約・入力の不備・枠が埋まっていたときは、ここまで来ないので知らせない
    await notifyIntake(v, slot, route, created, req.headers.get('referer'), now);

    // Meetの発行が少し遅れることがあるため、無ければ一度だけ取り直す
    let url = meetUrl(created);
    if (!url) {
      await new Promise((r) => setTimeout(r, 1500));
      url = meetUrl(await getEvent(m.env, created.id));
    }
    return json(200, { ok: true, start: toIso(slot.start), end: toIso(slot.end), meetUrl: url });
  } catch (err) {
    console.error('booking-create failed:', err && err.message, err && err.status, (err && err.reason) || '');
    return json(503, { error: 'unavailable' });
  }
};

export const config = { path: '/api/booking/create' };
