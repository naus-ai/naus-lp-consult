// CRM の受付窓口（POST <INTAKE_URL>/v1/submit）にフォームの送信・予約を送る。
// 送り方：見出し X-Naus-Sender: lp・X-Naus-Timestamp（UNIX 秒）・X-Naus-Signature: v1=<HMAC-SHA256(INTAKE_KEY, "秒.本文") の16進>、本文 { kind, id, page, fields }。
// 鍵（INTAKE_KEY）と送り先（INTAKE_URL）は Netlify の環境変数（秘密）で、コードには置かない。
// 受付窓口が 200（重複）か 201（受付）を返したときだけ true。それ以外・時間切れ・設定がないときは false（投げない）。
// 記録に残すのは、状態の番号かエラーの種類だけ（本文・値・鍵・URL は残さない）
import { createHmac } from 'node:crypto';

export const INTAKE_TIMEOUT_MS = 4000;

const SUFFIX = '…（長いため途中まで）';
const MAX_LONG = 5000; // 内容（message・body）
const MAX_VALUE = 500; // ほかの値
const MAX_PAGE = 2000; // ページの URL
const MAX_ID = 100;
const MAX_KEYS = 60;
const MAX_KEY_LENGTH = 60;
const LONG_KEYS = new Set(['message', 'body']);
// 送らない項目（個人の手がかり・迷惑対策の隠し欄・予約の API の迷惑対策の欄）
const NEVER_SENT = new Set(['ip', 'user_agent', 'bot-field', 'website', 'referrer']);

// 先頭から max 文字に収める。絵文字などの2文字分の文字を途中で割らない
function cut(text, max) {
  let end = max;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return text.slice(0, end);
}

// 上限を超えるときは、末尾を「…（長いため途中まで）」にして、全体が上限に収まるようにする
export function clipValue(text, max) {
  if (text.length <= max) return text;
  return cut(text, max - SUFFIX.length) + SUFFIX;
}

function clean(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (NEVER_SENT.has(key) || key.length < 1 || key.length > MAX_KEY_LENGTH) continue;
    if (typeof value !== 'string') continue;
    if (Object.keys(out).length >= MAX_KEYS) break;
    out[key] = clipValue(value, LONG_KEYS.has(key) ? MAX_LONG : MAX_VALUE);
  }
  return out;
}

// 送れたら true。送らなかった・送れなかったら false
export async function sendToIntake(item, env = process.env, fetchImpl = fetch, now = Date.now, timeoutMs = INTAKE_TIMEOUT_MS) {
  try {
    const base = env.INTAKE_URL ?? '';
    const key = env.INTAKE_KEY ?? '';
    if (!base.startsWith('https://') || !key) {
      console.error('INTAKE_URL か INTAKE_KEY が未設定か、形が違います');
      return false;
    }
    const id = typeof item?.id === 'string' ? item.id.slice(0, MAX_ID) : '';
    if (!id || (item.kind !== 'form' && item.kind !== 'booking')) {
      console.error('受付窓口に送る中身の形が違います');
      return false;
    }
    const page = typeof item.page === 'string' ? cut(item.page, MAX_PAGE) : '';
    const body = JSON.stringify({ kind: item.kind, id, page, fields: clean(item.fields) });
    const timestamp = String(Math.floor(now() / 1000));
    const signature = createHmac('sha256', key).update(`${timestamp}.${body}`).digest('hex');
    const res = await fetchImpl(`${base.replace(/\/+$/, '')}/v1/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Naus-Sender': 'lp',
        'X-Naus-Timestamp': timestamp,
        'X-Naus-Signature': `v1=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 200 || res.status === 201) return true;
    console.error('受付窓口への送信に失敗しました', res.status);
    return false;
  } catch (error) {
    console.error('受付窓口への送信に失敗しました', error?.name ?? 'unknown');
    return false;
  }
}

// Netlify のフォームの送信（payload）から、受付窓口に送る形にする。
// CRM はフォームを fields["form-name"] で見分けるので、form-name の値を入れる
export function buildFormIntakeItem(payload) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
  const formName = payload?.form_name ?? data['form-name'];
  return {
    kind: 'form',
    id: typeof payload?.id === 'string' ? payload.id : '',
    page: typeof data.referrer === 'string' ? data.referrer : '',
    fields: { ...data, 'form-name': typeof formName === 'string' ? formName : '' },
  };
}
