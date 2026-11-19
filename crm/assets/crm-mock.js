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
  var small = window.matchMedia ? window.matchMedia('(max-width: 600px)') : { matches: false };
  function pageSize() { return small.matches ? 4 : 5; }

  // ダミーデータ(すべて架空)。金額は商談金額(万円)
  var DATA = [
    { n: 'A社', r: 'A', s: '商談中', a: 120, d: '11/14', g: 0, src: 'Web', tel: '03-0000-0001', mail: 'info@a-sha.example',
      memo: '現在はスプレッドシートで管理。来月中に社内で比較検討の予定。',
      act: [['11/14', 'オンライン商談', '現在の管理方法と課題をヒアリング'], ['11/05', '資料送付', 'サービス紹介資料をメールで送付'], ['10/31', '問い合わせ受付', 'Webサイトのフォームから']] },
    { n: 'B社', r: 'B', s: '提案', a: 340, d: '11/18', g: 1, src: '紹介', tel: '03-0000-0002', mail: 'info@b-sha.example',
      memo: '提案の返事待ち。月末の会議で決裁予定。',
      act: [['11/18', '電話', '提案内容への質問に回答'], ['11/12', '提案書送付', '要件をふまえた提案書を送付'], ['11/04', '打ち合わせ', '要件の確認'], ['10/22', '初回面談', '取引先からのご紹介']] },
    { n: 'C社', r: 'A', s: '商談中', a: 80, d: '10/30', g: 20, src: '展示会', tel: '03-0000-0003', mail: 'info@c-sha.example',
      memo: '導入時期は年明けを目安に検討中。',
      act: [['10/30', '打ち合わせ', '導入時期は年明けを目安に検討中とのこと'], ['10/16', 'オンライン商談', '現在の運用と課題をヒアリング'], ['10/09', '名刺交換', '展示会のブースにて']] },
    { n: 'D社', r: 'C', s: '受注', a: 210, d: '11/17', g: 2, src: '紹介', tel: '03-0000-0004', mail: 'info@d-sha.example',
      memo: '12月から利用開始の予定。',
      act: [['11/17', '契約締結', '申込書を受領'], ['11/10', '最終提案', '導入スケジュールを合意'], ['10/27', '提案書送付', '提案書と見積を送付'], ['10/14', '初回面談', '取引先からのご紹介']] },
    { n: 'E社', r: 'B', s: 'リード', a: 0, d: '11/11', g: 8, src: 'Web', tel: '03-0000-0005', mail: 'info@e-sha.example',
      memo: '初回の打ち合わせの日程を調整中。',
      act: [['11/11', 'メール送信', '資料請求への御礼と日程のご相談'], ['11/10', '資料請求', 'Webサイトのフォームから']] },
    { n: 'F社', r: 'C', s: '提案', a: 150, d: '11/01', g: 18, src: 'Web', tel: '03-0000-0006', mail: 'info@f-sha.example',
      memo: '費用の内訳を整理した資料を用意する。',
      act: [['11/01', '提案', '費用の内訳をもう少し細かく見たいとのこと'], ['10/20', 'オンライン商談', '要件の確認'], ['10/08', '問い合わせ受付', 'Webサイトのフォームから']] },
    { n: 'G社', r: 'A', s: 'リード', a: 0, d: '11/19', g: 0, src: '展示会', tel: '03-0000-0007', mail: 'info@g-sha.example',
      memo: '来週、電話で状況を伺う。',
      act: [['11/19', 'メール送信', '展示会のご来場への御礼'], ['11/18', '名刺交換', '展示会のブースにて']] },
    { n: 'H社', r: 'B', s: '商談中', a: 95, d: '10/28', g: 22, src: '紹介', tel: '03-0000-0008', mail: 'info@h-sha.example',
      memo: '現場のご担当者との日程を調整する。',
      act: [['10/28', '打ち合わせ', '現場の方にも一度話を聞いてほしいとのこと'], ['10/15', 'オンライン商談', '現在の運用をヒアリング'], ['10/01', '初回面談', '取引先からのご紹介']] }
  ];
  var STAGES = ['リード', '商談中', '提案', '受注'];
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
  var TABS = { list: '顧客', weekly: '週別KPI', follow: '追客メール', rep: '担当者別', notice: '毎朝の通知' };
  var TAB_OF = { drill: 'list', weekly: 'weekly', follow: 'follow', rep: 'rep', notice: 'notice', field: 'list' };

  var st, timers = [], busy = false;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function has(k) { return st.features.indexOf(k) !== -1; }
  function wait(ms, fn) { timers.push(setTimeout(fn, reduce ? Math.min(ms, 150) : ms)); }
  function isStale(c) { return c.g >= 14 && c.s !== '受注'; }
  function active() { return DATA.filter(function (c) { return c.s === '商談中' || c.s === '提案'; }); }
  function stale() { return DATA.filter(isStale); }
  function sum(list) { return list.reduce(function (t, c) { return t + c.a; }, 0); }
  function man(n) { return n ? n.toLocaleString('ja-JP') + '万円' : '-'; }
  function find(n) { return DATA.filter(function (c) { return c.n === n; })[0]; }
  var CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#24477C" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';
  var ARROW = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>';
  // 自作アイコン(ビル・グラフ・メール・人・ベル)
  var IC = {
    list: '<path d="M4 20V6l7-3v17M11 20V9l9 3v8M2 20h20M7 9v.01M7 13v.01M7 17v.01M15 14v.01M15 17v.01"/>',
    weekly: '<path d="M4 20V10M10 20V4M16 20v-7M2 20h20"/>',
    follow: '<path d="M3 6h18v12H3zM3 7l9 6 9-6"/>',
    rep: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.3-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.5 3.5 5.2"/>',
    notice: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9M10 20a2 2 0 0 0 4 0"/>'
  };
  var IC_BG = { list: '#5B6FD6', weekly: '#2E8C8C', follow: '#C9662D', rep: '#7C5CC4', notice: '#B5486F' };
  function icon(k, big) {
    var s = big ? 22 : 16;
    return '<span class="sf-ic' + (big ? ' is-big' : '') + '" style="background:' + IC_BG[k] + '" aria-hidden="true"><svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + IC[k] + '</svg></span>';
  }
  function card(k, title, sub, body, extra) {
    return '<div class="sf-card"><div class="sf-card-h">' + icon(k) + '<div class="sf-card-t"><span class="sf-card-obj">' + title + '</span>' + (sub ? '<span class="sf-card-sub">' + sub + '</span>' : '') + '</div>' + (extra || '') + '</div>' + body + '</div>';
  }

  // ---------- スプレッドシート ----------
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

  // ---------- ツール ----------
  function shellHtml(body) {
    var keys = ['list'];
    st.features.forEach(function (f) { var t = TAB_OF[f]; if (keys.indexOf(t) === -1) keys.push(t); });
    var newest = st.features.length ? TAB_OF[st.features[st.features.length - 1]] : '';
    return '<div class="sf">' +
      '<div class="sf-top"><span class="sf-launch" aria-hidden="true">' + new Array(10).join('<i></i>') + '</span>' +
      '<span class="sf-search" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#747474" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>検索</span>' +
      '<span class="sf-user" aria-hidden="true">A</span></div>' +
      '<div class="sf-nav"><span class="sf-app">顧客管理</span><div class="sf-tabs">' + keys.map(function (k) {
        var on = st.tab === k;
        return '<button type="button" class="sf-tab" data-tab="' + k + '" aria-pressed="' + on + '">' + TABS[k] + (k === newest && k !== 'list' ? '<span class="mk-new">NEW</span>' : '') + '</button>';
      }).join('') + '</div></div>' +
      '<div class="sf-body">' + body + '</div></div>';
  }

  function tilesHtml() {
    var tiles = [
      ['active', '進行中の商談', active().length + '<small>件</small>', ''],
      ['amount', '見込み額の合計', sum(active()).toLocaleString('ja-JP') + '<small>万円</small>', ''],
      ['stale', '要フォロー', stale().length + '<small>件</small>', ' is-alert']
    ];
    var drill = has('drill');
    return '<div class="sf-tiles">' + tiles.map(function (t) {
      var inner = '<span class="sf-tile-k">' + t[1] + '</span><span class="sf-tile-v">' + t[2] + '</span>' + (drill ? '<span class="sf-tile-link">一覧を表示 ›</span>' : '');
      if (!drill) return '<div class="sf-tile' + t[3] + '">' + inner + '</div>';
      var on = st.filter === t[0];
      return '<button type="button" class="sf-tile' + t[3] + (on ? ' is-on' : '') + '" data-kpi="' + t[0] + '" aria-pressed="' + on + '">' + inner + '</button>';
    }).join('') + '</div>';
  }

  function listRows() {
    var rows = DATA.slice(), view = 'すべての顧客';
    if (st.filter === 'active') { rows = active(); view = '進行中の商談'; }
    if (st.filter === 'amount') { rows = active().sort(function (x, y) { return y.a - x.a; }); view = '見込み額の大きい順'; }
    if (st.filter === 'stale') { rows = stale(); view = '要フォロー(14日以上連絡なし)'; }
    if (has('field') && st.src) rows = rows.filter(function (c) { return c.src === st.src; });
    return { rows: rows, view: view };
  }

  function listHtml() {
    var lr = listRows(), rows = lr.rows, field = has('field');
    var PAGE = pageSize();
    var pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (st.page > pages) st.page = pages;
    var from = (st.page - 1) * PAGE, shown = rows.slice(from, from + PAGE);
    var extra = st.filter ? '<button type="button" class="sf-btn" data-clear="1">すべて表示</button>' : '';
    var h = '<div class="sf-meta">' + rows.length + '件' + (field && st.src ? '・紹介元:' + st.src : '') + '・会社名を押すと詳細を表示</div>';
    if (field) {
      h += '<div class="sf-chips">' + ['', 'Web', '紹介', '展示会'].map(function (s) {
        return '<button type="button" class="sf-chip" data-src="' + s + '" aria-pressed="' + (st.src === s) + '">' + (s ? s : 'すべて') + '</button>';
      }).join('') + '</div>';
    }
    h += '<table class="sf-table"><thead><tr><th>顧客名</th><th>担当</th><th>ステータス</th><th class="is-num">商談金額</th><th>最終連絡日</th>' + (field ? '<th>紹介元</th>' : '') + '</tr></thead><tbody>' +
      shown.map(function (c) {
        return '<tr data-open="' + c.n + '"><td><button type="button" class="sf-link" data-open="' + c.n + '">' + c.n + '</button></td><td>担当' + c.r + '</td><td>' + c.s + '</td><td class="is-num">' + man(c.a) + '</td>' +
          '<td>' + c.d + (isStale(c) ? '<span class="sf-warn">' + c.g + '日</span>' : '') + '</td>' + (field ? '<td>' + c.src + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table>';
    h += '<ul class="sf-mlist">' + shown.map(function (c) {
      return '<li><button type="button" class="sf-mrow" data-open="' + c.n + '"><span class="sf-mrow-top"><span class="sf-link-t">' + c.n + '</span><span class="sf-mrow-amt">' + man(c.a) + '</span></span>' +
        '<span class="sf-mrow-sub">担当' + c.r + '・' + c.s + '・' + (isStale(c) ? '<span class="sf-warn">' + c.g + '日 連絡なし</span>' : '最終連絡 ' + c.d) + (field ? '・' + c.src : '') + '</span></button></li>';
    }).join('') + '</ul>';
    if (!rows.length) h += '<p class="sf-empty">該当する顧客はいません。</p>';
    h += '<div class="sf-pager"><span>' + (rows.length ? (from + 1) + '-' + (from + shown.length) : 0) + ' / ' + rows.length + '件</span>' +
      '<button type="button" class="sf-btn" data-page="-1"' + (st.page <= 1 ? ' disabled' : '') + '>‹ 前へ</button>' +
      '<button type="button" class="sf-btn" data-page="1"' + (st.page >= pages ? ' disabled' : '') + '>次へ ›</button></div>';
    return tilesHtml() + card('list', '顧客', lr.view + ' ▾', h, extra);
  }

  function detailHtml() {
    var c = find(st.detail), field = has('field');
    var idx = STAGES.indexOf(c.s), won = c.s === '受注';
    var path = '<ol class="sf-path">' + STAGES.map(function (s, i) {
      var cls = won || i < idx ? 'is-done' : (i === idx ? 'is-cur' : '');
      return '<li class="' + cls + '"' + (i === idx ? ' aria-current="step"' : '') + '>' + (cls === 'is-done' ? '✓ ' : '') + s + '</li>';
    }).join('') + '</ol>';
    var fields = [['会社名', c.n], ['担当', '担当' + c.r], ['ステータス', c.s], ['商談金額', man(c.a)], ['最終連絡日', c.d + (isStale(c) ? '<span class="sf-warn">' + c.g + '日 連絡なし</span>' : '')], ['電話', c.tel], ['メール', c.mail]];
    if (field) fields.push(['紹介元', c.src]);
    var hl = [['担当', '担当' + c.r], ['商談金額', man(c.a)], ['最終連絡日', c.d]];
    if (field) hl.push(['紹介元', c.src]);
    return '<button type="button" class="sf-back" data-back="1">‹ 顧客一覧に戻る</button>' +
      '<div class="sf-card sf-hl"><div class="sf-hl-top">' + icon('list', true) + '<div><div class="sf-card-obj">顧客</div><div class="sf-hl-name">' + c.n + '</div></div></div>' +
      '<dl class="sf-hl-fields">' + hl.map(function (f) { return '<div><dt>' + f[0] + '</dt><dd>' + f[1] + '</dd></div>'; }).join('') + '</dl></div>' +
      '<div class="sf-card sf-pathbox">' + path + '</div>' +
      '<div class="sf-2col">' +
      '<div class="sf-card"><div class="sf-sec">詳細</div><dl class="sf-fields">' + fields.map(function (f) { return '<div><dt>' + f[0] + '</dt><dd>' + f[1] + '</dd></div>'; }).join('') +
      '<div class="is-wide"><dt>メモ</dt><dd>' + c.memo + '</dd></div></dl></div>' +
      '<div class="sf-card"><div class="sf-sec">活動履歴</div><ul class="sf-acts">' + c.act.map(function (a) {
        return '<li><span class="sf-act-dot" aria-hidden="true"></span><div><div class="sf-act-h"><b>' + a[1] + '</b><span>' + a[0] + '</span></div><div class="sf-act-n">' + a[2] + '</div></div></li>';
      }).join('') + '</ul></div></div>';
  }

  function weeklyHtml() {
    var max = 6;
    var body = '<div class="mk-legend"><span><i class="c1"></i>新規商談</span><span><i class="c2"></i>受注</span></div>' +
      '<div class="mk-chart" role="img" aria-label="週別の新規商談と受注の件数">' + WEEKS.map(function (w, i) {
        return '<div class="mk-wk"><div class="mk-b c1" style="height:' + (w[1] / max * 82) + '%;animation-delay:' + (i * 60) + 'ms"><span>' + w[1] + '</span></div>' +
          '<div class="mk-b c2" style="height:' + Math.max(w[2] / max * 82, 1) + '%;animation-delay:' + (i * 60 + 30) + 'ms"><span>' + w[2] + '</span></div></div>';
      }).join('') + '</div>' +
      '<div class="mk-wk-labels">' + WEEKS.map(function (w, i) { return '<span' + (i === WEEKS.length - 1 ? ' class="is-now"' : '') + '>' + w[0] + '週</span>'; }).join('') + '</div>' +
      '<div class="mk-insight">新規商談がいちばん多かったのは11/10の週(6件)。今週はここまで新規商談3件・受注1件です。</div>';
    return card('weekly', 'レポート', '週別KPI(直近6週)', body);
  }

  function followHtml() {
    var list = stale();
    if (!st.pick) st.pick = list[0].n;
    var m = MAILS[st.pick];
    var body = '<div class="mk-follow"><div class="mk-follow-list">' + list.map(function (c) {
      return '<button type="button" class="mk-pick" data-pick="' + c.n + '" aria-pressed="' + (st.pick === c.n) + '"><b>' + c.n + '</b>' + c.g + '日 連絡なし</button>';
    }).join('') + '</div>' +
      '<div class="mk-mail"><div class="mk-mail-h">宛先:<b>' + st.pick + ' ご担当者様</b><br>件名:<b>' + m.t + '</b></div>' +
      m.b.map(function (p) { return '<p>' + p + '</p>'; }).join('') +
      '<div class="mk-mail-note">色付きの部分は、前回の商談記録から入れた内容です。送るかどうかと最後のひと言は、担当者が決めます。</div></div></div>';
    return card('follow', '追客メール', '下書き ' + list.length + '件', body);
  }

  function repHtml() {
    var reps = ['A', 'B', 'C'].map(function (r) {
      var mine = DATA.filter(function (c) { return c.r === r; });
      var act = mine.filter(function (c) { return c.s === '商談中' || c.s === '提案'; });
      return { r: r, n: mine.length, amt: sum(act), stale: mine.filter(isStale).length };
    });
    var max = Math.max.apply(null, reps.map(function (x) { return x.amt; }));
    var body = '<div class="mk-rep">' + reps.map(function (x, i) {
      return '<div class="mk-rep-row"><span class="mk-rep-name"><span class="mk-av">' + x.r + '</span>担当' + x.r + '</span>' +
        '<div class="mk-rep-track"><div class="mk-rep-bar" style="width:' + Math.max(x.amt / max * 100, 30) + '%;animation-delay:' + (i * 80) + 'ms">' + x.amt + '万円</div></div>' +
        '<span class="mk-rep-sub">' + x.n + '社担当・要フォロー' + x.stale + '件</span></div>';
    }).join('') + '</div>' +
      '<div class="mk-insight">見込み額は担当Bに集まっています。要フォローは3人とも1件ずつです。</div>';
    return card('rep', 'レポート', '担当者別 見込み額', body);
  }

  function noticeHtml() {
    var list = stale().sort(function (x, y) { return y.g - x.g; });
    var body = '<div class="mk-notice"><div class="mk-notice-head">営業チャット ・ 毎朝 8:00</div><div class="mk-notice-msg"><span class="mk-ai">AI</span>' +
      '<div class="mk-notice-body">おはようございます。今日やることは' + list.length + '件です。<ul>' +
      list.map(function (c) { return '<li>' + c.n + '(担当' + c.r + '):' + c.g + '日連絡なし。追客メールの下書きあり</li>'; }).join('') +
      '</ul>進行中の商談の見込み額は、合計' + sum(active()) + '万円です。</div></div></div>';
    return card('notice', '通知', '毎朝のチャット(見本)', body);
  }

  function render(animate) {
    var h;
    if (st.mode === 'sheet') {
      nameEl.textContent = '顧客リスト - スプレッドシート';
      screen.classList.remove('is-tool');
      h = sheetHtml();
    } else {
      nameEl.textContent = '顧客管理ツール(自社用)';
      screen.classList.add('is-tool');
      var body = st.tab === 'list' && st.detail ? detailHtml() :
        ({ list: listHtml, weekly: weeklyHtml, follow: followHtml, rep: repHtml, notice: noticeHtml })[st.tab]();
      h = shellHtml(body);
    }
    screen.innerHTML = h;
    screen.classList.remove('is-in');
    if (animate) { void screen.offsetWidth; screen.classList.add('is-in'); }
  }

  screen.addEventListener('click', function (e) {
    var b = e.target.closest('button,tr[data-open]');
    if (!b || busy || b.disabled) return;
    var d = b.dataset, focusKey = null;
    if (d.open) { st.detail = d.open; focusKey = '[data-back]'; }
    else if (d.back) { focusKey = '.sf-link[data-open="' + st.detail + '"],.sf-mrow[data-open="' + st.detail + '"]'; st.detail = ''; }
    else if (d.kpi) { st.filter = st.filter === d.kpi ? '' : d.kpi; st.page = 1; focusKey = '[data-kpi="' + d.kpi + '"]'; }
    else if (d.clear) { st.filter = ''; st.page = 1; focusKey = '.sf-tile'; }
    else if (d.tab) { st.tab = d.tab; st.detail = ''; focusKey = '[data-tab="' + d.tab + '"]'; }
    else if (d.src !== undefined) { st.src = d.src; st.page = 1; focusKey = '[data-src="' + d.src + '"]'; }
    else if (d.page) { st.page += +d.page; focusKey = '[data-page="' + d.page + '"]:not([disabled]),[data-page]:not([disabled])'; }
    else if (d.pick) { st.pick = d.pick; focusKey = '[data-pick="' + d.pick + '"]'; }
    else return;
    render(false);
    var all = focusKey ? screen.querySelectorAll(focusKey) : [];
    for (var i = 0; i < all.length; i++) { if (all[i].offsetParent) { all[i].focus({ preventScroll: true }); break; } }
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
    st.detail = '';
    st.page = 1;
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
    st = { mode: 'sheet', features: [], done: [], tab: 'list', filter: '', src: '', pick: '', page: 1, detail: '' };
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
