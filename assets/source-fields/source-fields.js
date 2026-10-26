/*
 * フォームの流入元(隠し項目)
 * - URLに utm_* が付いていれば、utm_source / utm_medium / utm_campaign / utm_content と
 *   最初に開いたページのパス(landing_page)を、このタブ内の保存領域(sessionStorage の naus_source)へ保存する
 * - 保存済みの値がある場合は上書きしない(最初の経路を残す)
 * - 対象フォーム内の同名の hidden input に値を入れる。値がなければ空のまま
 * - 保存領域が使えない環境でも送信を止めないよう、読み書きはすべて try/catch で囲む
 */
(function () {
  var KEY = 'naus_source';
  var FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'landing_page'];
  var FORMS = ['document-download', 'contact', 'shigyo-download', 'shigyo-contact'];

  function read() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || 'null') || null; } catch (e) { return null; }
  }

  function capture() {
    try {
      if (read()) return;
      var p = new URLSearchParams(location.search);
      var data = {}, found = false;
      for (var i = 0; i < 4; i++) {
        var v = p.get(FIELDS[i]);
        data[FIELDS[i]] = v ? v : '';
        if (v) found = true;
      }
      if (!found) return;
      data.landing_page = location.pathname;
      sessionStorage.setItem(KEY, JSON.stringify(data));
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
