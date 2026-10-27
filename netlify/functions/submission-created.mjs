// フォームの送信（資料請求・問い合わせ）を受け付けたら、Slack の #new-leads に知らせる。
// ファイル名 submission-created が「フォームの送信が確かめられた」ときの合図にあたる。迷惑な送信のふるい分けのあとに、
// Netlify 自身の署名付きの合図でだけ動く（外からは呼べない）。
// 送り先の鍵（Slack の Incoming Webhook の URL）は、Netlify の環境変数 SLACK_WEBHOOK_URL（秘密）に置き、コードには置かない（送り方は notify/slack.mjs）。
// Slack に送れなくても、フォームの送信はもう受け付け済み（お客様の画面は変わらない）。記録に個人の情報は残さない
import { buildNewLeadMessage } from '../notify/new-lead-message.mjs';
import { postToSlack } from '../notify/slack.mjs';

export default async (req) => {
  let payload;
  try {
    ({ payload } = await req.json());
  } catch {
    console.error('フォームの送信の中身を読めませんでした');
    return new Response('ok');
  }
  const message = buildNewLeadMessage(payload);
  if (message) await postToSlack(message);
  return new Response('ok');
};
