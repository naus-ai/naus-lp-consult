// フォームの受け口: POST /api/form
// 資料請求・問い合わせのフォームは、Netlify Forms ではなくここに送る。Netlify Forms は迷惑メールと判定した送信では
// submission-created も通知も動かさず、本物の送信が消えるため（本番で確認済み）、判定に左右されない1本の道にする。
// 流れ：①お客様の画面を先に「ありがとうございました」のページへ移す（303）→ ②そのあと、CRM の受付窓口に送る
// （届かなければ予備の Slack）と、Netlify のフォームにも同じ内容を送る（Netlify の画面に記録を残すだけ。迷惑判定されても構わない）。
// 迷惑対策の隠し欄（bot-field）に値があるものは機械なので、受付窓口にも Slack にも送らない（記録にだけ残す）。
// 移し先は、フォームごとに決まった表だけ（要求から取らない＝外部への転送に使えない）。
// 鍵は受付窓口の INTAKE_URL・INTAKE_KEY と Slack の SLACK_WEBHOOK_URL（Netlify の環境変数）だけで、新しい鍵はない。
// 記録に残すのは、出来事の名前と状態の番号だけ（入力された値・メール・鍵は残さない）
import { randomUUID } from 'node:crypto';
import { sameOrigin, rateLimited } from '../booking/common.mjs';
import { buildNewLeadMessage } from '../notify/new-lead-message.mjs';
import { postToSlack } from '../notify/slack.mjs';
import { sendToIntake } from '../notify/intake.mjs';

export const FORM_INTAKE_TIMEOUT_MS = 6000;
export const FORM_FALLBACK_SLACK_TIMEOUT_MS = 3000;
export const FORM_RECORD_TIMEOUT_MS = 3000;
// 同じ接続元から10分に10回まで（実行環境ごとのメモリで数える目安の歯止め）
export const FORM_RATE_LIMIT = 10;
export const FORM_RATE_WINDOW_MS = 10 * 60 * 1000;
export const FORM_MAX_BODY_BYTES = 64 * 1024;
export const FORM_MAX_FIELDS = 100;

const SITE = 'https://ai.naus.co.jp/';
// フォーム名 → ありがとうございました のページ（各フォームの、これまでの action と同じ）。null は画面を移さない（fetch で送るので 204）
export const THANKS = {
  'document-download': '/thanks.html',
  contact: '/contact-thanks.html',
  'shigyo-download': '/shigyo/thanks/',
  'shigyo-contact': '/shigyo/contact-thanks/',
  'crm-download': '/crm/thanks/',
  'crm-contact': '/crm/contact-thanks/',
  'crm-doc-pdf': null,
};
// 受付窓口に送らない項目（ここで足す印・迷惑対策の欄・Netlify が足す項目）
const NOT_FORWARDED = new Set(['bot-field', 'ip', 'user_agent', 'referrer', 'via']);

function reply(status, headers = {}) {
  return new Response(null, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

// 上限を超えたら null（大きな本文を最後まで読まない）
async function readLimited(req, max) {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// この LP のページのときだけ、送信したページとして残す
function ourPage(value) {
  const page = typeof value === 'string' ? value.trim() : '';
  return page.startsWith(SITE) ? page : '';
}

// Netlify のフォームに記録だけ残す（投げない）。via=form-submit は「ここで処理済み」の印で、submission-created が見て何もしない
async function recordToNetlify(origin, fields) {
  try {
    const body = new URLSearchParams({ ...fields, via: 'form-submit' });
    const res = await fetch(`${origin}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(FORM_RECORD_TIMEOUT_MS),
    });
    if (res.status >= 400) console.error('form-submit: Netlify への記録に失敗しました', res.status);
  } catch (error) {
    console.error('form-submit: Netlify への記録に失敗しました', error?.name ?? 'unknown');
  }
}

// 受付窓口に送り、届かなかったときだけ Slack に直接知らせる（先頭に「⚠」）。投げない
async function notify(id, formName, fields, page) {
  try {
    const sent = {};
    for (const [key, value] of Object.entries(fields)) if (!NOT_FORWARDED.has(key)) sent[key] = value;
    sent['form-name'] = formName;
    const delivered = await sendToIntake({ kind: 'form', id, page, fields: sent }, process.env, fetch, Date.now, FORM_INTAKE_TIMEOUT_MS);
    if (delivered) return;
    const payload = { id, form_name: formName, created_at: new Date().toISOString(), data: { ...sent, referrer: page } };
    const message = buildNewLeadMessage(payload, { fallback: true });
    if (message) await postToSlack(message, FORM_FALLBACK_SLACK_TIMEOUT_MS);
  } catch {
    console.error('form-submit: 知らせを送れませんでした');
  }
}

export default async (req, context) => {
  if (req.method !== 'POST') return reply(405, { Allow: 'POST' });
  if (!sameOrigin(req)) return reply(403);
  if (!(req.headers.get('content-type') || '').toLowerCase().startsWith('application/x-www-form-urlencoded')) return reply(415);
  if (rateLimited('form:' + ((context && context.ip) || ''), FORM_RATE_LIMIT, FORM_RATE_WINDOW_MS)) return reply(429);

  let raw;
  try {
    raw = await readLimited(req, FORM_MAX_BODY_BYTES);
  } catch {
    return reply(400);
  }
  if (raw === null) return reply(413);

  const fields = {};
  for (const [key, value] of new URLSearchParams(raw)) {
    if (Object.hasOwn(fields, key)) continue; // 同じ名前が重なったら最初の値
    if (Object.keys(fields).length >= FORM_MAX_FIELDS) return reply(400);
    fields[key] = value;
  }
  const formName = fields['form-name'];
  if (typeof formName !== 'string' || !Object.hasOwn(THANKS, formName)) return reply(400);

  const robot = typeof fields['bot-field'] === 'string' && fields['bot-field'].trim() !== '';
  const origin = new URL(req.url).origin;
  const work = async () => {
    const jobs = [recordToNetlify(origin, fields)];
    if (robot) console.error('form-submit: 迷惑対策の欄に値があるため、受付窓口には送りません');
    else jobs.push(notify(randomUUID(), formName, fields, ourPage(req.headers.get('referer'))));
    await Promise.allSettled(jobs);
  };

  const thanks = THANKS[formName];
  const response = thanks ? reply(303, { Location: thanks }) : reply(204);
  // お客様への返事を先に返し、知らせは返事のあとに続ける（context.waitUntil がなければ、返事の前に済ませる）
  if (context && typeof context.waitUntil === 'function') context.waitUntil(work());
  else await work();
  return response;
};

export const config = { path: '/api/form' };
