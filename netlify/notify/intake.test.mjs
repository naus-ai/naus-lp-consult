// CRM の受付窓口への送信（intake.mjs）のテスト。送り先・鍵・中身はすべて架空
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { sendToIntake, buildFormIntakeItem, clipValue } from './intake.mjs';

const ENV = { INTAKE_URL: 'https://intake.example.test', INTAKE_KEY: 'test-intake-key' };
const NOW = () => 1_800_000_000_000;
const SUFFIX = '…（長いため途中まで）';

// 送られた要求を記録する偽の fetch
function fakeFetch(status = 201) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response('{}', { status });
  };
  fn.calls = calls;
  return fn;
}
const quiet = (t) => t.mock.method(console, 'error', () => {});
const item = (fields = {}) => ({ kind: 'form', id: 'sub-1', page: 'https://ai.naus.co.jp/crm/', fields: { 'form-name': 'crm-contact', name: '架空 太郎', ...fields } });

test('送る：POST /v1/submit。見出し3つと署名（HMAC-SHA256(鍵, 秒.本文) の16進）が合う', async () => {
  const f = fakeFetch(201);
  assert.equal(await sendToIntake(item(), ENV, f, NOW), true);
  const { url, init } = f.calls[0];
  assert.equal(url, 'https://intake.example.test/v1/submit');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.equal(init.headers['X-Naus-Sender'], 'lp');
  assert.equal(init.headers['X-Naus-Timestamp'], '1800000000');
  const expected = createHmac('sha256', 'test-intake-key').update(`1800000000.${init.body}`).digest('hex');
  assert.equal(init.headers['X-Naus-Signature'], `v1=${expected}`);
  assert.deepEqual(Object.keys(f.calls[0].body).sort(), ['fields', 'id', 'kind', 'page']);
  assert.ok(init.signal instanceof AbortSignal);
});

test('送る：ip・user_agent・bot-field・website・referrer は本文に入れない', async () => {
  const f = fakeFetch();
  await sendToIntake(item({ ip: '203.0.113.9', user_agent: 'x', 'bot-field': '', website: '', referrer: 'https://ai.naus.co.jp/' }), ENV, f, NOW);
  assert.deepEqual(Object.keys(f.calls[0].body.fields).sort(), ['form-name', 'name']);
  assert.ok(!f.calls[0].init.body.includes('203.0.113.9'));
});

test('切る：内容6000文字は5000文字に収まり、末尾は「…（長いため途中まで）」。名前600文字は500文字に収まる', async () => {
  const f = fakeFetch();
  await sendToIntake(item({ message: 'あ'.repeat(6000), body: 'い'.repeat(5001), name: 'う'.repeat(600), company: 'え'.repeat(500) }), ENV, f, NOW);
  const { fields } = f.calls[0].body;
  assert.equal(fields.message.length, 5000);
  assert.ok(fields.message.endsWith(SUFFIX));
  assert.equal(fields.body.length, 5000);
  assert.equal(fields.name.length, 500);
  assert.ok(fields.name.endsWith(SUFFIX));
  assert.equal(fields.company, 'え'.repeat(500)); // ちょうどは切らない
});

test('切る：絵文字（2文字分の文字）を途中で割らない', () => {
  // 切る位置（上限 - 末尾の長さ）にちょうど絵文字がまたがる並び
  for (const max of [500, 5000]) {
    const keep = max - SUFFIX.length;
    const text = 'a'.repeat(keep - 1) + '😀' + 'b'.repeat(50);
    const out = clipValue(text, max);
    assert.ok(out.length <= max);
    assert.ok(out.endsWith(SUFFIX));
    const head = out.slice(0, -SUFFIX.length);
    assert.equal(head, 'a'.repeat(keep - 1)); // 割れた片方（孤立したサロゲート）を残さない
    assert.ok(!/[\ud800-\udbff]$/.test(head));
    assert.equal(Buffer.from(out, 'utf8').toString('utf8'), out); // 不正な文字を含まない
  }
});

test('切る：ページの URL は2000文字、id は100文字まで。名前が長すぎる項目は送らない', async () => {
  const f = fakeFetch();
  await sendToIntake({ kind: 'booking', id: 'x'.repeat(150), page: 'https://a.example/' + 'p'.repeat(3000), fields: { ['k'.repeat(61)]: 'v', ok: 'v' } }, ENV, f, NOW);
  const b = f.calls[0].body;
  assert.equal(b.page.length, 2000);
  assert.equal(b.id.length, 100);
  assert.deepEqual(Object.keys(b.fields), ['ok']);
});

test('切る：内容5000文字・ほかの値が20個とも500文字の日本語でも、本文は 64KB 以下', async () => {
  const f = fakeFetch();
  const fields = { message: 'あ'.repeat(5000) };
  for (let i = 0; i < 20; i++) fields[`f${i}`] = 'い'.repeat(500);
  await sendToIntake({ kind: 'form', id: 's', page: 'https://ai.naus.co.jp/' + 'ち'.repeat(100), fields }, ENV, f, NOW);
  assert.ok(Buffer.byteLength(f.calls[0].init.body, 'utf8') <= 65536);
});

test('結果：200・201 で true。500・つながらない・4秒（ここでは短くして）で false。記録に値や鍵を残さない', async (t) => {
  const errors = quiet(t);
  assert.equal(await sendToIntake(item(), ENV, fakeFetch(200), NOW), true);
  assert.equal(await sendToIntake(item(), ENV, fakeFetch(201), NOW), true);
  assert.equal(await sendToIntake(item(), ENV, fakeFetch(500), NOW), false);
  assert.equal(await sendToIntake(item(), ENV, fakeFetch(401), NOW), false);
  assert.equal(await sendToIntake(item(), ENV, async () => { throw new TypeError('fetch failed'); }, NOW), false);
  const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
  assert.equal(await sendToIntake(item(), ENV, hang, NOW, 20), false);
  const log = JSON.stringify(errors.mock.calls.map((c) => c.arguments));
  assert.ok(!log.includes('架空') && !log.includes('test-intake-key') && !log.includes('intake.example.test'));
});

test('結果：既定の待ち時間は4秒', async () => {
  const f = fakeFetch();
  const before = Date.now();
  await sendToIntake(item(), ENV, f, NOW);
  assert.ok(f.calls[0].init.signal instanceof AbortSignal);
  assert.ok(Date.now() - before < 1000);
});

test('送らない：INTAKE_URL が http:// や未設定・INTAKE_KEY がないときは、送らず false', async (t) => {
  quiet(t);
  const f = fakeFetch();
  assert.equal(await sendToIntake(item(), { ...ENV, INTAKE_URL: 'http://intake.example.test' }, f, NOW), false);
  assert.equal(await sendToIntake(item(), { INTAKE_KEY: 'k' }, f, NOW), false);
  assert.equal(await sendToIntake(item(), { INTAKE_URL: ENV.INTAKE_URL }, f, NOW), false);
  assert.equal(await sendToIntake({ ...item(), id: '' }, ENV, f, NOW), false);
  assert.equal(f.calls.length, 0);
});

test('フォームの送信から送る形を作る：id・page・fields["form-name"]', () => {
  const built = buildFormIntakeItem({
    id: 'sub-9', form_name: 'contact',
    data: { 'form-name': 'contact', company: '架空株式会社', referrer: 'https://ai.naus.co.jp/', ip: '203.0.113.9' },
  });
  assert.equal(built.kind, 'form');
  assert.equal(built.id, 'sub-9');
  assert.equal(built.page, 'https://ai.naus.co.jp/');
  assert.equal(built.fields['form-name'], 'contact');
  const noName = buildFormIntakeItem({ id: 's', form_name: 'contact', data: { company: 'x' } });
  assert.equal(noName.fields['form-name'], 'contact');
});
