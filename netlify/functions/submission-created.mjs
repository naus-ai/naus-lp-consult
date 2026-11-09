// フォームの送信（資料請求・問い合わせ）を受け付けたら、Slack の #new-leads に知らせる。
// ファイル名 submission-created が「フォームの送信が確かめられた」ときの合図にあたる。迷惑な送信のふるい分けのあとに、
// Netlify 自身の署名付きの合図でだけ動く（外からは呼べない）。
// CRM の受付窓口に送れたら Slack には送らない（CRM が知らせる）。送れなかったときだけ、ここから Slack に直接知らせる。
// 送り先の鍵（Slack の Incoming Webhook の URL）は、Netlify の環境変数 SLACK_WEBHOOK_URL（秘密）に置き、コードには置かない（送り方は notify/slack.mjs）。
// Slack に送れなくても、フォームの送信はもう受け付け済み（お客様の画面は変わらない）。記録に個人の情報は残さない
import { buildNewLeadMessage } from '../notify/new-lead-message.mjs';
import { postToSlack } from '../notify/slack.mjs';
import { buildFormIntakeItem, sendToIntake } from '../notify/intake.mjs';

// フォームの送信は、お客様の画面とは関係なく動く（お客様は待っていない）ので、受付窓口を6秒まで待つ（冷えた状態の起動で4秒を超えても、予備の知らせが重ならないように）。
// 予備の Slack は3秒で諦める。6秒＋3秒＝9秒で、Netlify の時間の上限10秒に収める
export const FORM_INTAKE_TIMEOUT_MS = 6000;
export const FORM_FALLBACK_SLACK_TIMEOUT_MS = 3000;

export default async (req) => {
  let payload;
  try {
    ({ payload } = await req.json());
  } catch {
    console.error('フォームの送信の中身を読めませんでした');
    return new Response('ok');
  }
  // 知らせるフォームだけ、CRM の受付窓口に送る。届かなかったときだけ、Slack に直接知らせる（先頭に「⚠」）
  if (!buildNewLeadMessage(payload)) return new Response('ok');
  const delivered = await sendToIntake(buildFormIntakeItem(payload), process.env, fetch, Date.now, FORM_INTAKE_TIMEOUT_MS);
  if (!delivered) await postToSlack(buildNewLeadMessage(payload, { fallback: true }), FORM_FALLBACK_SLACK_TIMEOUT_MS);
  return new Response('ok');
};
