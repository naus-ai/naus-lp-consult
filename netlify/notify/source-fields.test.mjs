// 流入元の記録（assets/source-fields/source-fields.js と assets/booking/booking.js）のテスト。
// ブラウザ用のファイルを node:vm でそのまま動かす。location・document・localStorage は、このファイルの中の最小の偽物
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE_JS = readFileSync(new URL('../../assets/source-fields/source-fields.js', import.meta.url), 'utf8');
const BOOKING_JS = readFileSync(new URL('../../assets/booking/booking.js', import.meta.url), 'utf8');

const FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'landing_page', 'referrer_host', 'doc_code'];
const FORMS = ['document-download', 'contact', 'shigyo-download', 'shigyo-contact', 'crm-download', 'crm-contact'];
const SITE = 'https://lp.example.test';

// 保存領域の偽物。broken を true にすると、読み書きが投げる（プライベートのタブ・アプリの中のブラウザ）
function fakeStorage(init = {}, broken = false) {
  const data = { ...init };
  return {
    data,
    getItem(k) { if (broken) throw new Error('denied'); return k in data ? data[k] : null; },
    setItem(k, v) { if (broken) throw new Error('denied'); data[k] = String(v); },
    removeItem(k) { if (broken) throw new Error('denied'); delete data[k]; },
  };
}

// 6つのフォームを持つ偽の document。隠し項目は8つ
function fakeDocument(referrer) {
  const forms = {};
  for (const name of FORMS) {
    const inputs = {};
    for (const f of FIELDS) inputs[f] = { value: '' };
    forms[name] = { inputs, elements: { namedItem: (n) => inputs[n] || null } };
  }
  const listeners = {};
  return {
    forms,
    referrer: referrer || '',
    querySelector(sel) {
      const m = /^form\[name="(.+)"\]$/.exec(sel);
      return m ? forms[m[1]] || null : null;
    },
    addEventListener(type, fn) { listeners[type] = fn; },
    fire(type) { if (listeners[type]) listeners[type](); },
  };
}

// ページを1回開く（source-fields.js を読み込む）。同じ storage を渡せば、ブラウザを続けて使ったことになる
function visit(url, { storage = fakeStorage(), referrer = '', now = Date.now() } = {}) {
  const u = new URL(url, SITE);
  const document = fakeDocument(referrer);
  const winListeners = {};
  const window = { addEventListener(type, fn) { winListeners[type] = fn; } };
  const RealDate = Date;
  const fakeDate = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [now])); }
    static now() { return now; }
  };
  const ctx = vm.createContext({
    window,
    document,
    localStorage: storage,
    location: { search: u.search, pathname: u.pathname, host: u.host },
    URL,
    URLSearchParams,
    JSON,
    Date: fakeDate,
  });
  vm.runInContext(SOURCE_JS, ctx);
  return { storage, document, window, ctx };
}

const record = (storage, key) => JSON.parse(storage.data[key]);
const valuesOf = (form) => Object.fromEntries(FIELDS.map((f) => [f, form.inputs[f].value]));

// ---- 保存先（ページのまとまりごと） ----
const KEY_TABLE = [
  ['/shigyo/', 'naus_source_shigyo'],
  ['/shigyo/material/', 'naus_source_shigyo'],
  ['/crm/', 'naus_source_crm'],
  ['/crm/seminar/', 'naus_source_crm'],
  ['/crm-doc/', 'naus_source_crm'],
  ['/', 'naus_source_consult'],
  ['/document/', 'naus_source_consult'],
  ['/thanks.html', 'naus_source_consult'],
];

for (const [path, key] of KEY_TABLE) {
  test(`保存先：${path} は ${key}`, () => {
    const v = visit(`${path}?utm_source=note`);
    assert.deepEqual(Object.keys(v.storage.data), [key]);
    assert.equal(record(v.storage, key).d.utm_source, 'note');
    assert.equal(v.window.nausSourceKey(path), key);
  });
}

test('保存先：予約画面（booking.js）も、同じ表で保存先を決める', () => {
  for (const [path, key] of KEY_TABLE) {
    const storage = fakeStorage({ [key]: JSON.stringify({ t: Date.now(), d: { utm_source: 'here' } }) });
    const { read } = loadBooking(path, storage);
    assert.equal(read().utm_source, 'here', path);
    // 別のまとまりの記録は読まない
    const other = KEY_TABLE.find(([, k]) => k !== key)[1];
    const s2 = fakeStorage({ [other]: JSON.stringify({ t: Date.now(), d: { utm_source: 'other' } }) });
    assert.deepEqual(loadBooking(path, s2).read(), {}, path);
  }
});

// ---- 記録のふるまい ----
test('士業のページで覚えたものは、CRM のフォームに入らない', () => {
  const storage = fakeStorage();
  visit('/shigyo/material/', { storage, referrer: 'https://news.example.test/a' });
  assert.ok(storage.data.naus_source_shigyo);
  const crm = visit('/crm/', { storage });
  // CRM のまとまりには記録がなかったので、いま開いた /crm/ が記録される
  assert.equal(crm.document.forms['crm-contact'].inputs.landing_page.value, '/crm/');
  assert.equal(crm.document.forms['crm-contact'].inputs.referrer_host.value, '');
  assert.equal(record(storage, 'naus_source_crm').d.landing_page, '/crm/');
  assert.equal(record(storage, 'naus_source_shigyo').d.landing_page, '/shigyo/material/');
});

test('記号を覚え、新しい記号で上書きする。utm は変わらない', () => {
  const storage = fakeStorage();
  visit('/crm-doc/?utm_source=note&utm_campaign=crm_a&c=C0012', { storage });
  assert.equal(record(storage, 'naus_source_crm').d.doc_code, 'C0012');
  const v = visit('/crm-doc/?c=C0034', { storage });
  const d = record(storage, 'naus_source_crm').d;
  assert.equal(d.doc_code, 'C0034');
  assert.equal(d.utm_source, 'note');
  assert.equal(d.utm_campaign, 'crm_a');
  assert.equal(d.landing_page, '/crm-doc/');
  assert.equal(v.document.forms['crm-download'].inputs.doc_code.value, 'C0034');
  assert.equal(v.document.forms['crm-download'].inputs.utm_source.value, 'note');
});

test('記号：記録が無いところに c だけで来ても覚える。c の無い訪問では変えない', () => {
  const storage = fakeStorage();
  visit('/crm-doc/?c=C0012', { storage });
  assert.equal(record(storage, 'naus_source_crm').d.doc_code, 'C0012');
  visit('/crm/', { storage });
  assert.equal(record(storage, 'naus_source_crm').d.doc_code, 'C0012');
});

test('記号：utm が新しくなっても、c が無ければ記号は残す。c も付いていれば c で置き換える', () => {
  const storage = fakeStorage();
  visit('/crm-doc/?c=C0012', { storage });
  visit('/crm/?utm_source=x', { storage });
  assert.equal(record(storage, 'naus_source_crm').d.doc_code, 'C0012');
  assert.equal(record(storage, 'naus_source_crm').d.utm_source, 'x');
  visit('/crm/?utm_source=y&c=C0099', { storage });
  assert.equal(record(storage, 'naus_source_crm').d.doc_code, 'C0099');
});

test('記号：ほかのまとまりの記録には入らない', () => {
  const storage = fakeStorage();
  visit('/crm-doc/?c=C0012', { storage });
  assert.deepEqual(Object.keys(storage.data), ['naus_source_crm']);
});

test('記号は50文字で切る。変な値もそのまま覚える（形の判断は CRM がする）', () => {
  const storage = fakeStorage();
  visit(`/crm-doc/?c=${'a'.repeat(80)}`, { storage });
  assert.equal(record(storage, 'naus_source_crm').d.doc_code, 'a'.repeat(50));
  visit('/crm-doc/?c=%3Cscript%3E', { storage });
  assert.equal(record(storage, 'naus_source_crm').d.doc_code, '<script>');
});

test('記号を覚えたら、フォームの doc_code の隠し項目に入る（8項目）', () => {
  const v = visit('/crm/?utm_source=note&c=C0012');
  const form = v.document.forms['crm-contact'];
  assert.deepEqual(valuesOf(form), {
    utm_source: 'note', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '',
    landing_page: '/crm/', referrer_host: '', doc_code: 'C0012',
  });
});

test('古い naus_source は読まない（空で送る）', () => {
  const storage = fakeStorage({ naus_source: JSON.stringify({ t: Date.now(), d: { utm_source: 'old', landing_page: '/old/' } }) });
  const v = visit('/crm/', { storage, referrer: SITE + '/' });
  // 参照元が同じサイトで記録も無いので、何も作らず、フォームは空
  assert.equal(valuesOf(v.document.forms['crm-contact']).utm_source, '');
  assert.equal(valuesOf(v.document.forms['crm-contact']).landing_page, '');
  // 古い記録には触らず、新しい保存先も作らない
  assert.deepEqual(Object.keys(storage.data), ['naus_source']);
  // 予約画面も読まない
  const { read } = loadBooking('/crm/', storage);
  assert.deepEqual(read(), {});
});

test('30日を過ぎた記録は破棄する。30日以内なら utm なしの訪問で変えない', () => {
  const now = Date.now();
  const old = fakeStorage({ naus_source_crm: JSON.stringify({ t: now - 31 * 86400000, d: { utm_source: 'old', doc_code: 'C0001' } }) });
  const v = visit('/crm/', { storage: old, now });
  assert.equal(record(old, 'naus_source_crm').d.utm_source, '');
  assert.equal(valuesOf(v.document.forms['crm-contact']).doc_code, '');
  const fresh = fakeStorage({ naus_source_crm: JSON.stringify({ t: now - 29 * 86400000, d: { utm_source: 'keep', doc_code: 'C0001' } }) });
  visit('/crm/', { storage: fresh, now });
  assert.equal(record(fresh, 'naus_source_crm').d.utm_source, 'keep');
  assert.equal(record(fresh, 'naus_source_crm').t, now - 29 * 86400000);
});

test('localStorage が投げても、フォームは空のまま送れる（例外を出さない）', () => {
  const storage = fakeStorage({}, true);
  const v = visit('/crm-doc/?utm_source=note&c=C0012', { storage });
  assert.deepEqual(valuesOf(v.document.forms['crm-contact']), Object.fromEntries(FIELDS.map((f) => [f, ''])));
  v.document.fire('submit');
  assert.deepEqual(loadBooking('/crm/', storage).read(), {});
});

// ---- 予約画面 ----
// booking.js 全体は画面の部品が多いので、流入元の読み取りの部分（「流入元」の見出しから「計測」の見出しまで）を、本物のファイルから取り出して動かす
function loadBooking(pathname, storage) {
  const a = BOOKING_JS.indexOf('// ---- 流入元(UTM など) ----');
  const b = BOOKING_JS.indexOf('// 計測: GTMへ送るイベント');
  assert.ok(a > 0 && b > a, 'booking.js の流入元の部分が見つからない');
  const ctx = vm.createContext({ location: { pathname }, localStorage: storage, JSON, Date, DAY: 86400000, out: {} });
  vm.runInContext(`${BOOKING_JS.slice(a, b)}\nout.read = readSource; out.fields = SOURCE_FIELDS; out.key = SOURCE_STORE;`, ctx);
  // vm の中で作られたオブジェクトは Object が別物なので、JSON を通して普通のオブジェクトにそろえる
  return { read: () => JSON.parse(JSON.stringify(ctx.out.read())), fields: ctx.out.fields, key: ctx.out.key };
}

test('予約画面は、ページのまとまりの記録を読んで doc_code も送る', () => {
  const storage = fakeStorage({
    naus_source_crm: JSON.stringify({ t: Date.now(), d: { utm_source: 'note', landing_page: '/crm-doc/', doc_code: 'C0012' } }),
  });
  const b = loadBooking('/crm/seminar/', storage);
  assert.equal(b.key, 'naus_source_crm');
  assert.deepEqual([...b.fields], FIELDS);
  assert.equal(b.read().doc_code, 'C0012');
  // 送る中身を作る行は、SOURCE_FIELDS の全項目を、文字のものだけ、なければ空で入れる
  assert.match(BOOKING_JS, /var from=readSource\(\);\s*SOURCE_FIELDS\.forEach\(function\(k\)\{data\[k\]=typeof from\[k\]==='string'\?from\[k\]:'';\}\);/);
});

test('予約画面：localStorage が投げたら空を返す', () => {
  assert.deepEqual(loadBooking('/', fakeStorage({}, true)).read(), {});
});
