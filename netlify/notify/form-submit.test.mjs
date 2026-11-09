// フォームの受け口（form-submit: POST /api/form）と、その記録用の送信を見分ける submission-created、資料ページの PDF の送り先を確かめる。
// 本物の受付窓口・Slack・Netlify には送らない（fetch を差し替える）。データはすべて架空。
// netlify/functions の中にテストを置くと関数として公開されてしまうため、ここに置く。使い方：node --test netlify/notify/*.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import formSubmit, { FORM_RATE_LIMIT, THANKS } from '../functions/form-submit.mjs';
import submissionCreated from '../functions/submission-created.mjs';

const SITE = 'https://ai.naus.co.jp';
const SLACK = 'https://hooks.slack.com/services/test/test/test';
const INTAKE = 'https://intake.example.test';
let counter = 0;
const nextIp = () => `203.0.113.${(counter += 1)}`; // 接続元は毎回変える（連続送信の制限に当たらないように）
const FIELDS = { 'form-name': 'contact', company: '架空株式会社', name: '架空 太郎', email: 'taro@example.test', phone: '03-0000-0000', message: 'テストです。', utm_source: 'test', 'bot-field': '', ip: '9.9.9.9', via: 'spoof' };

function post(fields = FIELDS, { headers = {}, body } = {}) {
  return new Request(`${SITE}/api/form`, {
    method: 'POST',
    headers: { Origin: SITE, Referer: `${SITE}/contact/`, 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: body ?? new URLSearchParams(fields).toString(),
  });
}
const ctx = (extra = {}) => ({ ip: nextIp(), ...extra });

function setup(t, { intake = 201, delayMs = 0 } = {}) {
  const saved = { SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL, INTAKE_URL: process.env.INTAKE_URL, INTAKE_KEY: process.env.INTAKE_KEY };
  Object.assign(process.env, { SLACK_WEBHOOK_URL: SLACK, INTAKE_URL: INTAKE, INTAKE_KEY: 'test-intake-key' });
  t.after(() => { for (const [k, v] of Object.entries(saved)) (v === undefined ? delete process.env[k] : (process.env[k] = v)); });
  t.mock.method(console, 'error', () => {});
  const log = { intake: [], slack: [], record: [], finished: 0 };
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(String(input));
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    log.finished += 1;
    if (url.origin === INTAKE) {
      log.intake.push(JSON.parse(init.body));
      if (intake === 'down') throw new TypeError('fetch failed');
      return new Response('{}', { status: intake });
    }
    if (url.origin === 'https://hooks.slack.com') {
      log.slack.push(JSON.parse(init.body));
      return new Response('ok');
    }
    log.record.push({ url: String(input), init, params: new URLSearchParams(String(init.body)) });
    return new Response(null, { status: 303 });
  });
  return log;
}

test('受け口：POST 以外・別のサイトからの送信・urlencoded 以外・大きすぎる本文・知らないフォームは断る', async (t) => {
  const log = setup(t);
  assert.equal((await formSubmit(new Request(`${SITE}/api/form`), ctx())).status, 405);
  assert.equal((await formSubmit(post(FIELDS, { headers: { Origin: 'https://evil.example' } }), ctx())).status, 403);
  const noOrigin = new Request(`${SITE}/api/form`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'form-name=contact' });
  assert.equal((await formSubmit(noOrigin, ctx())).status, 403);
  assert.equal((await formSubmit(post(FIELDS, { headers: { 'Content-Type': 'application/json' }, body: '{}' }), ctx())).status, 415);
  assert.equal((await formSubmit(post(FIELDS, { headers: { 'Content-Type': 'multipart/form-data; boundary=x' }, body: 'x' }), ctx())).status, 415);
  assert.equal((await formSubmit(post(FIELDS, { body: 'form-name=contact&message=' + 'a'.repeat(70000) }), ctx())).status, 413);
  assert.equal((await formSubmit(post({ ...FIELDS, 'form-name': 'newsletter' }), ctx())).status, 400);
  assert.equal((await formSubmit(post(FIELDS, { body: 'message=x' }), ctx())).status, 400);
  assert.equal((await formSubmit(post(FIELDS, { body: 'form-name=__proto__' }), ctx())).status, 400);
  assert.equal(log.finished, 0); // 断ったものは、どこにも送らない
});

test('受け口：同じ接続元から決まった回数を超えたら 429', async (t) => {
  setup(t);
  const c = { ip: nextIp() };
  for (let i = 0; i < FORM_RATE_LIMIT; i += 1) assert.equal((await formSubmit(post(), c)).status, 303);
  assert.equal((await formSubmit(post(), c)).status, 429);
  assert.equal((await formSubmit(post(), ctx())).status, 303); // 別の接続元は影響しない
});

test('受け口：迷惑対策の欄に値があれば、受付窓口にも Slack にも送らず、記録だけ Netlify に送って 303', async (t) => {
  const log = setup(t);
  const res = await formSubmit(post({ ...FIELDS, 'bot-field': 'spam' }), ctx());
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/contact-thanks.html');
  assert.equal(log.intake.length, 0);
  assert.equal(log.slack.length, 0);
  assert.equal(log.record.length, 1);
  assert.equal(log.record[0].params.get('via'), 'form-submit');
});

test('受け口：ふつうの送信は、決まったありがとうのページへ 303。受付窓口には id・page・項目（ip などは除く）を送り、Netlify には via=form-submit 付きで記録する', async (t) => {
  const log = setup(t);
  for (const [name, path] of Object.entries(THANKS)) {
    if (!path) continue;
    const res = await formSubmit(post({ ...FIELDS, 'form-name': name }), ctx());
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), path);
  }
  assert.equal(log.intake.length, 6);
  const sent = log.intake[0];
  assert.equal(sent.kind, 'form');
  assert.match(sent.id, /^[0-9a-f-]{36}$/);
  assert.equal(sent.page, `${SITE}/contact/`);
  assert.equal(sent.fields['form-name'], 'document-download');
  assert.equal(sent.fields.company, '架空株式会社');
  assert.equal(sent.fields.utm_source, 'test');
  for (const dropped of ['ip', 'user_agent', 'referrer', 'bot-field', 'via']) assert.ok(!(dropped in sent.fields), dropped);
  assert.equal(log.slack.length, 0);
  assert.equal(log.record.length, 6);
  assert.equal(log.record[0].url, `${SITE}/`);
  assert.equal(log.record[0].params.get('via'), 'form-submit'); // 送られてきた via は上書き
  assert.equal(log.record[0].params.get('email'), 'taro@example.test');
  assert.equal(new Set(log.intake.map((i) => i.id)).size, 6);
});

test('受け口：この LP 以外のページから来た Referer は page に入れない', async (t) => {
  const log = setup(t);
  await formSubmit(post(FIELDS, { headers: { Referer: 'https://evil.example/x' } }), ctx());
  assert.equal(log.intake[0].page, '');
});

test('受け口：資料ページの PDF（crm-doc-pdf）は画面を移さず 204。同じ流れで受付窓口に送る', async (t) => {
  const log = setup(t);
  const res = await formSubmit(post({ 'form-name': 'crm-doc-pdf', company: '架空株式会社', name: '架空 太郎', email: 'taro@example.test', doc_code: 'C0012', 'bot-field': '' }, { headers: { Referer: `${SITE}/crm-doc/` } }), ctx());
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('location'), null);
  assert.equal(log.intake[0].fields['form-name'], 'crm-doc-pdf');
  assert.equal(log.record.length, 1);
});

for (const [label, intake] of [['500 を返す', 500], ['つながらない', 'down']]) {
  test(`受け口：受付窓口が${label}なら、先頭に「⚠」を付けて Slack に1通だけ知らせ、お客様には 303`, async (t) => {
    const log = setup(t, { intake });
    const res = await formSubmit(post(), ctx());
    assert.equal(res.status, 303);
    assert.equal(log.slack.length, 1);
    assert.ok(log.slack[0].text.startsWith('⚠ CRM に送れなかったため、LP から直接知らせています\n*新しい問い合わせ（通常 LP）*'));
    assert.ok(log.slack[0].text.includes('架空株式会社'));
    assert.equal(log.record.length, 1);
  });
}

test('受け口：context.waitUntil があれば、返事を先に返し、知らせは返事のあとに続ける。なければ返事の前に済ませる', async (t) => {
  const log = setup(t, { delayMs: 40 });
  let pending;
  const res = await formSubmit(post(), { ip: nextIp(), waitUntil: (p) => { pending = p; } });
  assert.equal(res.status, 303);
  assert.equal(log.finished, 0); // 返事の時点では、送信は終わっていない
  await pending;
  assert.equal(log.intake.length, 1);
  assert.equal(log.record.length, 1);
  const before = log.finished;
  const res2 = await formSubmit(post(), ctx());
  assert.equal(res2.status, 303);
  assert.equal(log.finished, before + 2);
});

test('受け口：知らせに使う時間の上限は、受付窓口6秒・予備の Slack 3秒・Netlify への記録3秒', async (t) => {
  setup(t, { intake: 500 });
  const timeout = t.mock.method(AbortSignal, 'timeout');
  await formSubmit(post(), ctx());
  assert.deepEqual(timeout.mock.calls.map((c) => c.arguments[0]).sort(), [3000, 3000, 6000]);
});

test('受け口：記録に入力された値・メール・鍵を残さない', async (t) => {
  setup(t, { intake: 500 });
  const errors = console.error.mock;
  await formSubmit(post({ ...FIELDS, 'bot-field': 'spam' }), ctx());
  await formSubmit(post(), ctx());
  const log = JSON.stringify(errors.calls.map((c) => c.arguments));
  for (const secret of ['架空', 'taro@example.test', 'test-intake-key', 'hooks.slack.com', 'intake.example.test']) assert.ok(!log.includes(secret), secret);
});

test('submission-created：via=form-submit（受け口で処理済みの記録用）は、何もしない。via がない送信は、これまでどおり受付窓口に送る', async (t) => {
  const log = setup(t);
  const request = (data) => new Request(`${SITE}/.netlify/functions/submission-created`, { method: 'POST', body: JSON.stringify({ payload: { id: 'sub-1', form_name: 'contact', data: { ...FIELDS, via: undefined, ...data, referrer: `${SITE}/contact/` } } }) });
  assert.equal(await (await submissionCreated(request({ via: 'form-submit' }))).text(), 'ok');
  assert.equal(log.intake.length, 0);
  assert.equal(log.slack.length, 0);
  assert.equal(await (await submissionCreated(request({ via: '' }))).text(), 'ok');
  assert.equal(log.intake.length, 1);
  assert.equal(log.intake[0].id, 'sub-1');
});

test('PDF フォーム（pdf-form.js）：Netlify 向けの送信先は /api/form（keepalive）。Apps Script への送信は変えない', () => {
  const js = readFileSync(new URL('../../assets/pdf-form/pdf-form.js', import.meta.url), 'utf8');
  assert.match(js, /fetch\('\/api\/form',\{method:'POST',headers:\{'Content-Type':'application\/x-www-form-urlencoded'\},body:formParams\([^)]*\)[^}]*,keepalive:true\}\)/);
  assert.ok(!js.includes("fetch('/',"));
  assert.ok(js.includes("fetch(ENDPOINT,{method:'POST',mode:'no-cors'"));
});

test('HTML：6つのフォームと資料ページの隠しフォームに via 欄があり、フォームの action は /api/form', () => {
  for (const file of ['index.html', 'shigyo/index.html', 'crm/index.html', 'crm-doc/index.html']) {
    const html = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    const forms = html.match(/<form [^>]*data-netlify="true"[\s\S]*?<\/form>/g) ?? [];
    assert.ok(forms.length > 0, file);
    for (const form of forms) {
      assert.ok(form.includes('<input type="hidden" name="via" value="">'), file);
      if (!file.startsWith('crm-doc')) assert.match(form, /action="\/api\/form"/);
    }
  }
});
