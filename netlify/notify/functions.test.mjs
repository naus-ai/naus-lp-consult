// Netlify の関数から Slack に知らせる流れを確かめる（フォームの送信・無料相談の予約）。
// 本物の Slack・Google には送らない（fetch を差し替えて受け止める）。データはすべて架空
// （netlify/functions の中にテストを置くと、関数として公開されてしまうため、ここに置く）
// 使い方：node --test netlify/notify/*.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import submissionCreated from '../functions/submission-created.mjs';
import bookingCreate from '../functions/booking-create.mjs';
import { mockBusy, validateBooking } from '../booking/common.mjs';
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
const INTAKE_ENV = { INTAKE_URL: 'https://intake.example.test', INTAKE_KEY: 'test-intake-key' }; // 架空の受付窓口
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

const formPayload = { ...payload, id: 'sub-1', data: { ...payload.data, 'form-name': 'contact', referrer: `${SITE}/contact/`, ip: '203.0.113.9', user_agent: 'x', 'bot-field': '' } };

// 受付窓口と Slack の偽物。受付窓口の返事は status（番号か 'down'）、Slack は常に 200
function formServices(t, intake) {
  setEnv(t, { SLACK_WEBHOOK_URL: SLACK, ...INTAKE_ENV });
  const log = { intake: [], slack: [] };
  const fetch = t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'https://intake.example.test') {
      log.intake.push({ url: String(input), init, body: JSON.parse(init.body) });
      if (intake === 'down') throw new TypeError('fetch failed');
      return new Response('{}', { status: intake });
    }
    log.slack.push({ url: String(input), init, body: JSON.parse(init.body) });
    return new Response('ok');
  });
  return { log, fetch };
}

test('フォームの送信：受付窓口が 201（重複の 200 も）なら、Slack には送らず ok を返す。送る中身は id・page・form-name 付き', async (t) => {
  for (const status of [201, 200]) {
    const { log } = formServices(t, status);
    const res = await submissionCreated(formRequest(JSON.stringify({ payload: formPayload })));
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'ok');
    assert.equal(log.slack.length, 0);
    const sent = log.intake.at(-1).body;
    assert.equal(sent.kind, 'form');
    assert.equal(sent.id, 'sub-1');
    assert.equal(sent.page, `${SITE}/contact/`);
    assert.equal(sent.fields['form-name'], 'contact');
    assert.equal(sent.fields.company, 'test株式会社');
    for (const dropped of ['ip', 'user_agent', 'bot-field', 'referrer']) assert.ok(!(dropped in sent.fields), dropped);
    t.mock.restoreAll();
  }
});

for (const [label, intake] of [['500 を返す', 500], ['つながらない', 'down']]) {
  test(`フォームの送信：受付窓口が${label}なら、先頭に「⚠」を付けて Slack に1通だけ知らせる（4秒で諦める設定）`, async (t) => {
    t.mock.method(console, 'error', () => {});
    const { log } = formServices(t, intake);
    const res = await submissionCreated(formRequest(JSON.stringify({ payload: formPayload })));
    assert.equal(await res.text(), 'ok');
    assert.equal(log.intake.length, 1);
    assert.equal(log.slack.length, 1);
    assert.equal(log.slack[0].url, SLACK);
    assert.deepEqual(log.slack[0].body, buildNewLeadMessage(formPayload, { fallback: true }));
    assert.ok(log.slack[0].body.text.startsWith('⚠ CRM に送れなかったため、LP から直接知らせています\n*新しい問い合わせ（通常 LP）*'));
    assert.ok(log.slack[0].init.signal instanceof AbortSignal);
  });
}

test('フォームの送信：受付窓口の設定がないときも、予備の Slack に送る。Slack も送れなくても ok を返し、記録に中身や URL を残さない', async (t) => {
  setEnv(t, { SLACK_WEBHOOK_URL: SLACK, INTAKE_URL: undefined, INTAKE_KEY: undefined });
  const errors = t.mock.method(console, 'error', () => {});
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('fetch failed');
  });
  assert.equal(await (await submissionCreated(formRequest(JSON.stringify({ payload: formPayload })))).text(), 'ok');
  applyEnv({ SLACK_WEBHOOK_URL: 'https://evil.example/' });
  assert.equal(await (await submissionCreated(formRequest(JSON.stringify({ payload: formPayload })))).text(), 'ok');
  assert.equal(fetch.mock.callCount(), 1); // 受付窓口は設定がなく送らない。Slack は1回目だけ送り、2回目は Slack の URL でないので送らない
  const log = logged(errors);
  for (const secret of ['test株式会社', 'evil.example', 'hooks.slack.com']) assert.ok(!log.includes(secret), secret);
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
//  intake：CRM の受付窓口の返事（201・500 などの番号か、'down' ＝つながらない）。既定は 500（届かない）＝予備の Slack に出る
//  log.slack は先頭の「⚠」の行を除いた知らせ、log.slackRaw は送った知らせそのまま、log.intake は受付窓口に送った中身
function fakeServices(t, { busy = [], earlier = false, insertFails = false, slack = 200, intake = 500 } = {}) {
  setEnv(t, INTAKE_ENV);
  const log = { events: [], deleted: 0, slack: [], slackRaw: [], intake: [] };
  let created = null;
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    if (url.origin === 'https://hooks.slack.com') {
      const sent = JSON.parse(init.body);
      log.slackRaw.push(sent);
      log.slack.push({ ...sent, text: sent.text.replace(/^⚠ [^\n]*\n/, '') });
      if (slack === 'down') throw new TypeError('fetch failed');
      return new Response('', { status: slack });
    }
    if (url.origin === 'https://intake.example.test') {
      log.intake.push({ url: String(input), init, body: JSON.parse(init.body) });
      if (intake === 'down') throw new TypeError('fetch failed');
      return new Response('{}', { status: intake });
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

// 流入元の8項目（フォームの隠し項目・assets/source-fields/source-fields.js と同じ名前と順番）
const SOURCE_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'landing_page', 'referrer_host', 'doc_code'];
const NO_SOURCE = SOURCE_FIELDS.map((key) => `${key}：（未記入）`);

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
  // 流入元（UTM など）が届いていなければ、フォームの知らせと同じく、7つとも（未記入）で載せる
  assert.deepEqual(lines.slice(8), [
    '内容：相談したいです。',
    ...NO_SOURCE,
    `ページ：${SITE}/thanks.html?utm_source=test`,
  ]);
});

test('予約：資料ページに目印付きで来て予約したら、流入元の項目を「項目名：値」で知らせる。カレンダーの予定には入れない', async (t) => {
  setEnv(t, { ...GOOGLE, SLACK_WEBHOOK_URL: SLACK });
  const log = fakeServices(t);
  const source = {
    utm_source: 'note',
    utm_medium: 'social',
    utm_campaign: 'note_crm',
    utm_content: '',
    utm_term: '',
    landing_page: '/crm-doc/',
    referrer_host: 'note.com',
  };
  const res = await bookingCall(lead(farSlot(), source), { referer: `${SITE}/crm-doc/?utm_source=note&utm_medium=social&utm_campaign=note_crm` });
  assert.equal(res.status, 200);
  assert.equal(log.slack.length, 1);
  const lines = log.slack[0].text.split('\n');
  assert.equal(lines[1], '経由：CRM 運用見直しの資料ページ');
  assert.deepEqual(lines.slice(8), [
    '内容：相談したいです。',
    'utm_source：note',
    'utm_medium：social',
    'utm_campaign：note_crm',
    'utm_content：（未記入）',
    'utm_term：（未記入）',
    'landing_page：/crm-doc/',
    'referrer_host：note.com',
    'doc_code：（未記入）',
    // & は Slack の書き方で &amp; にする（Slack では & と表示される）
    `ページ：${SITE}/crm-doc/?utm_source=note&amp;utm_medium=social&amp;utm_campaign=note_crm`,
  ]);
  assert.equal(log.events.length, 1);
  const event = JSON.stringify(log.events[0]);
  for (const value of ['note_crm', 'note.com', 'utm_', 'landing_page', 'referrer_host']) assert.ok(!event.includes(value), value);
});

test('予約：流入元の項目は形で空にせず、届いたとおりに載せる。長すぎる・文字でないものだけ空にする', async (t) => {
  setEnv(t, { ...GOOGLE, SLACK_WEBHOOK_URL: SLACK });
  const log = fakeServices(t);
  const res = await bookingCall(
    lead(farSlot(), {
      utm_source: 'x'.repeat(201), // 長すぎる
      utm_medium: { nested: 'object' }, // 文字でない
      utm_campaign: '  note\ncrm\u0007 ', // 改行・制御文字は、ほかの1行の欄と同じくならす
      utm_content: 42, // 文字でない
      utm_term: 'x'.repeat(200), // ちょうど200文字は載せる
      landing_page: 'shigyo', // 形が違っても、届いたとおり
      referrer_host: 'note.com/<!channel>', // 形が違っても、届いたとおり（Slack には逃がして出る）
      doc_code: 'C0012', // 資料リンクの記号（予備の Slack には、そのほかの項目として出る）
      ip: '203.0.113.9',
      user_agent: 'Mozilla/5.0 test',
      extra: 'not-allowed', // 決まった項目のほかは受け取らない
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(log.slack.length, 1);
  const lines = log.slack[0].text.split('\n');
  assert.deepEqual(lines.slice(8), [
    '内容：相談したいです。',
    'utm_source：（未記入）',
    'utm_medium：（未記入）',
    'utm_campaign：note crm',
    'utm_content：（未記入）',
    `utm_term：${'x'.repeat(200)}`,
    'landing_page：shigyo',
    'referrer_host：note.com/&lt;!channel&gt;',
    'doc_code：C0012',
  ]);
});

test('予約：流入元のパスが // で始まっても、そのまま載せる。値の < > & は逃がす', async (t) => {
  setEnv(t, { ...GOOGLE, SLACK_WEBHOOK_URL: SLACK });
  const log = fakeServices(t);
  const res = await bookingCall(
    lead(farSlot(), { utm_source: '<!channel>&', landing_page: '//evil.example/x', referrer_host: 'NOTE.com' }),
  );
  assert.equal(res.status, 200);
  const { text } = log.slack[0];
  assert.match(text, /\nutm_source：&lt;!channel&gt;&amp;\n/);
  assert.match(text, /\nlanding_page：\/\/evil\.example\/x\n/);
  assert.match(text, /\nreferrer_host：NOTE\.com\ndoc_code：（未記入）$/);
});

test('予約の検証：流入元の8項目は届いたとおりに残る（空白入り・/ なし・日本語のホスト）。201文字は空、制御文字は除く', () => {
  const base = { source: 'consult', start: new Date(Date.now() + 5 * 86400000).toISOString(), name: '架空 太郎', company: '架空株式会社', email: 'taro@example.test', phone: '03-0000-0000', message: '' };
  const { value } = validateBooking({
    ...base,
    utm_campaign: '士業 ネイビー',
    landing_page: 'shigyo',
    referrer_host: '例.jp',
    utm_source: 'x'.repeat(201),
    utm_medium: 'a\u0007b\u0000c',
    doc_code: 'C0012',
  });
  assert.equal(value.utm_campaign, '士業 ネイビー');
  assert.equal(value.landing_page, 'shigyo');
  assert.equal(value.referrer_host, '例.jp');
  assert.equal(value.utm_source, '');
  assert.equal(value.utm_medium, 'abc');
  assert.equal(value.doc_code, 'C0012');
  assert.equal(validateBooking({ ...base, doc_code: 'y'.repeat(201) }).value.doc_code, '');
  assert.equal(validateBooking(base).value.doc_code, '');
});

test('予約：受付窓口が 201 なら Slack には送らず、中身（予定の番号・経由・確かめた値・8項目）を署名付きで送る。返事は変わらない', async (t) => {
  setEnv(t, { ...GOOGLE, SLACK_WEBHOOK_URL: SLACK });
  const log = fakeServices(t, { intake: 201 });
  const slot = farSlot();
  const res = await bookingCall(
    lead(slot, { route: 'crm_seminar', utm_source: 'note', landing_page: '/crm-doc/', doc_code: 'C0012', ip: '203.0.113.9', website: '' }),
    { referer: `${SITE}/crm/seminar/` },
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, start: toIso(slot.start), end: toIso(slot.end), meetUrl: 'https://meet.google.com/test' });
  assert.equal(log.slack.length, 0);
  assert.equal(log.intake.length, 1);
  const { url, init, body } = log.intake[0];
  assert.equal(url, 'https://intake.example.test/v1/submit');
  assert.equal(init.headers['X-Naus-Sender'], 'lp');
  assert.match(init.headers['X-Naus-Signature'], /^v1=[0-9a-f]{64}$/);
  assert.equal(body.kind, 'booking');
  assert.equal(body.id, 'test-event');
  assert.equal(body.page, `${SITE}/crm/seminar/`);
  assert.deepEqual(body.fields, {
    source: 'consult', start: toIso(slot.start), end: toIso(slot.end), route: 'crm_seminar',
    name: '架空 太郎', company: '架空株式会社', email: 'taro@example.test', phone: '03-0000-0000', message: '相談したいです。',
    utm_source: 'note', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '',
    landing_page: '/crm-doc/', referrer_host: '', doc_code: 'C0012',
  });
});

for (const [label, intake] of [['500 を返す', 500], ['つながらない', 'down']]) {
  test(`予約：受付窓口が${label}なら、先頭に「⚠」を付けて Slack に1通だけ知らせる。予約の返事は変わらない`, async (t) => {
    setEnv(t, { ...GOOGLE, SLACK_WEBHOOK_URL: SLACK });
    t.mock.method(console, 'error', () => {});
    const log = fakeServices(t, { intake });
    const slot = farSlot();
    const res = await bookingCall(lead(slot, { doc_code: 'C0012' }), { referer: `${SITE}/crm-doc/` });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, start: toIso(slot.start), end: toIso(slot.end), meetUrl: 'https://meet.google.com/test' });
    assert.equal(log.slackRaw.length, 1);
    assert.ok(log.slackRaw[0].text.startsWith('⚠ CRM に送れなかったため、LP から直接知らせています\n*新しい無料相談の予約'));
    // 記号は、手で登録できるよう、そのほかの項目として出る
    assert.match(log.slackRaw[0].text, /\ndoc_code：C0012\n/);
  });
}

test('予約：受付窓口が 201 の予約でも、枠が埋まっていたら（409）受付窓口にも Slack にも送らない', async (t) => {
  setEnv(t, { ...GOOGLE, SLACK_WEBHOOK_URL: SLACK });
  const slot = farSlot();
  const log = fakeServices(t, { intake: 201, busy: [{ start: toIso(slot.start), end: toIso(slot.end) }] });
  assert.equal((await bookingCall(lead(slot))).status, 409);
  assert.equal(log.intake.length, 0);
  assert.equal(log.slackRaw.length, 0);
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
  test(`予約：受付窓口にも Slack にも送れなくても（${label}）、予約の結果は変わらない。記録に個人の情報を残さない`, async (t) => {
    setEnv(t, { ...GOOGLE, SLACK_WEBHOOK_URL: SLACK });
    const errors = t.mock.method(console, 'error', () => {});
    const log = fakeServices(t, { slack, intake: 500 });
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
    assert.equal(errors.mock.callCount(), 2); // 受付窓口と Slack の両方に送れなかった記録
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
