// Slack への送り方を確かめる。本物の Slack には送らない（fetch を差し替えて受け止める）。データはすべて架空
// 使い方：node --test netlify/notify/*.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postToSlack } from './slack.mjs';

const SLACK = 'https://hooks.slack.com/services/test/test/test'; // 架空の送り先（形だけ Slack の URL）
const message = { text: '*テスト*\n取引先：架空株式会社\nメール：taro@example.test', unfurl_links: false, unfurl_media: false };

// 送り先の環境変数を書き換える（undefined は消す）
function applyWebhook(value) {
  if (value === undefined) delete process.env.SLACK_WEBHOOK_URL;
  else process.env.SLACK_WEBHOOK_URL = value;
}

// 送り先の環境変数を、そのテストのあいだだけ書き換える（テストが終わったら元に戻す）
function setWebhook(t, value) {
  const saved = process.env.SLACK_WEBHOOK_URL;
  applyWebhook(value);
  t.after(() => applyWebhook(saved));
}

// 記録（console.error）に出たものを、1つの文字列にまとめる
const logged = (errors) => JSON.stringify(errors.mock.calls.map((call) => call.arguments));

test('Slack の URL なら、文を JSON にして POST で送り、true を返す（5秒で打ち切る合図を付ける）', async (t) => {
  setWebhook(t, SLACK);
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('ok'));
  assert.equal(await postToSlack(message), true);
  assert.equal(fetch.mock.callCount(), 1);
  const [url, init] = fetch.mock.calls[0].arguments;
  assert.equal(url, SLACK);
  assert.equal(init.method, 'POST');
  assert.deepEqual(init.headers, { 'content-type': 'application/json' });
  assert.deepEqual(JSON.parse(init.body), message);
  assert.ok(init.signal instanceof AbortSignal);
  assert.equal(init.signal.aborted, false);
});

test('送り先が未設定・Slack の URL でないときは、送らずに false を返す（例外にしない。記録に URL を残さない）', async (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('ok'));
  const wrong = [
    undefined,
    '',
    'https://evil.example/hooks.slack.com/services/test',
    'http://hooks.slack.com/services/test/test/test',
    'https://hooks.slack.com.evil.example/services/test',
    'https://hooks.slack.com/servicesx/test',
    ' https://hooks.slack.com/services/test/test/test',
  ];
  setWebhook(t, undefined);
  for (const value of wrong) {
    applyWebhook(value);
    assert.equal(await postToSlack(message), false, String(value));
  }
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(errors.mock.callCount(), wrong.length);
  assert.ok(!logged(errors).includes('evil.example'));
  assert.ok(!logged(errors).includes('hooks.slack.com'));
});

test('つながらない・時間切れのときは、false を返す（例外にしない。記録はエラーの種類だけで、文の中身を残さない）', async (t) => {
  setWebhook(t, SLACK);
  const errors = t.mock.method(console, 'error', () => {});
  const failures = [new TypeError('fetch failed: taro@example.test'), new DOMException('timeout', 'TimeoutError')];
  t.mock.method(globalThis, 'fetch', async () => {
    throw failures.shift();
  });
  assert.equal(await postToSlack(message), false);
  assert.equal(await postToSlack(message), false);
  assert.deepEqual(
    errors.mock.calls.map((call) => call.arguments),
    [
      ['Slack への通知に失敗しました', 'TypeError'],
      ['Slack への通知に失敗しました', 'TimeoutError'],
    ],
  );
  assert.ok(!logged(errors).includes('taro@example.test'));
});

test('Slack がエラーを返したときは、false を返す（記録は状態の番号だけ）', async (t) => {
  setWebhook(t, SLACK);
  const errors = t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async () => new Response('invalid_payload taro@example.test', { status: 400 }));
  assert.equal(await postToSlack(message), false);
  assert.deepEqual(
    errors.mock.calls.map((call) => call.arguments),
    [['Slack への通知に失敗しました', 400]],
  );
});
