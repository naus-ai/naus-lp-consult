// フォームの送信（資料請求・問い合わせ）を Slack に知らせる文を作る。
// 載せるのは、フォームで受け取った項目すべて（取引先・取引先責任者・メール・電話・内容と、そのほかの項目）、受け付けた日時、
// 送信したページ（この LP のページのときだけ）。IP アドレスとブラウザの種類は載せない（IS の対応には使わない個人の手がかりのため）

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
  // そのほかの項目（あとでフォームに足した項目も、ここに出る）
  for (const key of Object.keys(data)) {
    if (KNOWN.has(key) || typeof data[key] !== 'string') continue;
    lines.push(`${escapeSlack(clip(key, 50))}：${line(data, key)}`);
  }
  const page = typeof data.referrer === 'string' ? data.referrer.trim() : '';
  if (page.startsWith(SITE)) lines.push(`ページ：${escapeSlack(clip(page, MAX_FIELD))}`);
  // リンクの下見（プレビュー）は出さない
  return { text: lines.join('\n'), unfurl_links: false, unfurl_media: false };
}
