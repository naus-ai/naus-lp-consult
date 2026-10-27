// フォームの送信（資料請求・問い合わせ）と、無料相談の予約を Slack に知らせる文を作る。
// 載せるのは、フォーム・予約の画面で受け取った項目すべて（取引先・取引先責任者・メール・電話・内容と、そのほかの項目）、受け付けた日時、
// 送信・予約したページ（この LP のページのときだけ）。予約は、何経由かと予約の日時も載せる。流入元（UTM など）は、そのほかの項目として載る。
// IP アドレスとブラウザの種類は載せない（IS の対応には使わない個人の手がかりのため）

// どのフォームか（form-name）→ 見出しと、取引先（会社名・事務所名）と電話の欄の名前
export const FORMS = {
  'document-download': { title: '新しい資料請求（通常 LP）', company: 'company', phone: 'phone' },
  contact: { title: '新しい問い合わせ（通常 LP）', company: 'company', phone: 'phone' },
  'shigyo-download': { title: '新しい資料請求（士業 LP）', company: 'office', phone: 'tel' },
  'shigyo-contact': { title: '新しい問い合わせ（士業 LP）', company: 'office', phone: 'tel' },
};

const MAX_FIELD = 200;
const MAX_MESSAGE = 1000;
const EMPTY = '（未記入）';
const SITE = 'https://ai.naus.co.jp/';
// 「そのほかの項目」に出さないもの（決まった行に出す項目と、Netlify が足す項目）
const KNOWN = new Set(['form-name', 'bot-field', 'company', 'office', 'name', 'email', 'phone', 'tel', 'message', 'ip', 'user_agent', 'referrer']);

// Slack の書き方で意味を持つ文字を逃がす（名前などに <!channel> や <https://…|…> を入れられても、メンションやリンクにしない）
export function escapeSlack(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function clip(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// 1行の欄（空白をならす）
function line(data, key) {
  const value = typeof data?.[key] === 'string' ? data[key].replace(/\s+/g, ' ').trim() : '';
  return value ? escapeSlack(clip(value, MAX_FIELD)) : EMPTY;
}

// 内容（改行は残す）
function body(data) {
  const value = typeof data?.message === 'string' ? data.message.replace(/\r\n?/g, '\n').trim() : '';
  return value ? escapeSlack(clip(value, MAX_MESSAGE)) : EMPTY;
}

// そのほかの項目の行（あとでフォーム・予約の画面に足した項目も、ここに出る）
function otherLines(data, known) {
  const lines = [];
  for (const key of Object.keys(data)) {
    if (known.has(key) || typeof data[key] !== 'string') continue;
    lines.push(`${escapeSlack(clip(key, 50))}：${line(data, key)}`);
  }
  return lines;
}

// この LP のページの URL（? のあとも残す）。ほかのサイトのものや、ないときは ''
function ourPage(value) {
  const page = typeof value === 'string' ? value.trim() : '';
  return page.startsWith(SITE) ? page : '';
}

// 送信・予約したページの行（この LP のページのときだけ）
function pageLines(value) {
  const page = ourPage(value);
  return page ? [`ページ：${escapeSlack(clip(page, MAX_FIELD))}`] : [];
}

// 受け付けた日時を日本時間の「2026/10/25 21:30」にする（読めないときは null）
export function formatJst(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

// Netlify の送信の中身（payload）から、Slack に送る文を作る。知らせないフォームなら null
export function buildNewLeadMessage(payload) {
  const formName = payload?.form_name ?? payload?.data?.['form-name'];
  const form = FORMS[formName];
  if (!form) return null;
  const data = payload.data ?? {};
  const name = line(data, 'name');
  const lines = [
    `*${form.title}*`,
    `取引先：${line(data, form.company)}`,
    `取引先責任者：${name === EMPTY ? EMPTY : `${name}さん`}`,
    `メール：${line(data, 'email')}`,
    `電話：${line(data, form.phone)}`,
  ];
  const at = formatJst(payload.created_at);
  if (at) lines.push(`受付：${at}`);
  lines.push(`内容：${body(data)}`);
  lines.push(...otherLines(data, KNOWN));
  lines.push(...pageLines(data.referrer));
  // リンクの下見（プレビュー）は出さない
  return { text: lines.join('\n'), unfurl_links: false, unfurl_media: false };
}

// ---- 無料相談の予約 ----

// 予約の画面がどの LP のものか（予約の API が決める source。booking/config.mjs の TITLES と同じ分け方）→ 呼び名
const LPS = { consult: '通常 LP', shigyo: '士業 LP' };

// 何経由か：予約したページのパス → 呼び名。予約の画面の計測（assets/booking/booking.js の page_type）と同じ分け方・同じ順番。
// どれにも当たらないページ（LP）は、LP の呼び名にする
const ROUTES = [
  [/\/crm-doc/, 'CRM 運用見直しの資料ページ'],
  [/\/shigyo\/material/, 'フォーム営業用の資料ページ'],
  [/contact-thanks/, '問い合わせのあと'],
  [/\/thanks/, '資料請求のあと'],
  [/\/document/, '資料ページ'],
];
const UNKNOWN = '（不明）';

// 予約の「そのほかの項目」に出さないもの（決まった行に出す項目と、迷惑対策の隠し欄、IP とブラウザの種類）
const BOOKING_KNOWN = new Set([
  'source', 'start', 'end', 'name', 'company', 'email', 'phone', 'message', 'referrer', 'website', 'ip', 'user_agent',
]);

// 日時（ミリ秒か ISO の文字列）を、日本時間の「2026/10/25 21:30」にする（それ以外や、読めないときは null）
function jst(value) {
  return typeof value === 'number' || typeof value === 'string' ? formatJst(value) : null;
}

// 予約の日時を「2026/10/27 10:00〜10:30」にする（0時をまたぐときは、終わりにも日付を付ける）
function slotText(start, end) {
  const from = jst(start);
  if (!from) return EMPTY;
  const to = jst(end);
  if (!to) return from;
  const [fromDay] = from.split(' ');
  const [toDay, toTime] = to.split(' ');
  return `${from}〜${toDay === fromDay ? toTime : to}`;
}

// 何経由か（予約したページから決める。分からないときは LP の呼び名、それも分からなければ受け取った source を逃がして出す）
function route(booking, lp) {
  const page = ourPage(booking.referrer);
  if (page) {
    let path = '';
    try {
      path = new URL(page).pathname;
    } catch {
      path = '';
    }
    const hit = ROUTES.find(([pattern]) => pattern.test(path));
    if (hit) return hit[1];
  }
  if (lp) return lp;
  const raw = line(booking, 'source');
  return raw === EMPTY ? UNKNOWN : raw;
}

// 無料相談の予約から、Slack に送る文を作る。
// booking：予約の API で確かめた値（source・name・company・email・phone・message と、流入元の7項目）と、予約の枠の始まりと終わり
//   （start・end。ミリ秒か ISO の文字列）、予約したページ（referrer。要求の Referer）
// receivedAt：受け付けた日時（ミリ秒か ISO の文字列）
export function buildBookingMessage(booking, receivedAt) {
  const data = booking && typeof booking === 'object' ? booking : {};
  const lp = Object.hasOwn(LPS, data.source) ? LPS[data.source] : '';
  const name = line(data, 'name');
  const lines = [
    `*新しい無料相談の予約${lp ? `（${lp}）` : ''}*`,
    `経由：${route(data, lp)}`,
    `取引先：${line(data, 'company')}`,
    `取引先責任者：${name === EMPTY ? EMPTY : `${name}さん`}`,
    `メール：${line(data, 'email')}`,
    `電話：${line(data, 'phone')}`,
    `予約の日時：${slotText(data.start, data.end)}`,
  ];
  const at = jst(receivedAt);
  if (at) lines.push(`受付：${at}`);
  lines.push(`内容：${body(data)}`);
  lines.push(...otherLines(data, BOOKING_KNOWN));
  lines.push(...pageLines(data.referrer));
  // リンクの下見（プレビュー）は出さない
  return { text: lines.join('\n'), unfurl_links: false, unfurl_media: false };
}
