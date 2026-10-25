// Netlify の関数から Slack に知らせる流れを確かめる（フォームの送信・無料相談の予約）。
// 本物の Slack・Google には送らない（fetch を差し替えて受け止める）。データはすべて架空
// （netlify/functions の中にテストを置くと、関数として公開されてしまうため、ここに置く）
// 使い方：node --test netlify/notify/*.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import submissionCreated from '../functions/submission-created.mjs';
import bookingCreate from '../functions/booking-create.mjs';
import { mockBusy } from '../booking/common.mjs';
import { computeSlots, toIso } from '../booking/slots.mjs';
import { buildNewLeadMessage, formatJst } from './new-lead-message.mjs';

const SITE = 'https://ai.naus.co.jp';
const SLACK = 'https://hooks.slack.com/services/test/test/test'; // 架空の送り先（形だけ Slack の URL）
const GOOGLE = {
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  GOOGLE_REFRESH_TOKEN: 'test-refresh-token',
  BOOKING_CALENDAR_ID: 'calendar@example.test',
};
const NO_GOOGLE = Object.fromEntries(Object.keys(GOOGLE).map((key) => [key, undefined]));

// 環境変数を書き換える（undefined は消す）
function applyEnv(vars) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

// 環境変数を、そのテストのあいだだけ書き換える（テストが終わったら元に戻す）
function setEnv(t, vars) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  applyEnv(vars);
  t.after(() => applyEnv(saved));
}

// 記録（console.error）に出たものを、1つの文字列にまとめる
const logged = (errors) => JSON.stringify(errors.mock.calls.map((call) => call.arguments));

// ---- フォームの送信（submission-created）：Slack に送る部分を共通にしても、動きが変わらないこと ----

const payload = {
  form_name: 'contact',
  created_at: '2026-10-25T12:30:00.000Z',
  data: { company: 'test株式会社', name: 'test', email: 'test@example.test', phone: '03-0000-0000', message: 'テストです。' },
};
const formRequest = (body) => new Request(`${SITE}/.netlify/functions/submission-created`, { method: 'POST', body });

test('フォームの送信：Slack の URL に、作った文を JSON にして POST で送り、ok を返す', async (t) => {
  setEnv(t, { SLACK_WEBHOOK_URL: SLACK });
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('ok'));
  const res = await submissionCreated(formRequest(JSON.stringify({ payload })));
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'ok');
  assert.equal(fetch.mock.callCount(), 1);
  const [url, init] = fetch.mock.calls[0].arguments;
  assert.equal(url, SLACK);
  assert.equal(init.method, 'POST');
  assert.deepEqual(init.headers, { 'content-type': 'application/json' });
  assert.ok(init.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(init.body), buildNewLeadMessage(payload));
});

test('フォームの送信：送れなくても・送り先が Slack の URL でなくても ok を返し、記録に中身や URL を残さない', async (t) => {
  setEnv(t, { SLACK_WEBHOOK_URL: SLACK });
  const errors = t.mock.method(console, 'error', () => {});
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('fetch failed');
  });
  assert.equal(await (await submissionCreated(formRequest(JSON.stringify({ payload })))).text(), 'ok');
  applyEnv({ SLACK_WEBHOOK_URL: 'https://evil.example/' });
  assert.equal(await (await submissionCreated(formRequest(JSON.stringify({ payload })))).text(), 'ok');
  assert.equal(fetch.mock.callCount(), 1);
  assert.deepEqual(
    errors.mock.calls.map((call) => call.arguments),
    [['Slack への通知に失敗しました', 'TypeError'], ['SLACK_WEBHOOK_URL が未設定か、Slack の URL ではありません']],
  );
});

test('フォームの送信：知らせないフォーム・読めない中身なら、送らずに ok を返す', async (t) => {
  setEnv(t, { SLACK_WEBHOOK_URL: SLACK });
  const errors = t.mock.method(console, 'error', () => {});
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('ok'));
  const other = await submissionCreated(formRequest(JSON.stringify({ payload: { form_name: 'newsletter', data: {} } })));
  assert.equal(await other.text(), 'ok');
  assert.equal(await (await submissionCreated(formRequest('not json'))).text(), 'ok');
  assert.equal(fetch.mock.callCount(), 0);
  assert.deepEqual(errors.mock.calls.map((call) => call.arguments), [['フォームの送信の中身を読めませんでした']]);
});

// ---- 無料相談の予約（booking-create）：予約が確定したときだけ、Slack に知らせる ----

// 本物の Google カレンダーと Slack の代わり。作った予定・取り消した数・Slack に送った文を記録する
//  busy：埋まっている時間帯 / earlier：ほぼ同時に別の予約が先に入った / insertFails：予定を作るときに Google がエラー
//  slack：Slack の返事（200・500 などの番号か、'down' ＝つながらない）
function fakeServices(t, { busy = [], earlier = false, insertFails = false, slack = 200 } = {}) {
  const log = { events: [], deleted: 0, slack: [] };
  let created = null;
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    if (url.origin === 'https://hooks.slack.com') {
      log.slack.push(JSON.parse(init.body));
      if (slack === 'down') throw new TypeError('fetch failed');
      return new Response('', { status: slack });
    }
    if (url.origin === 'https://oauth2.googleapis.com') return Response.json({ access_token: 'test-token', expires_in: 3600 });
    if (url.pathname.endsWith('/freeBusy')) {
      return Response.json({ calendars: { [GOOGLE.BOOKING_CALENDAR_ID]: { busy } } });
    }
    if (url.pathname.includes('holiday')) return Response.json({ items: [] });
    if (method === 'DELETE') {
      log.deleted += 1;
      return new Response(null, { status: 204 });
    }
    if (method === 'POST') {
      if (insertFails) return Response.json({ error: { status: 'INTERNAL' } }, { status: 500 });
      const event = JSON.parse(init.body);
      log.events.push(event);
      created = { ...event, id: 'test-event', created: new Date().toISOString(), hangoutLink: 'https://meet.google.com/test' };
      return Response.json(created);
    }
    // 予定を作ったあとの、前後の予定の確かめ
    const items = created ? [created] : [];
    if (earlier && created) items.push({ id: 'other-event', created: '2000-01-01T00:00:00Z', start: created.start, end: created.end });
    return Response.json({ items });
  });
  return log;
}

// 予約の画面からの呼び出し（同じサイトから）。接続元は毎回変える（連続送信の制限に当たらないように）
let callCount = 0;
function bookingCall(body, { referer, deploy = 'production' } = {}) {
  const headers = { origin: SITE, 'content-type': 'application/json' };
  if (referer) headers.referer = referer;
  callCount += 1;
  return bookingCreate(
    new Request(`${SITE}/api/booking/create`, { method: 'POST', headers, body: JSON.stringify(body) }),
    { ip: `198.51.100.${callCount}`, deploy: { context: deploy } },
  );
}

// いま予約できる枠のうち、いちばん先のもの（締め切りの境目で結果が揺れないように）
function farSlot(busy = []) {
  const slots = computeSlots({ now: Date.now(), busy });
  return slots[slots.length - 1];
}

const lead = (slot, extra = {}) => ({
  source: 'consult',
  start: toIso(slot.start),
  name: '架空 太郎',
  company: '架空株式会社',
  email: 'taro@example.test',
  phone: '03-0000-0000',
  message: '相談したいです。',
  website: '',
  ...extra,
});

test('予約：本物の予定ができたら、Slack に1回だけ知らせる（経由と予約したページ付き）。カレンダーの予定の中身は変えない', async (t) => {
  setEnv(t, { ...GOOGLE, SLACK_WEBHOOK_URL: SLACK });
  const log = fakeServices(t);
  const slot = farSlot();
  const res = await bookingCall(lead(slot), { referer: `${SITE}/thanks.html?utm_source=test` });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    ok: true,
    start: toIso(slot.start),
    end: toIso(slot.end),
    meetUrl: 'https://meet.google.com/test',
  });
  // カレンダーの予定（お客様に招待が届く）には、経由もページも入れない
  assert.equal(log.events.length, 1);
  assert.equal(log.events[0].summary, '【ゼロからAI Academy無料相談】架空株式会社 架空 太郎様');
  assert.equal(
    log.events[0].description,
    ['氏名: 架空 太郎', '会社名: 架空株式会社', 'メールアドレス: taro@example.test', '電話番号: 03-0000-0000', '', '相談内容:', '相談したいです。'].join('\n'),
  );
  // Slack には1回だけ
  assert.equal(log.slack.length, 1);
  const [message] = log.slack;
  assert.equal(message.unfurl_links, false);
  assert.equal(message.unfurl_media, false);
  const lines = message.text.split('\n');
  assert.deepEqual(lines.slice(0, 7), [
    '*新しい無料相談の予約（通常 LP）*',
    '経由：資料請求のあと',
    '取引先：架空株式会社',
    '取引先責任者：架空 太郎さん',
    'メール：taro@example.test',
    '電話：03-0000-0000',
    `予約の日時：${formatJst(slot.start)}〜${formatJst(slot.end).split(' ')[1]}`,
  ]);
  assert.match(lines[7], /^受付：\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/);
  assert.deepEqual(lines.slice(8), ['内容：相談したいです。', `ページ：${SITE}/thanks.html?utm_source=test`]);
});

test('予約：予約したページ（Referer）がなければ、ページの行を出さない（経由は LP の呼び名）', async (t) => {
  setEnv(t, { ...GOOGLE, SLACK_WEBHOOK_URL: SLACK });
  const log = fakeServices(t);
  const res = await bookingCall(lead(farSlot(), { source: 'shigyo' }));
  assert.equal(res.status, 200);
  assert.equal(log.slack.length, 1);
  const { text } = log.slack[0];
  assert.match(text, /^\*新しい無料相談の予約（士業 LP）\*\n経由：士業 LP\n/);
  assert.ok(!text.includes('ページ：'));
});

for (const [label, slack] of [['つながらない', 'down'], ['エラーが返る', 500]]) {
  test(`予約：Slack に送れなくても（${label}）、予約の結果は変わらない。記録に個人の情報を残さない`, async (t) => {
    setEnv(t, { ...GOOGLE, SLACK_WEBHOOK_URL: SLACK });
    const errors = t.mock.method(console, 'error', () => {});
    const log = fakeServices(t, { slack });
    const slot = farSlot();
    const res = await bookingCall(lead(slot));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      ok: true,
      start: toIso(slot.start),
      end: toIso(slot.end),
      meetUrl: 'https://meet.google.com/test',
    });
    assert.equal(log.slack.length, 1);
    assert.equal(log.deleted, 0);
    assert.equal(errors.mock.callCount(), 1);
    for (const personal of ['架空', 'taro@example.test', '03-0000-0000', '相談したいです']) {
      assert.ok(!logged(errors).includes(personal), personal);
    }
  });
}

test('予約：送り先が未設定でも、予約の結果は変わらない', async (t) => {
  setEnv(t, { ...GOOGLE, SLACK_WEBHOOK_URL: undefined });
  t.mock.method(console, 'error', () => {});
  const log = fakeServices(t);
  const res = await bookingCall(lead(farSlot()));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
  assert.equal(log.slack.length, 0);
});

test('予約：枠がもう埋まっていたら（409）、予定を作らず、知らせない', async (t) => {
  setEnv(t, { ...GOOGLE, SLACK_WEBHOOK_URL: SLACK });
  const slot = farSlot();
  const log = fakeServices(t, { busy: [{ start: toIso(slot.start), end: toIso(slot.end) }] });
  const res = await bookingCall(lead(slot));
  assert.equal(res.status, 409);
  assert.equal(log.events.length, 0);
  assert.equal(log.slack.length, 0);
});

test('予約：ほぼ同時の別の予約に負けたら（409）、作った予定を取り消し、知らせない', async (t) => {
  setEnv(t, { ...GOOGLE, SLACK_WEBHOOK_URL: SLACK });
  const log = fakeServices(t, { earlier: true });
  const res = await bookingCall(lead(farSlot()));
  assert.equal(res.status, 409);
  assert.equal(log.events.length, 1);
  assert.equal(log.deleted, 1);
  assert.equal(log.slack.length, 0);
});

test('予約：Google がエラーを返したら（503）、知らせない', async (t) => {
  setEnv(t, { ...GOOGLE, SLACK_WEBHOOK_URL: SLACK });
  t.mock.method(console, 'error', () => {});
  const log = fakeServices(t, { insertFails: true });
  const res = await bookingCall(lead(farSlot()));
  assert.equal(res.status, 503);
  assert.equal(log.slack.length, 0);
});

test('予約：入力の不備（400）では、知らせない', async (t) => {
  setEnv(t, { ...GOOGLE, SLACK_WEBHOOK_URL: SLACK });
  const log = fakeServices(t);
  const res = await bookingCall(lead(farSlot(), { email: 'not-an-email' }));
  assert.equal(res.status, 400);
  assert.equal(log.events.length, 0);
  assert.equal(log.slack.length, 0);
});

test('予約：仮の予約（デプロイプレビューで、Google の鍵がない）では、知らせない', async (t) => {
  setEnv(t, { ...NO_GOOGLE, SLACK_WEBHOOK_URL: SLACK });
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('ok'));
  const slot = farSlot(mockBusy(Date.now()));
  const res = await bookingCall(lead(slot), { deploy: 'deploy-preview', referer: `${SITE}/` });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).mock, true);
  assert.equal(fetch.mock.callCount(), 0);
});
