// Slack に送る文の作り方を確かめる。使い方：node --test netlify/notify/new-lead-message.test.mjs（データはすべて架空）
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBookingMessage, buildNewLeadMessage, escapeSlack, formatJst } from './new-lead-message.mjs';

const at = '2026-10-25T12:30:00.000Z'; // 日本時間 21:30

test('通常 LP の資料請求：見出し・取引先・取引先責任者・メール・電話・受付・内容を載せる', () => {
  const message = buildNewLeadMessage({
    form_name: 'document-download',
    created_at: at,
    data: {
      'form-name': 'document-download',
      company: 'test株式会社',
      name: 'test',
      email: 'test@example.test',
      phone: '03-0000-0000',
      message: 'テストです。',
    },
  });
  assert.equal(message.unfurl_links, false);
  assert.equal(message.unfurl_media, false);
  assert.equal(
    message.text,
    [
      '*新しい資料請求（通常 LP）*',
      '取引先：test株式会社',
      '取引先責任者：testさん',
      'メール：test@example.test',
      '電話：03-0000-0000',
      '受付：2026/10/25 21:30',
      '内容：テストです。',
    ].join('\n'),
  );
});

test('士業 LP の問い合わせ：事務所名（office）と電話（tel）の欄を使う', () => {
  const { text } = buildNewLeadMessage({
    form_name: 'shigyo-contact',
    created_at: at,
    data: { office: '架空社労士事務所', name: '架空 花子', email: 'h@example.test', tel: '06-0000-0000', message: '相談したい' },
  });
  assert.match(text, /^\*新しい問い合わせ（士業 LP）\*/);
  assert.match(text, /取引先：架空社労士事務所/);
  assert.match(text, /取引先責任者：架空 花子さん/);
  assert.match(text, /電話：06-0000-0000/);
});

test('CRM構築 LP の資料請求・問い合わせ：事務所名ではなく会社名（office）と電話（tel）の欄を使う', () => {
  const dl = buildNewLeadMessage({
    form_name: 'crm-download',
    created_at: at,
    data: { office: '架空商事', name: '架空 次郎', email: 'j@example.test', tel: '03-1111-1111', message: '資料希望' },
  });
  assert.match(dl.text, /^\*新しい資料請求（CRM構築 LP）\*/);
  assert.match(dl.text, /取引先：架空商事/);
  assert.match(dl.text, /取引先責任者：架空 次郎さん/);
  assert.match(dl.text, /電話：03-1111-1111/);
  const ct = buildNewLeadMessage({ created_at: at, data: { 'form-name': 'crm-contact', office: '架空商事', name: 'x' } });
  assert.match(ct.text, /^\*新しい問い合わせ（CRM構築 LP）\*/);
});

test('内容の改行は残し、長すぎるときは1000文字で切る', () => {
  const multi = buildNewLeadMessage({ form_name: 'contact', created_at: at, data: { message: '1行目\r\n2行目' } });
  assert.match(multi.text, /内容：1行目\n2行目$/);
  const long = buildNewLeadMessage({ form_name: 'contact', created_at: at, data: { message: 'あ'.repeat(1500) } });
  assert.match(long.text, new RegExp(`内容：${'あ'.repeat(1000)}…$`));
});

test('form_name がなくても、送信の中身の form-name から見分ける', () => {
  const message = buildNewLeadMessage({ created_at: at, data: { 'form-name': 'shigyo-download', name: 'x' } });
  assert.match(message.text, /新しい資料請求（士業 LP）/);
});

test('知らせないフォームは null', () => {
  assert.equal(buildNewLeadMessage({ form_name: 'newsletter', data: {} }), null);
  assert.equal(buildNewLeadMessage(null), null);
});

test('名前などの < > & は逃がし、Slack のメンションやリンクにしない', () => {
  const { text } = buildNewLeadMessage({
    form_name: 'contact',
    created_at: at,
    data: { company: '<!channel> & <https://evil.example|ここ>', name: '<@U123>', message: '<!here>' },
  });
  assert.ok(!text.includes('<!channel>'));
  assert.ok(!text.includes('<https://'));
  assert.ok(!text.includes('<@U123>'));
  assert.ok(!text.includes('<!here>'));
  assert.match(text, /&lt;!channel&gt; &amp; &lt;https:\/\/evil.example\|ここ&gt;/);
});

test('空の欄は（未記入）、長すぎる1行の欄は200文字で切る', () => {
  const { text } = buildNewLeadMessage({
    form_name: 'contact',
    created_at: at,
    data: { company: '   ', name: 'あ'.repeat(250) },
  });
  assert.match(text, /取引先：（未記入）/);
  assert.match(text, new RegExp(`取引先責任者：${'あ'.repeat(200)}…さん`));
  assert.match(text, /メール：（未記入）/);
  assert.match(text, /内容：（未記入）/);
});

test('受付の日時が読めなければ、その行を出さない', () => {
  const { text } = buildNewLeadMessage({ form_name: 'contact', created_at: 'not-a-date', data: { name: 'x' } });
  assert.ok(!text.includes('受付：'));
});

test('escapeSlack と formatJst', () => {
  assert.equal(escapeSlack('a<b>&c'), 'a&lt;b&gt;&amp;c');
  assert.equal(formatJst('2026-12-31T15:05:00Z'), '2027/01/01 00:05');
  assert.equal(formatJst('x'), null);
});

test('フォームに足した項目（UTM など）も「項目名：値」で載る。IP とブラウザの種類は載せない', () => {
  const { text } = buildNewLeadMessage({
    form_name: 'contact',
    created_at: at,
    data: {
      name: 'x',
      utm_source: 'facebook',
      utm_campaign: 'zero_kara_ai',
      ip: '203.0.113.9',
      user_agent: 'Mozilla/5.0 test',
      'bot-field': '',
    },
  });
  assert.match(text, /\nutm_source：facebook/);
  assert.match(text, /\nutm_campaign：zero_kara_ai/);
  assert.ok(!text.includes('203.0.113.9'));
  assert.ok(!text.includes('Mozilla'));
  assert.ok(!text.includes('bot-field'));
});

test('送信したページは、この LP のページのときだけ載せる', () => {
  const ours = buildNewLeadMessage({
    form_name: 'shigyo-download',
    created_at: at,
    data: { referrer: 'https://ai.naus.co.jp/shigyo/?utm_source=google' },
  });
  assert.match(ours.text, /ページ：https:\/\/ai\.naus\.co\.jp\/shigyo\/\?utm_source=google$/);
  const other = buildNewLeadMessage({
    form_name: 'shigyo-download',
    created_at: at,
    data: { referrer: 'https://evil.example/' },
  });
  assert.ok(!other.text.includes('evil.example'));
});

// ---- 流入元の7項目が空のとき、送信したページの URL から埋める ----
// スマホのアプリの中のブラウザ（Instagram・Facebook）では、ページの URL に utm があっても、隠し項目が空のまま届くことがある（2026-11-05 から）

const SOURCE_EMPTY = {
  utm_source: '',
  utm_medium: '',
  utm_campaign: '',
  utm_content: '',
  utm_term: '',
  landing_page: '',
  referrer_host: '',
};

// 流入元の7行だけを取り出す
function sourceLines(data) {
  const { text } = buildNewLeadMessage({ form_name: 'shigyo-download', created_at: at, data: { name: 'x', ...data } });
  return text.split('\n').filter((l) => /^(utm_|landing_page|referrer_host)/.test(l));
}

test('流入元の7項目がすべて空で、ページの URL に utm があれば、URL から埋めて印を付ける', () => {
  const referrer =
    'https://ai.naus.co.jp/shigyo/?utm_source=facebook&utm_medium=cpc&utm_campaign=test_campaign' +
    '&utm_content=%E8%B3%87%E6%96%99_%E3%83%86%E3%82%B9%E3%83%88&fbclid=TESTCLICKID';
  assert.deepEqual(sourceLines({ ...SOURCE_EMPTY, referrer }), [
    'utm_source：facebook（ページの URL から）',
    'utm_medium：cpc（ページの URL から）',
    'utm_campaign：test_campaign（ページの URL から）',
    'utm_content：資料_テスト（ページの URL から）',
    'utm_term：（未記入）',
    'landing_page：/shigyo/（ページの URL から）',
    'referrer_host：（未記入）',
  ]);
});

test('隠し項目に値があれば、URL とちがっていても、そのまま（印も付けない）', () => {
  const lines = sourceLines({
    ...SOURCE_EMPTY,
    utm_source: 'instagram',
    landing_page: '/shigyo/',
    referrer: 'https://ai.naus.co.jp/shigyo/?utm_source=facebook&utm_medium=cpc',
  });
  assert.equal(lines[0], 'utm_source：instagram');
  assert.equal(lines[1], 'utm_medium：（未記入）');
  assert.equal(lines[5], 'landing_page：/shigyo/');
  assert.ok(!lines.join('\n').includes('ページの URL から'));
});

test('7項目のうち1つでも値があれば、URL からは埋めない', () => {
  const lines = sourceLines({
    ...SOURCE_EMPTY,
    referrer_host: 'instagram.com',
    referrer: 'https://ai.naus.co.jp/shigyo/?utm_source=facebook',
  });
  assert.equal(lines[0], 'utm_source：（未記入）');
  assert.equal(lines[6], 'referrer_host：instagram.com');
});

test('ページの URL に utm がない・空・先頭が空の重複・ほかのサイト（似せたホスト名を含む）なら、埋めない', () => {
  for (const referrer of [
    'https://ai.naus.co.jp/shigyo/',
    'https://ai.naus.co.jp/shigyo/?fbclid=TESTCLICKID',
    'https://ai.naus.co.jp/shigyo/?utm_source=',
    'https://ai.naus.co.jp/shigyo/?utm_source=%20%E3%80%80',
    'https://ai.naus.co.jp/shigyo/?utm_source=&utm_source=facebook',
    'https://evil.example/shigyo/?utm_source=facebook',
    'https://ai.naus.co.jp.evil.example/?utm_source=facebook',
    'https://ai.naus.co.jp@evil.example/?utm_source=facebook',
    'https://ai.naus.co.jp:x/?utm_source=facebook',
    '',
    undefined,
  ]) {
    const lines = sourceLines({ ...SOURCE_EMPTY, referrer });
    assert.ok(lines.every((l) => l.endsWith('（未記入）')), String(referrer));
  }
});

test('空白だけの隠し項目は空と見なし、URL から埋める', () => {
  const lines = sourceLines({
    ...SOURCE_EMPTY,
    utm_source: '  ',
    landing_page: ' ',
    referrer: 'https://ai.naus.co.jp/shigyo/?utm_source=facebook',
  });
  assert.equal(lines[0], 'utm_source：facebook（ページの URL から）');
  assert.equal(lines[5], 'landing_page：/shigyo/（ページの URL から）');
});

test('隠し項目のない形の送信（流入元の項目がない）には、行を足さない', () => {
  const lines = sourceLines({ referrer: 'https://ai.naus.co.jp/shigyo/?utm_source=facebook' });
  assert.deepEqual(lines, []);
});

test('URL から埋める値も、< > & を逃がし、空白をならし、200文字で切る', () => {
  const referrer =
    'https://ai.naus.co.jp/shigyo/?utm_source=%3C!channel%3E%26x&utm_medium=a%20%20%0Ab' +
    `&utm_campaign=${'c'.repeat(300)}`;
  const lines = sourceLines({ ...SOURCE_EMPTY, referrer });
  assert.equal(lines[0], 'utm_source：&lt;!channel&gt;&amp;x（ページの URL から）');
  assert.equal(lines[1], 'utm_medium：a b（ページの URL から）');
  assert.equal(lines[2], `utm_campaign：${'c'.repeat(200)}…（ページの URL から）`);
});

test('予約の知らせは、URL から埋めない（今までどおり）', () => {
  const { text } = buildBookingMessage(
    {
      source: 'shigyo',
      name: '架空 太郎',
      ...SOURCE_EMPTY,
      referrer: 'https://ai.naus.co.jp/shigyo/thanks/?utm_source=facebook&utm_medium=cpc',
    },
    at,
  );
  assert.match(text, /\nutm_source：（未記入）/);
  assert.ok(!text.includes('ページの URL から'));
});

test('ページの行は、今までどおり URL をそのまま載せる', () => {
  const referrer = 'https://ai.naus.co.jp/shigyo/?utm_source=facebook';
  const { text } = buildNewLeadMessage({
    form_name: 'shigyo-download',
    created_at: at,
    data: { ...SOURCE_EMPTY, referrer },
  });
  assert.match(text, /\nページ：https:\/\/ai\.naus\.co\.jp\/shigyo\/\?utm_source=facebook$/);
});

// ---- 無料相談の予約 ----
// 予約の枠：日本時間 2026/10/27 10:00〜10:30（予約の API はミリ秒で渡す）
const slot = { start: Date.parse('2026-10-27T01:00:00.000Z'), end: Date.parse('2026-10-27T01:30:00.000Z') };

function booking(extra = {}) {
  return {
    source: 'consult',
    name: '架空 太郎',
    company: '架空株式会社',
    email: 'taro@example.test',
    phone: '03-0000-0000',
    message: '相談したいです。',
    ...slot,
    ...extra,
  };
}

// 2行目（経由）だけを取り出す
const routeLine = (extra) => buildBookingMessage(booking(extra), at).text.split('\n')[1];

test('予約（通常 LP）：見出し・経由・取引先・取引先責任者・メール・電話・予約の日時・受付・内容・ページの順に載せる', () => {
  const message = buildBookingMessage(
    booking({ referrer: 'https://ai.naus.co.jp/thanks.html?utm_source=facebook&utm_campaign=test' }),
    at,
  );
  assert.equal(message.unfurl_links, false);
  assert.equal(message.unfurl_media, false);
  assert.equal(
    message.text,
    [
      '*新しい無料相談の予約（通常 LP）*',
      '経由：資料請求のあと',
      '取引先：架空株式会社',
      '取引先責任者：架空 太郎さん',
      'メール：taro@example.test',
      '電話：03-0000-0000',
      '予約の日時：2026/10/27 10:00〜10:30',
      '受付：2026/10/25 21:30',
      '内容：相談したいです。',
      'ページ：https://ai.naus.co.jp/thanks.html?utm_source=facebook&amp;utm_campaign=test',
    ].join('\n'),
  );
});

test('予約（士業 LP）：見出しは（士業 LP）。LP で予約したら、経由も士業 LP', () => {
  const { text } = buildBookingMessage(
    booking({ source: 'shigyo', referrer: 'https://ai.naus.co.jp/shigyo/?utm_source=google' }),
    at,
  );
  assert.match(text, /^\*新しい無料相談の予約（士業 LP）\*\n経由：士業 LP\n取引先：/);
  assert.match(text, /\nページ：https:\/\/ai\.naus\.co\.jp\/shigyo\/\?utm_source=google$/);
});

test('経由は、予約したページから決める（予約の画面の計測と同じ分け方）', () => {
  const consult = [
    ['https://ai.naus.co.jp/', '通常 LP'],
    ['https://ai.naus.co.jp/index.html?utm_source=x', '通常 LP'],
    ['https://ai.naus.co.jp/document/', '資料ページ'],
    ['https://ai.naus.co.jp/thanks.html', '資料請求のあと'],
    ['https://ai.naus.co.jp/thanks', '資料請求のあと'],
    ['https://ai.naus.co.jp/contact-thanks.html', '問い合わせのあと'],
    ['https://ai.naus.co.jp/crm-doc/', 'CRM 運用見直しの資料ページ'],
  ];
  for (const [referrer, route] of consult) assert.equal(routeLine({ referrer }), `経由：${route}`, referrer);
  const shigyo = [
    ['https://ai.naus.co.jp/shigyo/', '士業 LP'],
    ['https://ai.naus.co.jp/shigyo/document/', '資料ページ'],
    ['https://ai.naus.co.jp/shigyo/thanks/', '資料請求のあと'],
    ['https://ai.naus.co.jp/shigyo/contact-thanks/', '問い合わせのあと'],
    ['https://ai.naus.co.jp/shigyo/material/', 'フォーム営業用の資料ページ'],
  ];
  for (const [referrer, route] of shigyo) {
    assert.equal(routeLine({ source: 'shigyo', referrer }), `経由：${route}`, referrer);
  }
});

test('予約（CRM構築 LP）：/crm/ 以下のページから予約したら、見出しと経由が CRM構築 LP（source は通常のまま）', () => {
  const { text } = buildBookingMessage(
    booking({ source: 'consult', referrer: 'https://ai.naus.co.jp/crm/?utm_source=google' }),
    at,
  );
  assert.match(text, /^\*新しい無料相談の予約（CRM構築 LP）\*\n経由：CRM構築 LP\n取引先：/);
  const pages = [
    ['https://ai.naus.co.jp/crm/thanks/', '資料請求のあと'],
    ['https://ai.naus.co.jp/crm/contact-thanks/', '問い合わせのあと'],
    ['https://ai.naus.co.jp/crm/document/', '資料ページ'],
  ];
  for (const [referrer, route] of pages) {
    const m = buildBookingMessage(booking({ source: 'consult', referrer }), at).text;
    assert.match(m, /^\*新しい無料相談の予約（CRM構築 LP）\*/, referrer);
    assert.equal(m.split('\n')[1], `経由：${route}`, referrer);
  }
  // /crm-doc/ は従来どおり（通常 LP の見出し・CRM 運用見直しの資料ページ）
  const doc = buildBookingMessage(booking({ referrer: 'https://ai.naus.co.jp/crm-doc/' }), at).text;
  assert.match(doc, /^\*新しい無料相談の予約（通常 LP）\*\n経由：CRM 運用見直しの資料ページ\n/);
  // 別のサイトの /crm/ は CRM構築 LP とみなさない
  const other = buildBookingMessage(booking({ referrer: 'https://evil.example/crm/' }), at).text;
  assert.match(other, /^\*新しい無料相談の予約（通常 LP）\*/);
});

test('予約したページ（Referer）がない・ほかのサイトなら、ページの行は出さず、経由は LP の呼び名にする', () => {
  const others = [
    undefined,
    null,
    '',
    'https://evil.example/thanks.html?utm_source=x',
    'https://ai.naus.co.jp.evil.example/thanks.html',
    'http://ai.naus.co.jp/thanks.html',
  ];
  for (const referrer of others) {
    const { text } = buildBookingMessage(booking({ referrer }), at);
    assert.ok(!text.includes('ページ：'), String(referrer));
    assert.ok(!text.includes('evil.example'), String(referrer));
    assert.equal(text.split('\n')[1], '経由：通常 LP', String(referrer));
  }
  assert.equal(routeLine({ source: 'shigyo' }), '経由：士業 LP');
});

test('予約したページの URL は、? のあとも残し、200文字で切り、< > & を逃がす', () => {
  const url = `https://ai.naus.co.jp/?utm_source=${'a'.repeat(300)}`;
  const long = buildBookingMessage(booking({ referrer: url }), at);
  assert.equal(long.text.split('\n').at(-1), `ページ：${url.slice(0, 200)}…`);
  const tricky = buildBookingMessage(
    booking({ referrer: 'https://ai.naus.co.jp/?q=<!channel>&x=<https://evil.example|ここ>' }),
    at,
  );
  assert.ok(!tricky.text.includes('<!channel>'));
  assert.ok(!tricky.text.includes('<https://'));
  assert.match(tricky.text, /\nページ：https:\/\/ai\.naus\.co\.jp\/\?q=&lt;!channel&gt;&amp;x=&lt;https:/);
});

test('source が分からないときは、見出しに LP を付けず、経由には受け取った値を逃がして出す', () => {
  const unknown = buildBookingMessage(booking({ source: '<!channel>' }), at);
  assert.match(unknown.text, /^\*新しい無料相談の予約\*\n経由：&lt;!channel&gt;\n/);
  const proto = buildBookingMessage(booking({ source: 'toString' }), at);
  assert.match(proto.text, /^\*新しい無料相談の予約\*\n経由：toString\n/);
  const missing = buildBookingMessage(booking({ source: undefined }), at);
  assert.match(missing.text, /^\*新しい無料相談の予約\*\n経由：（不明）\n/);
  // 分け方で決まるページなら、source が分からなくても経由は出る
  assert.equal(routeLine({ source: 'x', referrer: 'https://ai.naus.co.jp/document/' }), '経由：資料ページ');
});

test('予約：空の欄は（未記入）', () => {
  const { text } = buildBookingMessage({ source: 'consult', ...slot }, at);
  assert.match(text, /\n取引先：（未記入）\n/);
  assert.match(text, /\n取引先責任者：（未記入）\n/);
  assert.match(text, /\nメール：（未記入）\n/);
  assert.match(text, /\n電話：（未記入）\n/);
  assert.match(text, /\n内容：（未記入）$/);
});

test('予約：長すぎる1行の欄は200文字、内容は1000文字で切る。内容の改行は残す', () => {
  const { text } = buildBookingMessage(
    booking({ name: 'あ'.repeat(250), company: 'い'.repeat(250), message: `1行目\r\n2行目${'う'.repeat(1500)}` }),
    at,
  );
  assert.match(text, new RegExp(`\n取引先責任者：${'あ'.repeat(200)}…さん\n`));
  assert.match(text, new RegExp(`\n取引先：${'い'.repeat(200)}…\n`));
  assert.match(text, new RegExp(`\n内容：1行目\n2行目${'う'.repeat(1000 - '1行目\n2行目'.length)}…$`));
});

test('予約：名前などの < > & は逃がし、Slack のメンションやリンクにしない', () => {
  const { text } = buildBookingMessage(
    booking({
      company: '<!channel> & <https://evil.example|ここ>',
      name: '<@U123>',
      email: '<mailto:x@example.test|x>',
      phone: '<!everyone>',
      message: '<!here>',
    }),
    at,
  );
  for (const bad of ['<!channel>', '<https://', '<@U123>', '<mailto:', '<!everyone>', '<!here>']) {
    assert.ok(!text.includes(bad), bad);
  }
  assert.match(text, /\n取引先：&lt;!channel&gt; &amp; &lt;https:\/\/evil.example\|ここ&gt;\n/);
});

test('予約の日時と受付は日本時間。日付が変わる時刻や、0時・年をまたぐ枠も正しく出す', () => {
  // UTC では前の日でも、日本時間では次の日（ISO の文字列でも受け取れる）
  const night = buildBookingMessage(
    booking({ start: '2026-10-25T15:00:00Z', end: '2026-10-25T15:30:00Z' }),
    '2026-12-31T15:05:00Z',
  );
  assert.match(night.text, /\n予約の日時：2026\/10\/26 00:00〜00:30\n受付：2027\/01\/01 00:05\n/);
  // 枠が日本時間の0時をまたぐときは、終わりにも日付を付ける
  const across = buildBookingMessage(booking({ start: '2026-12-31T14:45:00Z', end: '2026-12-31T15:15:00Z' }), at);
  assert.match(across.text, /\n予約の日時：2026\/12\/31 23:45〜2027\/01\/01 00:15\n/);
  // 受付もミリ秒で受け取れる
  const ms = buildBookingMessage(booking(), Date.parse(at));
  assert.match(ms.text, /\n予約の日時：2026\/10\/27 10:00〜10:30\n受付：2026\/10\/25 21:30\n/);
});

test('予約の日時が読めなければ（未記入）、終わりだけ読めなければ始まりだけ。受付が読めなければ、その行を出さない', () => {
  const none = buildBookingMessage(booking({ start: null, end: null }), 'not-a-date');
  assert.match(none.text, /\n予約の日時：（未記入）\n内容：/);
  assert.ok(!none.text.includes('1970'));
  assert.ok(!none.text.includes('受付：'));
  const noEnd = buildBookingMessage(booking({ end: 'x' }), null);
  assert.match(noEnd.text, /\n予約の日時：2026\/10\/27 10:00\n内容：/);
});

test('予約の API にあとで足した項目も「項目名：値」で載る。IP・ブラウザの種類・迷惑対策の隠し欄は載せない', () => {
  const { text } = buildBookingMessage(
    booking({ utm_source: 'facebook', ip: '203.0.113.9', user_agent: 'Mozilla/5.0 test', website: 'spam' }),
    at,
  );
  assert.match(text, /\n内容：相談したいです。\nutm_source：facebook$/);
  assert.ok(!text.includes('203.0.113.9'));
  assert.ok(!text.includes('Mozilla'));
  assert.ok(!text.includes('website'));
  assert.ok(!text.includes('spam'));
});

test('予約：中身がなくても例外にしない', () => {
  const { text } = buildBookingMessage(undefined, undefined);
  assert.equal(
    text,
    [
      '*新しい無料相談の予約*',
      '経由：（不明）',
      '取引先：（未記入）',
      '取引先責任者：（未記入）',
      'メール：（未記入）',
      '電話：（未記入）',
      '予約の日時：（未記入）',
      '内容：（未記入）',
    ].join('\n'),
  );
});
