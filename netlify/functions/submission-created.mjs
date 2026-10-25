// フォームの送信（資料請求・問い合わせ）を受け付けたら、Slack の #new-leads に知らせる。
// ファイル名 submission-created が「フォームの送信が確かめられた」ときの合図にあたる。迷惑な送信のふるい分けのあとに、
// Netlify 自身の署名付きの合図でだけ動く（外からは呼べない）。
// 送り先の鍵（Slack の Incoming Webhook の URL）は、Netlify の環境変数 SLACK_WEBHOOK_URL（秘密）に置き、コードには置かない。
// Slack に送れなくても、フォームの送信はもう受け付け済み（お客様の画面は変わらない）。記録に個人の情報は残さない
import { buildNewLeadMessage } from '../notify/new-lead-message.mjs';

const SLACK_PREFIX = 'https://hooks.slack.com/services/';

export default async (req) => {
  let payload;
  try {
    ({ payload } = await req.json());
  } catch {
    console.error('フォームの送信の中身を読めませんでした');
    return new Response('ok');
  }
  const message = buildNewLeadMessage(payload);
  if (!message) return new Response('ok');

  // Slack の URL のときだけ送る（設定の間違いで、ほかの送り先に中身を送らないように）
  const url = process.env.SLACK_WEBHOOK_URL ?? '';
  if (!url.startsWith(SLACK_PREFIX)) {
    console.error('SLACK_WEBHOOK_URL が未設定か、Slack の URL ではありません');
    return new Response('ok');
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error('Slack への通知に失敗しました', res.status);
  } catch (error) {
    console.error('Slack への通知に失敗しました', error?.name ?? 'unknown');
  }
  return new Response('ok');
};
