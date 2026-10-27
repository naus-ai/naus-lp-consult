# naus-lp-consult

株式会社naus「AIコンサル(採用担当者向け)」のランディングページ。Netlifyで公開する。

- 中身は静的HTML1ファイル(`index.html`)+ 画像・アイコン(`assets/`)のみ。ビルド不要。
- 制作の経緯・意思決定ログは事業運営リポジトリ `naus-ai-ops` 側にある(このリポジトリには含めない)。
- 更新方法: `index.html` を直接編集して commit → push すれば、Netlifyが自動でビルド・公開する
  (GitHub連携後)。

## フォームの送信を Slack に知らせる
- `netlify/functions/submission-created.mjs`：資料請求・問い合わせのフォーム（通常 LP・士業 LP）が送信されたら、Slack の `#new-leads` に、フォームの項目すべて（取引先・取引先責任者・メール・電話・内容と、そのほかの項目）・受け付けた日時・送信したページを知らせる。IP アドレスとブラウザの種類は載せない
- Netlify が送信を確かめたあと、Netlify 自身の署名付きの合図でだけ動く（外からは呼べない）。Slack に送れなくても、フォームの送信は受け付け済み
- `netlify/functions/booking-create.mjs`：予約の画面で無料相談の予約が確定したら（Google カレンダーに予定ができたら）、同じ `#new-leads` に、何経由か・取引先・取引先責任者・メール・電話・予約の日時・受け付けた日時・内容・流入元・予約したページを知らせる。流入元は、フォームの隠し項目と同じ7つ（utm_source・utm_medium・utm_campaign・utm_content・utm_term・landing_page・referrer_host。`assets/source-fields/source-fields.js` がこのブラウザに30日間覚えたもの）を、予約の画面が一緒に送り、サーバーで形と長さを確かめてから「項目名：値」で載せる（合わないものは（未記入）。予約は止めない）。何経由か（資料請求のあと・問い合わせのあと など）とページは、予約したページの URL（この LP のページのときだけ）から決める。仮の予約や、入力の不備・枠が埋まっていたときは知らせない。Slack に送れなくても、予約の結果は変わらない。カレンダーの予定（お客様に招待が届く）には載せない
- 送り先の鍵は Netlify の環境変数 `SLACK_WEBHOOK_URL`（秘密）。Slack のアプリ「New Leads」の Incoming Webhook の URL。コードには置かない
- テスト（文の作り方・Slack への送り方・関数から知らせる流れ）：`node --test netlify/notify/*.test.mjs`
