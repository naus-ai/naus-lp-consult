# naus-lp-consult

株式会社naus「AIコンサル(採用担当者向け)」のランディングページ。Netlifyで公開する。

- 中身は静的HTML1ファイル(`index.html`)+ 画像・アイコン(`assets/`)のみ。ビルド不要。
- 制作の経緯・意思決定ログは事業運営リポジトリ `naus-ai-ops` 側にある(このリポジトリには含めない)。
- 更新方法: `index.html` を直接編集して commit → push すれば、Netlifyが自動でビルド・公開する
  (GitHub連携後)。

## フォームの送信を Slack に知らせる
- `netlify/functions/submission-created.mjs`：資料請求・問い合わせのフォーム（通常 LP・士業 LP）が送信されたら、Slack の `#new-leads` に、フォームの項目すべて（取引先・取引先責任者・メール・電話・内容と、そのほかの項目）・受け付けた日時・送信したページを知らせる。IP アドレスとブラウザの種類は載せない
- Netlify が送信を確かめたあと、Netlify 自身の署名付きの合図でだけ動く（外からは呼べない）。Slack に送れなくても、フォームの送信は受け付け済み
- 送り先の鍵は Netlify の環境変数 `SLACK_WEBHOOK_URL`（秘密）。Slack のアプリ「New Leads」の Incoming Webhook の URL。コードには置かない
- 文の作り方のテスト：`node --test netlify/notify/new-lead-message.test.mjs`
