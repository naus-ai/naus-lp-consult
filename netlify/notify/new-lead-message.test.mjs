// Slack に送る文の作り方を確かめる。使い方：node --test netlify/notify/new-lead-message.test.mjs（データはすべて架空）
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildNewLeadMessage, escapeSlack, formatJst } from './new-lead-message.mjs';

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

