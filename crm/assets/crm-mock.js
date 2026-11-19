(function () {
  var root = document.getElementById('mk');
  if (!root) return;
  var win = root.querySelector('.mk-win');
  var screen = root.querySelector('.mk-screen');
  var nameEl = root.querySelector('.mk-name');
  var resetS = root.querySelector('.mk-reset-s');
  var log = root.querySelector('.mk-log');
  var choicesEl = root.querySelector('.mk-choices');
  var inputT = root.querySelector('.mk-input-t');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var narrow = window.matchMedia ? window.matchMedia('(max-width: 960px)') : { matches: false };
  var PH = 'メッセージを入力';

  // ダミーデータ(すべて架空)。金額は商談金額(万円)
  var DATA = [
    { n: 'A社', r: 'A', s: '商談中', a: 120, d: '11/14', g: 0, src: 'Web' },
    { n: 'B社', r: 'B', s: '提案', a: 340, d: '11/18', g: 1, src: '紹介' },
    { n: 'C社', r: 'A', s: '商談中', a: 80, d: '10/30', g: 20, src: '展示会' },
    { n: 'D社', r: 'C', s: '受注', a: 210, d: '11/17', g: 2, src: '紹介' },
    { n: 'E社', r: 'B', s: 'リード', a: 0, d: '11/11', g: 8, src: 'Web' },
    { n: 'F社', r: 'C', s: '提案', a: 150, d: '11/01', g: 18, src: 'Web' },
    { n: 'G社', r: 'A', s: 'リード', a: 0, d: '11/19', g: 0, src: '展示会' },
    { n: 'H社', r: 'B', s: '商談中', a: 95, d: '10/28', g: 22, src: '紹介' }
  ];
  var ST = { 'リード': 's-lead', '商談中': 's-deal', '提案': 's-prop', '受注': 's-won' };
  var WEEKS = [['10/13', 3, 1], ['10/20', 5, 0], ['10/27', 2, 1], ['11/3', 4, 2], ['11/10', 6, 1], ['11/17', 3, 1]];
  var MAILS = {
    'C社': { t: '先日のお打ち合わせの件', b: ['10月30日はお時間をいただき、ありがとうございました。', '<mark>導入時期は年明けを目安にご検討中</mark>と伺っておりました。その後、社内でのご検討状況はいかがでしょうか。', '気になる点があれば、短いお打ち合わせでもご説明します。'] },
    'F社': { t: 'お送りしたご提案書の件', b: ['先日はご提案の機会をいただき、ありがとうございました。', '<mark>費用の内訳をもう少し細かく見たい</mark>とのお話がありましたので、内訳を整理した資料をご用意しました。', 'ご都合のよい日時を教えていただけますでしょうか。'] },
    'H社': { t: '現場のみなさまとのお打ち合わせの件', b: ['10月28日はありがとうございました。', '<mark>現場の方にも一度話を聞いてほしい</mark>とのことでしたので、日程のご相談をさせてください。', '30分ほどで、実際の画面をお見せしながらご説明します。'] }
  };

  var R1 = [
    { k: 'drill', q: 'ダッシュボードの数字を押したら、顧客情報が見られるようにしたい', a: '数字を押せるようにしました。いまは「要フォロー」を押した状態です。ほかの数字も押してみてください。', done: 'ダッシュボードの数字から顧客一覧へ' },
    { k: 'weekly', q: 'KPIを週ごとに見られるようにしたい', a: '「週別KPI」を追加しました。新規商談と受注の件数を、週ごとに並べています。', done: '週別KPI' },
    { k: 'follow', q: '連絡が止まっている顧客に、追客メールの下書きを用意してほしい', a: '「追客メール」を追加しました。14日以上連絡がない3社に、前回の記録をふまえた下書きを用意しています。送るかどうかは、確認してから決めてください。', done: '追客メールの下書き' }
  ];
  var R2 = [
    { k: 'rep', q: '担当者ごとの数字を並べて見たい', a: '「担当者別」を追加しました。見込み額と要フォローの件数を、担当者ごとに並べています。', done: '担当者別の集計' },
    { k: 'notice', q: '毎朝、今日やることをチャットで知らせてほしい', a: '「毎朝の通知」を追加しました。毎朝8時に、こんな内容をチャットに届けます。', done: '毎朝の通知' },
    { k: 'field', q: '自社で使っている「紹介元」の項目を足したい', a: '顧客一覧に「紹介元」を足しました。紹介元で絞り込むこともできます。', done: '自社の項目「紹介元」' }
  ];
  var TABS = { list: '顧客一覧', weekly: '週別KPI', follow: '追客メール', rep: '担当者別', notice: '毎朝の通知' };
  var TAB_OF = { drill: 'list', weekly: 'weekly', follow: 'follow', rep: 'rep', notice: 'notice', field: 'list' };

  var st, timers = [], busy = false;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function has(k) { return st.features.indexOf(k) !== -1; }
  function wait(ms, fn) { timers.push(setTimeout(fn, reduce ? Math.min(ms, 150) : ms)); }
  function active() { return DATA.filter(function (c) { return c.s === '商談中' || c.s === '提案'; }); }
  function stale() { return DATA.filter(function (c) { return c.g >= 14 && c.s !== '受注'; }); }
  function sum(list) { return list.reduce(function (t, c) { return t + c.a; }, 0); }
  function man(n) { return n ? n.toLocaleString('ja-JP') + '<small>万円</small>' : '<small>-</small>'; }
  var CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#24477C" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';
  var ARROW = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>';

  // ---------- 画面 ----------
  function sheetHtml() {
    var h = '<div class="mk-fx"><b>fx</b><span>顧客名</span></div>' +
      '<table class="mk-sheet"><colgroup><col class="mk-rn"><col class="c1"><col class="c2"><col class="c3"><col class="c4"><col class="c5"></colgroup>' +
      '<tr class="mk-col"><th></th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th></tr>' +
      '<tr class="mk-hd"><td class="mk-rn">1</td><td>顧客名</td><td>担当</td><td>ステータス</td><td>商談金額</td><td>最終連絡日</td></tr>';
    DATA.forEach(function (c, i) {
      h += '<tr><td class="mk-rn">' + (i + 2) + '</td><td>' + c.n + '</td><td>' + c.r + '</td><td>' + c.s + '</td><td class="mk-num">' + (c.a ? (c.a * 10000).toLocaleString('ja-JP') : '') + '</td><td class="mk-num">' + c.d + '</td></tr>';
    });
    h += '<tr><td class="mk-rn">10</td><td></td><td></td><td></td><td></td><td></td></tr></table>';
    return h;
  }

  function kpisHtml() {
    var tiles = [
      ['active', '進行中の商談', active().length + '<small>件</small>', ''],
      ['amount', '見込み額の合計', man(sum(active())), ''],
      ['stale', '要フォロー', stale().length + '<small>件</small>', ' is-alert']
    ];
    var drill = has('drill');
    return '<div class="mk-kpis">' + tiles.map(function (t) {
      var inner = '<span class="mk-kpi-k">' + t[1] + '</span><span class="mk-kpi-v">' + t[2] + '</span>' + (drill ? '<span class="mk-kpi-hint">押すと一覧' + '</span>' : '');
      if (!drill) return '<div class="mk-kpi' + t[3] + '">' + inner + '</div>';
      var on = st.filter === t[0];
      return '<button type="button" class="mk-kpi' + t[3] + (on ? ' is-on' : '') + '" data-kpi="' + t[0] + '" aria-pressed="' + on + '">' + inner + '</button>';
    }).join('') + '</div>';
  }

  function tabsHtml() {
    var keys = ['list'];
    st.features.forEach(function (f) { var t = TAB_OF[f]; if (keys.indexOf(t) === -1) keys.push(t); });
    var newest = st.features.length ? TAB_OF[st.features[st.features.length - 1]] : '';
    return '<div class="mk-tabs">' + keys.map(function (k) {
      var isNew = k === newest && k !== 'list';
      return '<button type="button" class="mk-tab" data-tab="' + k + '" aria-pressed="' + (st.tab === k) + '">' + TABS[k] + (isNew ? '<span class="mk-new">NEW</span>' : '') + '</button>';
    }).join('') + '</div>';
  }

  function listHtml() {
    var rows = DATA.slice(), title = '全' + DATA.length + '社';
    if (st.filter === 'active') { rows = active(); title = '進行中の商談 ' + rows.length + '件'; }
    if (st.filter === 'amount') { rows = active().sort(function (x, y) { return y.a - x.a; }); title = '見込み額の大きい順'; }
    if (st.filter === 'stale') { rows = stale(); title = '要フォロー(14日以上連絡なし) ' + rows.length + '件'; }
    var field = has('field');
    if (field && st.src) rows = rows.filter(function (c) { return c.src === st.src; });
    var h = '<div class="mk-sub"><span><b>' + title + '</b>' + (field && st.src ? '・紹介元:' + st.src : '') + '</span>' +
      (st.filter ? '<button type="button" class="mk-clear" data-clear="1">すべて表示</button>' : '') + '</div>';
    if (field) {
      h += '<div class="mk-chips">' + ['', 'Web', '紹介', '展示会'].map(function (s) {
        return '<button type="button" class="mk-chip" data-src="' + s + '" aria-pressed="' + (st.src === s) + '">' + (s ? '紹介元:' + s : 'すべての紹介元') + '</button>';
      }).join('') + '</div>';
    }
    h += '<ul class="mk-list">' + rows.map(function (c) {
      var isStale = c.g >= 14 && c.s !== '受注';
      return '<li class="mk-item' + (isStale ? ' is-stale' : '') + '"><span class="mk-item-name">' + c.n + '<span class="mk-badge ' + ST[c.s] + '">' + c.s + '</span></span>' +
        '<span class="mk-item-amt">' + man(c.a) + '</span>' +
        '<span class="mk-item-meta"><span>担当 ' + c.r + '</span>' + (isStale ? '<span class="mk-stale">' + c.g + '日 連絡なし</span>' : '<span>最終連絡 ' + c.d + '</span>') +
        (field ? '<span class="mk-src">紹介元:' + c.src + '</span>' : '') + '</span></li>';
    }).join('') + '</ul>';
    if (!rows.length) h += '<p class="mk-sheet-note">該当する顧客はいません。</p>';
    return h;
  }

  function weeklyHtml() {
    var max = 6;
    return '<div class="mk-legend"><span><i style="background:#24477C"></i>新規商談</span><span><i style="background:#97B3D6"></i>受注</span></div>' +
      '<div class="mk-chart" role="img" aria-label="週別の新規商談と受注の件数">' + WEEKS.map(function (w, i) {
        return '<div class="mk-wk"><div class="mk-b c1" style="height:' + (w[1] / max * 82) + '%;animation-delay:' + (i * 60) + 'ms"><span>' + w[1] + '</span></div>' +
          '<div class="mk-b c2" style="height:' + Math.max(w[2] / max * 82, 1) + '%;animation-delay:' + (i * 60 + 30) + 'ms"><span>' + w[2] + '</span></div></div>';
      }).join('') + '</div>' +
      '<div class="mk-wk-labels">' + WEEKS.map(function (w, i) { return '<span' + (i === WEEKS.length - 1 ? ' class="is-now"' : '') + '>' + w[0] + '週' + '</span>'; }).join('') + '</div>' +
      '<div class="mk-insight">新規商談がいちばん多かったのは11/10の週(6件)。今週はここまで新規商談3件・受注1件です。</div>';
  }

  function followHtml() {
    var list = stale();
    if (!st.pick) st.pick = list[0].n;
    var m = MAILS[st.pick];
    return '<div class="mk-follow"><div class="mk-follow-list">' + list.map(function (c) {
      return '<button type="button" class="mk-pick" data-pick="' + c.n + '" aria-pressed="' + (st.pick === c.n) + '"><b>' + c.n + '</b>' + c.g + '日 連絡なし</button>';
    }).join('') + '</div>' +
      '<div class="mk-mail"><div class="mk-mail-h">宛先:<b>' + st.pick + ' ご担当者様</b><br>件名:<b>' + m.t + '</b></div>' +
      m.b.map(function (p) { return '<p>' + p + '</p>'; }).join('') +
      '<div class="mk-mail-note">色付きの部分は、前回の商談記録から入れた内容です。送るかどうかと最後のひと言は、担当者が決めます。</div></div></div>';
  }

  function repHtml() {
    var reps = ['A', 'B', 'C'].map(function (r) {
      var mine = DATA.filter(function (c) { return c.r === r; });
      var act = mine.filter(function (c) { return c.s === '商談中' || c.s === '提案'; });
      var stl = mine.filter(function (c) { return c.g >= 14 && c.s !== '受注'; });
      return { r: r, n: mine.length, amt: sum(act), stale: stl.length };
    });
    var max = Math.max.apply(null, reps.map(function (x) { return x.amt; }));
    return '<div class="mk-sub"><b>担当者別 見込み額</b></div><div class="mk-rep">' + reps.map(function (x, i) {
      return '<div class="mk-rep-row"><span class="mk-rep-name"><span class="mk-av">' + x.r + '</span>担当' + x.r + '</span>' +
        '<div class="mk-rep-track"><div class="mk-rep-bar" style="width:' + Math.max(x.amt / max * 100, 30) + '%;animation-delay:' + (i * 80) + 'ms">' + x.amt + '万円</div></div>' +
        '<span class="mk-rep-sub">' + x.n + '社担当・要フォロー' + x.stale + '件</span></div>';
    }).join('') + '</div>' +
      '<div class="mk-insight">見込み額は担当Bに集まっています。要フォローは3人とも1件ずつです。</div>';
  }

  function noticeHtml() {
    var list = stale().sort(function (x, y) { return y.g - x.g; });
    return '<div class="mk-notice"><div class="mk-notice-head">営業チャット ・ 毎朝 8:00</div><div class="mk-notice-msg"><span class="mk-ai">AI</span>' +
      '<div class="mk-notice-body">おはようございます。今日やることは' + list.length + '件です。<ul>' +
      list.map(function (c) { return '<li>' + c.n + '(担当' + c.r + '):' + c.g + '日連絡なし。追客メールの下書きあり</li>'; }).join('') +
      '</ul>進行中の商談の見込み額は、合計' + sum(active()) + '万円です。</div></div></div>';
  }

  function render(animate) {
    var h;
    if (st.mode === 'sheet') {
      nameEl.textContent = '顧客リスト - スプレッドシート';
      h = sheetHtml();
    } else {
      nameEl.textContent = '顧客管理ツール(自社用)';
      h = '<div class="mk-app-head"><span class="mk-app-title">顧客管理</span><span class="mk-app-date">11/19 時点</span></div>' + kpisHtml() + tabsHtml();
      h += ({ list: listHtml, weekly: weeklyHtml, follow: followHtml, rep: repHtml, notice: noticeHtml })[st.tab]();
    }
    screen.innerHTML = h;
    screen.classList.remove('is-in');
    if (animate) { void screen.offsetWidth; screen.classList.add('is-in'); }
  }

  screen.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || busy) return;
    var focusKey = null;
    if (b.dataset.kpi) { st.filter = st.filter === b.dataset.kpi ? '' : b.dataset.kpi; st.tab = 'list'; focusKey = '[data-kpi="' + b.dataset.kpi + '"]'; }
    else if (b.dataset.clear) { st.filter = ''; focusKey = '.mk-kpi'; }
    else if (b.dataset.tab) { st.tab = b.dataset.tab; focusKey = '[data-tab="' + b.dataset.tab + '"]'; }
    else if (b.dataset.src !== undefined) { st.src = b.dataset.src; focusKey = '[data-src="' + b.dataset.src + '"]'; }
    else if (b.dataset.pick) { st.pick = b.dataset.pick; focusKey = '[data-pick="' + b.dataset.pick + '"]'; }
    else return;
    render(false);
    var f = focusKey && screen.querySelector(focusKey);
    if (f) f.focus({ preventScroll: true });
  });

  // ---------- チャット ----------
  function scrollLog() { log.scrollTop = log.scrollHeight; }
  function addMsg(html, me) {
    var d = document.createElement('div');
    d.className = 'mk-msg' + (me ? ' is-me' : '');
    d.innerHTML = (me ? '' : '<span class="mk-ai" aria-hidden="true">AI</span>') + '<div class="mk-msg-b">' + html + '</div>';
    log.appendChild(d);
    scrollLog();
    return d;
  }
  function thinking(text) {
    var d = addMsg('<span class="mk-think"><i></i><i></i><i></i>' + text + '</span>');
    d.setAttribute('aria-hidden', 'true');
    return d;
  }
  function setChoices(items, q, focus) {
    choicesEl.innerHTML = (q ? '<div class="mk-choices-q">' + q + '</div>' : '') + items.map(function (c, i) {
      return '<button type="button" class="mk-choice' + (c.cls ? ' ' + c.cls : '') + '" data-i="' + i + '" style="animation-delay:' + (i * 80) + 'ms">' + '<span>' + esc(c.label) + '</span>' + (c.cls ? '' : ARROW) + '</button>';
    }).join('');
    choicesEl._items = items;
    scrollLog();
    if (focus) { var f = choicesEl.querySelector('button'); if (f) f.focus({ preventScroll: true }); }
  }
  choicesEl.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || busy) return;
    var item = choicesEl._items[+b.dataset.i];
    var hadFocus = root.contains(document.activeElement) && document.activeElement !== document.body;
    item.run(hadFocus);
  });

  function typeThen(text, fn) {
    busy = true;
    choicesEl.innerHTML = '';
    inputT.classList.add('is-typing');
    var i = 0, step = reduce ? text.length : 2;
    (function tick() {
      i = Math.min(text.length, i + step);
      inputT.textContent = text.slice(0, i);
      if (i < text.length) timers.push(setTimeout(tick, 28));
      else wait(250, function () {
        inputT.textContent = PH;
        inputT.classList.remove('is-typing');
        addMsg(esc(text), true);
        fn();
      });
    })();
  }
  function showScreen() {
    if (narrow.matches) {
      var r = win.getBoundingClientRect();
      if (r.top < 0) win.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  }
  function build(userText, thinkText, apply, reply, next, focus) {
    typeThen(userText, function () {
      var t = thinking('考えています');
      wait(900, function () {
        t.querySelector('.mk-think').lastChild.textContent = thinkText;
        wait(900, function () {
          t.remove();
          apply();
          render(true);
          showScreen();
          wait(350, function () {
            addMsg(reply);
            wait(400, function () { busy = false; next(focus); });
          });
        });
      });
    });
  }

  function addFeature(opt) {
    st.features.push(opt.k);
    st.done.push(opt.done);
    st.tab = TAB_OF[opt.k];
    if (opt.k === 'drill') st.filter = 'stale';
    if (opt.k === 'field') { st.filter = ''; st.src = ''; }
  }

  function round(list, n) {
    return function (focus) {
      setChoices(list.map(function (o) {
        return { label: o.q, run: function (f) {
          build(o.q, '画面を作っています', function () { addFeature(o); }, esc(o.a), n === 1 ? ask2 : finish, f);
        } };
      }), n === 1 ? '次にどうしたいですか?' : 'もう1つ足してみましょう', focus);
    };
  }
  function ask2(focus) {
    wait(500, function () {
      addMsg('ほかに足したいものはありますか?');
      round(R2, 2)(focus);
    });
  }
  function finish(focus) {
    wait(600, function () {
      addMsg('最初はただの表だった顧客リストが、欲しい機能を伝えるたびに、自社に合ったツールになっていきました。<ul class="mk-done">' +
        st.done.map(function (d) { return '<li>' + CHECK + '<span>' + esc(d) + '</span></li>'; }).join('') +
        '</ul>');
      wait(500, function () {
        addMsg('使いながら「ここをこうしたい」と思ったら、また話しかけてください。AIを使うと、こうして自社専用の仕組みを少しずつ育てていけます。');
        setChoices([{ label: '最初からやり直す', cls: 'is-reset', run: function (f) { reset(f); } }], '', focus);
      });
    });
  }

  function reset(focus) {
    timers.forEach(clearTimeout);
    timers = [];
    busy = false;
    st = { mode: 'sheet', features: [], done: [], tab: 'list', filter: '', src: '', pick: '' };
    log.innerHTML = '';
    inputT.textContent = PH;
    inputT.classList.remove('is-typing');
    resetS.hidden = true;
    render(!!focus);
    addMsg('顧客リストのスプレッドシートを開きました。まずは、見やすいツールの形にしてみましょうか?');
    setChoices([{ label: 'ツールにする', cls: 'is-primary', run: function (f) {
      resetS.hidden = false;
      build('このリストを、見やすいツールにして', 'ツールを作っています', function () {
        st.mode = 'tool';
        st.done.push('スプレッドシートをツールに');
      }, 'ツールにしました。画面の上の数字は、シートの内容から自動で集計しています。', round(R1, 1), f);
    } }], '', focus);
  }

  resetS.addEventListener('click', function () { reset(true); });
  reset(false);
})();
