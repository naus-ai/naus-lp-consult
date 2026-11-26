/* 画面例の切り替え + 勤怠チェックの画面例 */
(function () {
  var sw = document.getElementById('mksw');
  var crm = document.getElementById('mk');
  var crmNote = document.querySelector('#mock .mk-note');
  var crmIntro = document.getElementById('mk-intro');
  var kt = document.getElementById('kt');
  var tpl = document.getElementById('kt-tpl');
  if (!sw || !crm || !kt || !tpl) return;

  var timers = [];
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  /* ===== 切り替え ===== */
  /* 最初はどちらも選ばれていない(画面例は出さない) */
  var current = null;
  function show(which) {
    if (which === current) return;
    current = which;
    sw.classList.remove('is-idle');
    sw.querySelectorAll('.mksw-btn').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-mock') === which ? 'true' : 'false');
    });
    var isKt = which === 'kintai';
    crm.hidden = isKt;
    if (crmNote) crmNote.hidden = isKt;
    if (crmIntro) crmIntro.hidden = isKt;
    if (isKt) { mount(); kt.hidden = false; fitSources(); }
    else { kt.hidden = true; unmount(); }
  }
  sw.addEventListener('click', function (e) {
    var b = e.target.closest('.mksw-btn'); if (!b) return;
    show(b.getAttribute('data-mock'));
  });

  /* 表示していない間は中身ごと外す(タイマー・アニメーションを止める) */
  function unmount() {
    timers.forEach(clearTimeout); timers = [];
    kt.innerHTML = '';
  }
  function mount() {
    unmount();
    kt.appendChild(tpl.content.cloneNode(true));
    init();
    fitSources();
  }

  /* 3か所の窓:横一列に並ぶ幅では、中身をPCと同じ配置のまま窓の幅に合わせて縮小する */
  var SRC_W = 322; /* PC幅での窓の中身の幅 */
  function fitSources() {
    var win = kt.querySelector('.kt-win'); if (!win) return;
    var z = Math.min(1, win.clientWidth / SRC_W);
    kt.style.setProperty('--kt-z', z.toFixed(4));
  }
  window.addEventListener('resize', fitSources);

  /* 作ったツールのボタン(画面例なので表示だけ) */
  kt.addEventListener('click', function (e) {
    var b = e.target.closest('[data-toast]'); if (!b) return;
    var t = document.getElementById(b.getAttribute('data-toast')); if (!t) return;
    t.hidden = false;
    later(function () { t.hidden = true; }, 1800);
  });

  /* ===== 勤怠チェックの画面例(毎回最初の状態から) ===== */
  function init() {
    var $ = function (id) { return document.getElementById('kt-' + id); };
    var log = $('log'), chips = $('chips'), nav = $('nav');
    var done = {}, views = [], filter = 'all';

    /* 表計算風:セルを押すと選択が移る */
    $('ss').addEventListener('click', function (e) {
      var td = e.target.closest('td'); if (!td) return;
      var tr = td.parentNode, col = String.fromCharCode(64 + td.cellIndex), row = tr.rowIndex;
      kt.querySelectorAll('#kt-ss td.kt-on').forEach(function (x) { x.classList.remove('kt-on'); });
      td.classList.add('kt-on'); $('nb').textContent = col + row; $('fv').textContent = td.textContent;
    });

    function addView(id, label) {
      views.push({ id: id, label: label });
      nav.innerHTML = '';
      views.forEach(function (v, i) {
        var b = document.createElement('button'); b.type = 'button';
        b.innerHTML = v.label + (i === views.length - 1 && i > 0 ? '<span class="kt-new">NEW</span>' : '');
        b.onclick = function () { open(v.id); }; b.dataset.v = v.id; nav.appendChild(b);
      });
      open(id);
    }
    function open(id) {
      $('empty').hidden = true;
      views.forEach(function (v) { $('v-' + v.id).hidden = (v.id !== id); });
      nav.querySelectorAll('button').forEach(function (b) { b.classList.toggle('kt-on', b.dataset.v === id); });
      $('url').textContent = 'kintai-check.example/' + id;
    }
    function renderFilters() {
      var f = [['all', '全件', 5], ['ng', '食い違い', 4], ['ok', '一致', 1]];
      if (done.why) { f.push(['office', '事務所で直す', 2], ['client', '顧問先に確認', 2]); }
      var box = $('filters'); box.innerHTML = '';
      f.forEach(function (x) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'kt-f' + (filter === x[0] ? ' kt-on' : '');
        b.innerHTML = x[1] + '<b>' + x[2] + '</b>'; b.onclick = function () { filter = x[0]; renderFilters(); applyFilter(); }; box.appendChild(b);
      });
    }
    function applyFilter() {
      kt.querySelectorAll('#kt-rows tr').forEach(function (tr) {
        var s = tr.dataset.s, w = tr.dataset.w;
        tr.hidden = !(filter === 'all' || filter === s || filter === w);
      });
    }

    var steps = {
      match: { q: 'はい',
        a: '「突き合わせ」の画面を作りました。3か所を社員ごと・項目ごとに比べ、食い違いに番号をつけています。元の3か所にも同じ番号で印が出ます。',
        done: ['3か所を読み込む処理', '社員×項目で比べる一覧', '食い違いと一致の絞り込み'],
        run: function () { addView('match', '突き合わせ'); renderFilters();
          kt.querySelectorAll('.kt-mk').forEach(function (el) { el.classList.add('kt-hit'); });
          $('srcState').textContent = '— 食い違いに印がつきました'; } },
      why: { q: '食い違いの理由と、誰が直すかも出るようにしたい',
        a: '一覧に「考えられる理由」と「対応」の列を足しました。事務所で直す分と顧問先に確認する分で絞り込めます。残業の計算に使う所定の終業時刻は、設定として持たせています。',
        done: ['理由の列', '対応の振り分け', '所定の終業時刻の設定'],
        run: function () { $('matchCard').classList.add('kt-show-why'); $('setting').hidden = false; renderFilters(); open('match'); } },
      ask: { q: '顧問先に確認する分の文面を作る機能を足したい',
        a: '「確認文」の画面を足しました。対応が「顧問先に確認」のもの(②③)だけを、1通の文面にまとめます。送るかどうかは担当者が決めてください。',
        done: ['確認文の画面', '文面のコピー'],
        run: function () { addView('ask', '確認文'); } },
      memo: { q: '事務所で直す分を、修正メモにする機能を足したい',
        a: '「修正メモ」の画面を足しました。給与計算ツールで直す分(①④)を、いまの入力と直す値で並べ、直したら印をつけられます。',
        done: ['修正メモの画面', '済みの印'],
        run: function () { addView('memo', '修正メモ'); } }
    };
    function next() {
      if (!done.match) return ['match'];
      if (!done.why) return ['why'];
      return ['ask', 'memo'].filter(function (k) { return !done[k]; });
    }
    function bubble(cls, t, list) {
      var d = document.createElement('div'); d.className = 'kt-b ' + cls; d.textContent = t;
      if (list) { var ul = document.createElement('ul'); list.forEach(function (x) { var li = document.createElement('li'); li.textContent = x; ul.appendChild(li); }); d.appendChild(ul); }
      log.appendChild(d); log.scrollTop = log.scrollHeight;
    }
    function renderChips() {
      chips.innerHTML = '';
      var ks = next();
      var h = document.createElement('div'); h.className = 'kt-hint';
      h.textContent = ks.length ? '下のボタンを押して、お試しください' : 'ここまでで、この画面例はおしまいです。'; chips.appendChild(h);
      ks.forEach(function (k) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'kt-chip' + (k === 'match' ? ' kt-is-primary' : '');
        b.textContent = steps[k].q; b.onclick = function () { pick(k); }; chips.appendChild(b);
      });
      if (done.match) {
        var r = document.createElement('button'); r.type = 'button'; r.className = 'kt-reset'; r.textContent = '最初からやり直す';
        r.onclick = function () { mount(); }; chips.appendChild(r);
      }
    }
    function pick(k) {
      done[k] = true; bubble('kt-user', steps[k].q); chips.innerHTML = '';
      later(function () {
        steps[k].run(); bubble('kt-ai-b', steps[k].a, steps[k].done);
        if (!next().length) { bubble('kt-ai-b', '最初は3か所を目で見比べていた作業が、頼むたびに自分の事務所用のツールになっていきました。使いながら「ここをこうしたい」と思ったら、また話しかけてください。'); }
        renderChips(); log.scrollTop = log.scrollHeight;
        if (window.innerWidth <= 1000) { $('app').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      }, 400);
    }
    renderChips();
  }
})();
