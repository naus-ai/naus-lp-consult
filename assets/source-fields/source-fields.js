/*
 * フォームの流入元(隠し項目)
 * - 保存先はこのブラウザの localStorage。商品(ページのまとまり)ごとに分けて持つ:
 *     /shigyo/ 以下 = naus_source_shigyo / /crm/ 以下と /crm-doc/ = naus_source_crm / それ以外 = naus_source_consult
 *   (予約画面 assets/booking/booking.js も同じ決まりで読む。読み込みの順が決まらないため、関数は共有せず両方に書いてある)
 *   以前の naus_source は読まない。保存時刻も一緒に持ち、保存から30日を過ぎたものは無いものとして破棄する
 * - ページを開いたときの判定:
 *   1. URLに utm_* が1つでもある -> utm と landing_page・referrer_host を上書き(30日は上書きした時刻から数え直す)
 *   2. 目印なし・有効な保存なし -> その来訪を保存(utmは空)。ただし参照元が同じサイトなら保存しない
 *   3. 目印なし・有効な保存あり -> 何も変えない(期限も延ばさない)
 * - 資料リンクの記号: URL に c があれば、doc_code としてこのまとまりの記録に覚える(50文字で切る)。
 *   新しい c があれば、utm とは別に c だけでも上書きする。c が無い訪問では、覚えている記号を残す。値の形の判断は CRM がする
 * - landing_page はパスのみ。referrer_host は参照元のホスト名のみ(空、または同じサイトなら空)
 * - 対象フォーム内の同名の hidden input に値を入れる(8項目)。値がなければ空のまま
 * - 保存領域が使えない環境でも送信を止めないよう、読み書きはすべて try/catch で囲む
 */
(function () {
  var TTL = 30 * 24 * 60 * 60 * 1000;
  var UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var FIELDS = UTM.concat(['landing_page', 'referrer_host', 'doc_code']);
  var CODE_MAX = 50;
  var FORMS = ['document-download', 'contact', 'shigyo-download', 'shigyo-contact', 'crm-download', 'crm-contact'];

  function sourceKey(path) {
    if (/^\/shigyo(\/|$)/.test(path)) return 'naus_source_shigyo';
    if (/^\/(crm|crm-doc)(\/|$)/.test(path)) return 'naus_source_crm';
    return 'naus_source_consult';
  }
  window.nausSourceKey = sourceKey;

  function key() { return sourceKey(location.pathname); }

  function read() {
    try {
      var raw = localStorage.getItem(key());
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || typeof o.t !== 'number' || !o.d || Date.now() - o.t > TTL) {
        try { localStorage.removeItem(key()); } catch (e2) {}
        return null;
      }
      return o.d;
    } catch (e) { return null; }
  }

  function write(d) {
    try { localStorage.setItem(key(), JSON.stringify({ t: Date.now(), d: d })); } catch (e) {}
  }

  function referrerHost() {
    try {
      if (!document.referrer) return '';
      var u = new URL(document.referrer);
      if (u.host === location.host) return '';
      return u.hostname;
    } catch (e) { return ''; }
  }

  function capture() {
    try {
      var p = new URLSearchParams(location.search);
      var d = {}, hasUtm = false, i;
      for (i = 0; i < UTM.length; i++) {
        var v = p.get(UTM[i]);
        d[UTM[i]] = v ? v : '';
        if (v) hasUtm = true;
      }
      d.landing_page = location.pathname;
      d.referrer_host = referrerHost();
      var code = p.get('c');
      code = code ? code.slice(0, CODE_MAX) : '';
      var saved = read();
      if (hasUtm) {
        // utm の上書きでは、c が無ければ覚えている記号を残す
        d.doc_code = code || (saved && saved.doc_code ? String(saved.doc_code) : '');
        write(d);
        return;
      }
      if (saved) {
        // 目印なし・保存あり: 新しい c があるときだけ、記号だけを書き換える
        if (code) { saved.doc_code = code; write(saved); }
        return;
      }
      d.doc_code = code;
      if (!code && !d.referrer_host && document.referrer) {
        // 参照元が同じサイト(サイト内の移動)なら記録を作らない
        try { if (new URL(document.referrer).host === location.host) return; } catch (e) {}
      }
      write(d);
    } catch (e) {}
  }

  function fill() {
    try {
      var data = read() || {};
      for (var i = 0; i < FORMS.length; i++) {
        var form = document.querySelector('form[name="' + FORMS[i] + '"]');
        if (!form) continue;
        for (var j = 0; j < FIELDS.length; j++) {
          var el = form.elements.namedItem(FIELDS[j]);
          if (el) el.value = data[FIELDS[j]] ? String(data[FIELDS[j]]) : '';
        }
      }
    } catch (e) {}
  }

  capture();
  fill();
  window.addEventListener('pageshow', fill);
  document.addEventListener('submit', fill, true);
})();
