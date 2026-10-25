// Slack の #new-leads に知らせる（フォームの送信と、無料相談の予約で共通）。
// 送り先の鍵（Slack の Incoming Webhook の URL）は、Netlify の環境変数 SLACK_WEBHOOK_URL（秘密）に置き、コードには置かない。
// 送れなくても例外にはしない（受け付けた送信・予約は、そのまま）。
// 記録に残すのは、失敗したことと、状態の番号・エラーの種類だけ（送り先の URL や、文の中の個人の情報は残さない）
const SLACK_PREFIX = 'https://hooks.slack.com/services/';

// 送れたら true、送らなかった・送れなかったら false
export async function postToSlack(message) {
  // Slack の URL のときだけ送る（設定の間違いで、ほかの送り先に中身を送らないように）
  const url = process.env.SLACK_WEBHOOK_URL ?? '';
  if (!url.startsWith(SLACK_PREFIX)) {
    console.error('SLACK_WEBHOOK_URL が未設定か、Slack の URL ではありません');
    return false;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error('Slack への通知に失敗しました', res.status);
    return res.ok;
  } catch (error) {
    console.error('Slack への通知に失敗しました', error?.name ?? 'unknown');
    return false;
  }
}
