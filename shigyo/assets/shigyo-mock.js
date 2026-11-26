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
  var small = window.matchMedia ? window.matchMedia('(max-width: 600px)') : { matches: false };
  var PH = 'メッセージを入力';
  var tiny = window.matchMedia ? window.matchMedia('(max-width: 400px)') : { matches: false };
  // 画面例へのリンク(メニュー): 固定ヘッダーの高さを差し引いた位置へ移動
  var mockSec = document.getElementById('mock');
  var head = document.querySelector('.site-header');
  var tryLinks = document.querySelectorAll('a.gnav-try[href="#mock"], a.sp-try[href="#mock"]');
  Array.prototype.forEach.call(tryLinks, function (a) {
    a.addEventListener('click', function (e) {
      if (!mockSec) return;
      e.preventDefault();
      hideTip();
      var top = mockSec.getBoundingClientRect().top + window.scrollY - (head ? head.offsetHeight : 0);
      window.scrollTo({ top: top, behavior: reduce ? 'instant' : 'smooth' });
    });
  });

  // メニューの「構築体験」から出す吹き出し。同じ訪問中は一度消したら出さない
  var tip = document.getElementById('try-tip');
  var TIP_KEY = 'naus_shigyo_try_tip';
  var tipTimer = null, tipOpen = false;
  function tipDone() { try { return window.sessionStorage.getItem(TIP_KEY) === '1'; } catch (err) { return false; } }
  function tipSave() { try { window.sessionStorage.setItem(TIP_KEY, '1'); } catch (err) {} }
  function tipTarget() {
    var list = document.querySelectorAll('.gnav-try, .sp-try');
    for (var i = 0; i < list.length; i++) { if (list[i].offsetParent) return list[i]; }
    return null;
  }
  function placeTip() {
    var t = tipTarget();
    if (!tip || !t || !head) return false;
    var hr = head.getBoundingClientRect(), tr = t.getBoundingClientRect();
    var cx = tr.left + tr.width / 2 - hr.left, w = tip.offsetWidth;
    var left = Math.max(8, Math.min(cx - w / 2, hr.width - w - 8));
    tip.style.left = left + 'px';
    tip.style.setProperty('--tip-arrow', (cx - left) + 'px');
    return true;
  }
  function mockReached() { return !!mockSec && mockSec.getBoundingClientRect().top < window.innerHeight * 0.8; }
  function hideTip() {
    if (!tip) return;
    tipSave();
    if (tipTimer) { clearTimeout(tipTimer); tipTimer = null; }
    if (!tipOpen) return;
    tipOpen = false;
    tip.classList.remove('is-show');
    setTimeout(function () { tip.hidden = true; }, 400);
  }
  function showTip() {
    if (!tip || tipDone()) return;
    if (mockReached()) { tipSave(); return; }
    tip.hidden = false;
    if (!placeTip()) { tip.hidden = true; return; }
    tipOpen = true;
    tipSave();
    requestAnimationFrame(function () { requestAnimationFrame(function () { tip.classList.add('is-show'); }); });
    tipTimer = setTimeout(hideTip, 8000);
  }

  // 開いた直後だけ、ページを薄暗くして「構築体験」の項目を浮かび上がらせる
  var openedWithHash = !!window.location.hash;
  var dim = null, dimTimers = [];
  var DIM_EVENTS = ['pointerdown', 'touchstart', 'wheel', 'keydown'];
  // メニューボタンが出る幅(859.98px以下)は暗転の代わりに、ヘッダーの「体験」ボタンを数回拡大させる
  var narrowMq = window.matchMedia ? window.matchMedia('(max-width: 859.98px)') : null;
  var pulseEl = null, pulseTimer = null;
  function stopPulse() {
    if (!pulseEl) return;
    var p = pulseEl;
    pulseEl = null;
    clearTimeout(pulseTimer);
    p.removeEventListener('animationend', stopPulse);
    p.classList.remove('is-pulse');
    DIM_EVENTS.forEach(function (ev) { window.removeEventListener(ev, onDimInput, true); });
    window.removeEventListener('scroll', onDimInput);
  }
  function startPulse(t) {
    pulseEl = t;
    t.addEventListener('animationend', stopPulse);
    t.classList.add('is-pulse');
    DIM_EVENTS.forEach(function (ev) { window.addEventListener(ev, onDimInput, { capture: true, passive: true }); });
    window.addEventListener('scroll', onDimInput, { passive: true });
    pulseTimer = setTimeout(stopPulse, 4000);
  }
  function hideDim(quick) {
    stopPulse();
    if (!dim) return;
    var d = dim;
    dim = null;
    dimTimers.forEach(clearTimeout);
    dimTimers = [];
    DIM_EVENTS.forEach(function (ev) { window.removeEventListener(ev, onDimInput, true); });
    window.removeEventListener('scroll', onDimInput);
    if (quick) d.classList.add('is-quick');
    d.classList.remove('is-show');
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, quick ? 200 : 450);
  }
  function onDimInput() { hideDim(true); }
  function showDim() {
    var t = tipTarget();
    if (!t || !head || reduce || openedWithHash || window.scrollY > 2) return;
    if (narrowMq && narrowMq.matches) { startPulse(t); return; }
    var hr = head.getBoundingClientRect(), tr = t.getBoundingClientRect(), pad = 6;
    dim = document.createElement('div');
    dim.className = 'try-dim';
    dim.setAttribute('aria-hidden', 'true');
    dim.style.left = (tr.left - hr.left - pad) + 'px';
    dim.style.top = (tr.top - hr.top - pad) + 'px';
    dim.style.width = (tr.width + pad * 2) + 'px';
    dim.style.height = (tr.height + pad * 2) + 'px';
    head.appendChild(dim);
    DIM_EVENTS.forEach(function (ev) { window.addEventListener(ev, onDimInput, { capture: true, passive: true }); });
    window.addEventListener('scroll', onDimInput, { passive: true });
    var d = dim;
    requestAnimationFrame(function () { requestAnimationFrame(function () { if (dim === d) d.classList.add('is-show'); }); });
    dimTimers.push(setTimeout(function () { hideDim(false); }, 2600));
  }
  function showIntro() {
    if (!tip || tipDone()) return;
    if (!mockReached()) showDim();
    showTip();
  }
  if (tip) {
    tip.querySelector('.try-tip-x').addEventListener('click', hideTip);
    var menuBtn = document.getElementById('menu-btn');
    if (menuBtn) menuBtn.addEventListener('click', hideTip);
    window.addEventListener('scroll', function () { if (tipOpen && mockReached()) hideTip(); }, { passive: true });
    window.addEventListener('resize', function () { if (tipOpen) placeTip(); });
    window.addEventListener('resize', function () { hideDim(true); });
    if (!tipDone()) setTimeout(showIntro, 1000);
  }
  var urlEl = root.querySelector('.mk-url-t');
  var URLS = { list: 'list', weekly: 'deadlines', follow: 'mail', rep: 'members', notice: 'notices' };

  function pageSize() { return small.matches ? (tiny.matches && has('field') ? 3 : 4) : 5; }

  // ダミーデータ(すべて架空)。due は次の期限、dm は期限の月、wk は今週の期限か、miss は書類未着、kt は契約の形
  var DATA = [
    { n: 'A社', r: 'A', s: '書類待ち', due: '定例報告 12/10', dm: 12, wk: 1, miss: 1, d: '11/27', g: 11, kt: '顧問契約', start: '2021/4', tel: '03-0000-0001', mail: 'info@a-sha.example',
      memo: '資料は月末にまとめて届く。',
      act: [['11/27', '資料のお願いメール', '12月の定例報告に向けて、資料の送付をお願い'], ['11/20', '定例面談', '今月の状況と、次の定例報告の予定を確認'], ['10/31', '書類受領', '10月分の資料をまとめて受領']] },
    { n: 'B社', r: 'B', s: '作成・確認中', due: '届出書類 12/15', dm: 12, wk: 0, miss: 0, d: '12/05', g: 3, kt: '顧問契約', start: '2019/10', tel: '03-0000-0002', mail: 'info@b-sha.example',
      memo: '届出書類の内容を、来週の定例面談で確認する。',
      act: [['12/05', '書類受領', '届出書類の作成に必要な資料を受領'], ['11/28', '資料のお願いメール', '届出書類に必要な資料の一覧を送付'], ['11/18', '定例面談', '届出書類の準備について打ち合わせ']] },
    { n: 'C社', r: 'A', s: '依頼受付', due: '申請書類 1/15', dm: 1, wk: 0, miss: 0, d: '11/21', g: 17, kt: 'ご相談中', start: '-', tel: '03-0000-0003', mail: 'info@c-sha.example',
      memo: '申請書類の準備は年明けから始めたいとのこと。',
      act: [['11/21', 'ご相談', '申請書類の準備は年明けから始めたいとのこと'], ['11/12', 'お問い合わせ', 'Webサイトのフォームから']] },
    { n: 'D社', r: 'C', s: '提出済み', due: '定例報告 1/10', dm: 1, wk: 0, miss: 0, d: '12/05', g: 3, kt: '顧問契約', start: '2020/7', tel: '03-0000-0004', mail: 'info@d-sha.example',
      memo: '次回の定例報告の資料は、年末までに届く予定。',
      act: [['12/05', '定例面談', '提出済みの定例報告の内容を説明'], ['11/28', '書類受領', '定例報告に必要な資料を受領'], ['11/14', '資料のお願いメール', '定例報告に向けて、資料の送付をお願い']] },
    { n: 'E社', r: 'B', s: '書類待ち', due: '届出書類 12/12', dm: 12, wk: 1, miss: 1, d: '11/24', g: 14, kt: 'スポット', start: '-', tel: '03-0000-0005', mail: 'info@e-sha.example',
      memo: '必要な書類は11月中に届く予定だった。',
      act: [['11/24', '資料のお願いメール', '届出書類に必要な書類の一覧を送付'], ['11/17', 'ご依頼', '届出書類の作成のご依頼']] },
    { n: 'F社', r: 'C', s: '作成・確認中', due: '申請書類 12/20', dm: 12, wk: 0, miss: 0, d: '12/03', g: 5, kt: '顧問契約', start: '2022/1', tel: '03-0000-0006', mail: 'info@f-sha.example',
      memo: '申請書類の下書きを、今週中に確認してもらう。',
      act: [['12/03', '書類受領', '申請書類に必要な資料を受領'], ['11/25', '定例面談', '申請書類の進め方を確認'], ['11/10', '資料のお願いメール', '必要な資料の一覧を送付']] },
    { n: 'G社', r: 'A', s: '依頼受付', due: '契約更新 1/31', dm: 1, wk: 0, miss: 0, d: '12/06', g: 2, kt: '顧問契約', start: '2023/2', tel: '03-0000-0007', mail: 'info@g-sha.example',
      memo: '契約更新の書類を、1月の定例面談で渡す。',
      act: [['12/06', '定例面談', '契約更新の時期と進め方を確認'], ['11/08', '書類受領', '10月分の資料を受領']] },
    { n: 'H社', r: 'B', s: '依頼受付', due: '申請書類 1/20', dm: 1, wk: 0, miss: 0, d: '11/17', g: 21, kt: 'ご相談中', start: '-', tel: '03-0000-0008', mail: 'info@h-sha.example',
      memo: '所内で検討してから、改めて連絡をくださるとのこと。',
      act: [['11/17', 'ご相談', '所内で検討してから、改めて連絡するとのこと'], ['11/06', 'ご紹介', '取引先からのご紹介']] }
  ];
  var STAGES = ['依頼受付', '書類待ち', '作成・確認中', '提出済み'];
  var ST = { '依頼受付': 's-lead', '書類待ち': 's-deal', '作成・確認中': 's-prop', '提出済み': 's-won' };
  var SOURCES = ['顧問契約', 'スポット', 'ご相談中'];
  // 今後6週の [週, 期限の件数, 完了の件数]
  var WEEKS = [['12/8', 3, 1], ['12/15', 2, 0], ['12/22', 1, 0], ['12/29', 0, 0], ['1/5', 2, 0], ['1/12', 2, 0]];
  var MAILS = {
    'A社': { t: '12月の定例報告に必要な資料のお願い', b: ['いつもお世話になっております。', '<mark>資料は月末にまとめてお送りいただいている</mark>と伺っておりますが、12月10日の定例報告に向けて、今月分の資料をお送りいただけますでしょうか。', '一部だけでも先にお送りいただければ、作成を進めておきます。'] },
    'C社': { t: '先日のご相談の件', b: ['11月21日はご相談のお時間をいただき、ありがとうございました。', '<mark>申請書類の準備は年明けから始めたい</mark>とのお話でしたので、必要な書類の一覧をまとめました。', 'ご不明な点があれば、短いお打ち合わせでもご説明します。'] },
    'E社': { t: '届出書類の作成に必要な書類のお願い', b: ['先日はご依頼をいただき、ありがとうございました。', '12月12日の届出に向けて、<mark>11月中にお送りいただく予定だった書類</mark>が、まだ届いていないようです。', 'お手数ですが、ご準備の状況を教えていただけますでしょうか。'] },
    'H社': { t: 'ご相談いただいた件のその後', b: ['11月17日はご相談をいただき、ありがとうございました。', '<mark>所内で検討してから改めてご連絡いただける</mark>とのことでしたが、その後いかがでしょうか。', '気になる点があれば、お電話でもお答えします。'] }
  };

  var R1 = [
    { k: 'drill', q: '「今月の期限」を押したら、該当する顧問先を見たい', a: 'ダッシュボードの数字を押せるようにしました。「今月の期限」を押すと、今月が期限の顧問先4件の一覧が出ます。ほかの数字も、押すと関連する顧問先の一覧が出ます。一覧の顧問先名を押すと、その顧問先の詳細も見られます。', done: 'ダッシュボードの数字から顧問先の一覧へ' },
    { k: 'weekly', q: 'この先の期限を、週ごとに見通したい', a: '「期限の見通し」を追加しました。今後6週の期限の件数と、そのうち完了した件数を、週ごとに並べています。', done: '期限の見通し' },
    { k: 'follow', q: '書類が届かない先や止まっている先に、メールの下書きがほしい', a: '「連絡メール」を追加しました。書類が届いていない顧問先2件と、ご相談のあと14日以上連絡がない見込み先2件に、前回の記録をふまえた下書きを用意しています。送るかどうかは、確認してから決めてください。', done: '連絡メールの下書き' }
  ];
  var R2 = [
    { k: 'rep', q: '担当者ごとの数字を並べて見たい', a: '「担当者別」を追加しました。受け持ちの件数と、今月の期限・要フォローの件数を、担当者ごとに並べています。', done: '担当者別の集計' },
    { k: 'notice', q: '毎朝、今日やることをチャットで知らせてほしい', a: '「毎朝の通知」を追加しました。毎朝8時に、こんな内容を事務所のチャットに届けます。', done: '毎朝の通知' },
    { k: 'field', q: '「契約の形」の項目を足したい', a: '顧問先一覧に「契約の形」を足しました。契約の形で絞り込むこともできます。', done: '契約の形の項目' }
  ];
  var TABS = { list: '顧問先', weekly: '期限の見通し', follow: '連絡メール', rep: '担当者別', notice: '毎朝の通知' };
  var TAB_OF = { drill: 'list', weekly: 'weekly', follow: 'follow', rep: 'rep', notice: 'notice', field: 'list' };

  var st, timers = [], busy = false;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function has(k) { return st.features.indexOf(k) !== -1; }
  function wait(ms, fn) { timers.push(setTimeout(fn, reduce ? Math.min(ms, 150) : ms)); }
  function isStale(c) { return c.s !== '提出済み' && (c.miss || c.g >= 14); }
  function active() { return DATA.filter(function (c) { return c.s !== '提出済み' && c.kt !== 'ご相談中'; }); }
  function month() { return DATA.filter(function (c) { return c.s !== '提出済み' && c.dm === 12; }).sort(function (x, y) { return dueDay(x) - dueDay(y); }); }
  function stale() { return DATA.filter(isStale); }
  function dueDay(c) { var p = c.due.split(' ')[1].split('/'); return (+p[0] < 12 ? 100 : 0) + (+p[1]); }
  function staleNote(c) { return c.miss ? '書類未着' : c.g + '日 連絡なし'; }
  function find(n) { return DATA.filter(function (c) { return c.n === n; })[0]; }
  function badge(s) { return '<span class="ap-badge ' + ST[s] + '">' + s + '</span>'; }
  var CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1E2A4A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';
  var ARROW = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>';
  // 自作アイコン(人・グラフ・メール・人ふたり・ベル)
  var IC = {
    list: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.2-7 8-7s7 2.5 8 7"/>',
    weekly: '<path d="M4 20V10M10 20V4M16 20v-7M2 20h20"/>',
    follow: '<path d="M3 6h18v12H3zM3 7l9 6 9-6"/>',
    rep: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.3-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.5 3.5 5.2"/>',
    notice: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9M10 20a2 2 0 0 0 4 0"/>'
  };
  function svg(k, s) { return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[k] + '</svg>'; }
  function panel(title, sub, body, extra) {
    return '<section class="ap-panel"><div class="ap-panel-h"><div class="ap-panel-t"><span class="ap-panel-title">' + title + '</span>' + (sub ? '<span class="ap-panel-sub">' + sub + '</span>' : '') + '</div>' + (extra || '') + '</div>' + body + '</section>';
  }

  // ---------- スプレッドシート ----------
  function sheetHtml() {
    var h = '<div class="mk-fx"><b>fx</b><span>顧問先名</span></div>' +
      '<table class="mk-sheet"><colgroup><col class="mk-rn"><col class="c1"><col class="c2"><col class="c3"><col class="c4"><col class="c5"></colgroup>' +
      '<tr class="mk-col"><th></th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th></tr>' +
      '<tr class="mk-hd"><td class="mk-rn">1</td><td>顧問先名</td><td>担当</td><td>進み具合</td><td>次の期限</td><td>最終連絡日</td></tr>';
    DATA.forEach(function (c, i) {
      h += '<tr><td class="mk-rn">' + (i + 2) + '</td><td>' + c.n + '</td><td>' + c.r + '</td><td>' + c.s + '</td><td>' + c.due + '</td><td class="mk-num">' + c.d + '</td></tr>';
    });
    h += '<tr><td class="mk-rn">10</td><td></td><td></td><td></td><td></td><td></td></tr></table>';
    return h;
  }

  // ---------- ツール ----------
  function shellHtml(title, body) {
    var keys = ['list'];
    st.features.forEach(function (f) { var t = TAB_OF[f]; if (keys.indexOf(t) === -1) keys.push(t); });
    var newest = st.features.length ? TAB_OF[st.features[st.features.length - 1]] : '';
    return '<div class="ap">' +
      '<nav class="ap-side" aria-label="ツールのメニュー"><div class="ap-brand">顧問先管理<span>事務所用</span></div><div class="ap-menu">' + keys.map(function (k) {
        var on = st.tab === k;
        return '<button type="button" class="ap-item" data-view="' + k + '" aria-pressed="' + on + '" aria-label="' + TABS[k] + '" title="' + TABS[k] + '">' + svg(k, 16) + '<span class="ap-item-l">' + TABS[k] + '</span>' + (k === newest && k !== 'list' ? '<span class="mk-new">NEW</span>' : '') + '</button>';
      }).join('') + '</div></nav>' +
      '<div class="ap-main"><div class="ap-head"><span class="ap-title">' + title + '</span><span class="ap-date">12/8 時点</span></div>' +
      '<div class="ap-body">' + body + '</div></div></div>';
  }

  function tilesHtml() {
    var tiles = [
      ['active', '進行中の手続き', active().length + '<small>件</small>', ''],
      ['month', '今月の期限', month().length + '<small>件</small>', ''],
      ['stale', '要フォロー', stale().length + '<small>件</small>', ' is-alert']
    ];
    var drill = has('drill');
    return '<div class="ap-tiles">' + tiles.map(function (t) {
      var inner = '<span class="ap-tile-k">' + t[1] + '</span><span class="ap-tile-v">' + t[2] + '</span>';
      if (!drill) return '<div class="ap-tile' + t[3] + '">' + inner + '</div>';
      var on = st.filter === t[0];
      return '<button type="button" class="ap-tile is-ready' + t[3] + (t[0] === 'month' ? ' is-first' : '') + (on ? ' is-on' : '') + '" data-kpi="' + t[0] + '" aria-pressed="' + on + '">' + inner + '<span class="ap-tile-link">押すと顧問先一覧</span></button>';
    }).join('') + '</div>';
  }

  function listRows() {
    var rows = DATA.slice(), view = 'すべての顧問先';
    if (st.filter === 'active') { rows = active(); view = '進行中の手続き'; }
    if (st.filter === 'month') { rows = month(); view = '今月の期限(期限の近い順)'; }
    if (st.filter === 'stale') { rows = stale(); view = '要フォロー(書類未着・14日以上連絡なし)'; }
    if (has('field') && st.src) rows = rows.filter(function (c) { return c.kt === st.src; });
    return { rows: rows, view: view };
  }

  function listHtml() {
    var lr = listRows(), rows = lr.rows, field = has('field'), open = has('drill');
    var PAGE = pageSize();
    var pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (st.page > pages) st.page = pages;
    var from = (st.page - 1) * PAGE, shown = rows.slice(from, from + PAGE);
    var extra = st.filter ? '<button type="button" class="ap-btn" data-clear="1">すべて表示</button>' : '';
    var h = '<div class="ap-meta">' + rows.length + '件' + (field && st.src ? '・契約の形:' + st.src : '') + (open ? '・顧問先名を押すと詳細を表示' : '') + '</div>';
    if (field) {
      h += '<div class="ap-chips">' + [''].concat(SOURCES).map(function (s) {
        return '<button type="button" class="ap-chip" data-src="' + s + '" aria-pressed="' + (st.src === s) + '">' + (s ? s : 'すべて') + '</button>';
      }).join('') + '</div>';
    }
    h += '<table class="ap-table' + (open ? ' is-open' : '') + (field ? ' has-ls' : '') + '"><thead><tr><th class="c-name">顧問先名</th><th class="c-rep">担当</th><th class="c-st">進み具合</th><th class="c-amt">次の期限</th><th class="c-date">最終連絡日</th>' + (field ? '<th class="c-ls">契約の形</th>' : '') + '</tr></thead><tbody>' +
      shown.map(function (c) {
        var name = open ? '<button type="button" class="ap-link" data-open="' + c.n + '">' + c.n + '</button>' : '<span class="ap-name">' + c.n + '</span>';
        return '<tr' + (open ? ' data-open="' + c.n + '"' : '') + '><td class="c-name">' + name + '</td><td class="c-rep">担当' + c.r + '</td><td class="c-st">' + badge(c.s) + '</td><td class="c-amt">' + c.due + '</td>' +
          '<td class="c-date">' + c.d + (isStale(c) ? '<span class="ap-warn">' + (c.miss ? '未着' : c.g + '日') + '</span>' : '') + '</td>' + (field ? '<td class="c-ls">' + c.kt + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table>';
    if (!rows.length) h += '<p class="ap-empty">該当する顧問先はいません。</p>';
    h += '<div class="ap-pager"><span>' + (rows.length ? (from + 1) + '-' + (from + shown.length) : 0) + ' / ' + rows.length + '件</span>' +
      '<button type="button" class="ap-btn" data-page="-1"' + (st.page <= 1 ? ' disabled' : '') + '>‹ 前へ</button>' +
      '<button type="button" class="ap-btn" data-page="1"' + (st.page >= pages ? ' disabled' : '') + '>次へ ›</button></div>';
    return tilesHtml() + panel(lr.view, '顧問先一覧', h, extra);
  }

  function detailHtml() {
    var c = find(st.detail), field = has('field');
    var idx = STAGES.indexOf(c.s), won = c.s === '提出済み';
    var steps = '<ol class="ap-steps">' + STAGES.map(function (s, i) {
      var cls = won || i < idx ? 'is-done' : (i === idx ? 'is-cur' : '');
      return '<li class="' + cls + '"' + (i === idx ? ' aria-current="step"' : '') + '><span class="ap-step-dot" aria-hidden="true">' + (cls === 'is-done' ? '✓' : i + 1) + '</span><span class="ap-step-l">' + s + '</span></li>';
    }).join('') + '</ol>';
    var fields = [['担当', '担当' + c.r], ['顧問開始', c.start], ['次の期限', c.due + (isStale(c) ? '<span class="ap-warn">' + staleNote(c) + '</span>' : '')], ['電話', '<span class="ap-nw">' + c.tel + '</span>'], ['メール', c.mail]];
    if (field) fields.push(['契約の形', c.kt]);
    return '<button type="button" class="ap-back" data-back="1">‹ 一覧に戻る</button>' +
      '<section class="ap-panel ap-rec"><div class="ap-rec-top"><span class="ap-rec-name">' + c.n + '</span>' + badge(c.s) + '</div>' + steps + '</section>' +
      '<div class="ap-2col">' +
      '<section class="ap-panel"><div class="ap-sec">基本情報</div><dl class="ap-fields">' + fields.map(function (f) { return '<div><dt>' + f[0] + '</dt><dd>' + f[1] + '</dd></div>'; }).join('') +
      '<div class="is-wide"><dt>メモ</dt><dd>' + c.memo + '</dd></div></dl></section>' +
      '<section class="ap-panel"><div class="ap-sec">活動履歴</div><ul class="ap-acts">' + c.act.map(function (a) {
        return '<li><span class="ap-act-date">' + a[0] + '</span><div><b>' + a[1] + '</b><div class="ap-act-n">' + a[2] + '</div></div></li>';
      }).join('') + '</ul></section></div>';
  }

  function weeklyHtml() {
    var max = 4;
    var body = '<div class="mk-legend"><span><i class="c1"></i>期限</span><span><i class="c2"></i>完了</span></div>' +
      '<div class="mk-chart" role="img" aria-label="今後6週の期限と完了の件数">' + WEEKS.map(function (w, i) {
        return '<div class="mk-wk"><div class="mk-b c1" style="height:' + Math.max(w[1] / max * 82, 1) + '%;animation-delay:' + (i * 60) + 'ms"><span>' + w[1] + '</span></div>' +
          '<div class="mk-b c2" style="height:' + Math.max(w[2] / max * 82, 1) + '%;animation-delay:' + (i * 60 + 30) + 'ms"><span>' + w[2] + '</span></div></div>';
      }).join('') + '</div>' +
      '<div class="mk-wk-labels">' + WEEKS.map(function (w, i) { return '<span' + (i === 0 ? ' class="is-now"' : '') + '>' + w[0] + '週</span>'; }).join('') + '</div>' +
      '<div class="mk-insight">期限がいちばん多いのは今週(3件)で、そのうち1件は完了しています。12/29の週は期限がありません。</div>';
    return panel('今後6週', '期限と完了の件数', body);
  }

  function followHtml() {
    var list = stale();
    if (!st.pick) st.pick = list[0].n;
    var m = MAILS[st.pick];
    var body = '<div class="mk-follow"><div class="mk-follow-list">' + list.map(function (c) {
      return '<button type="button" class="mk-pick" data-pick="' + c.n + '" aria-pressed="' + (st.pick === c.n) + '"><b>' + c.n + '</b>' + staleNote(c) + '</button>';
    }).join('') + '</div>' +
      '<div class="mk-mail"><div class="mk-mail-h">宛先:<b>' + st.pick + ' ご担当者様</b><br>件名:<b>' + m.t + '</b></div>' +
      m.b.map(function (p) { return '<p>' + p + '</p>'; }).join('') +
      '<div class="mk-mail-note">色付きの部分は、前回の記録から入れた内容です。送るかどうかと最後のひと言は、担当者が決めます。</div></div></div>';
    return panel('下書き ' + list.length + '件', '書類未着・14日以上連絡なし', body);
  }

  function repHtml() {
    var reps = ['A', 'B', 'C'].map(function (r) {
      var mine = DATA.filter(function (c) { return c.r === r; });
      return { r: r, n: mine.length, month: month().filter(function (c) { return c.r === r; }).length, stale: mine.filter(isStale).length };
    });
    var max = Math.max.apply(null, reps.map(function (x) { return x.n; }));
    var body = '<div class="mk-rep">' + reps.map(function (x, i) {
      return '<div class="mk-rep-row"><span class="mk-rep-name"><span class="mk-av">' + x.r + '</span>担当' + x.r + '</span>' +
        '<div class="mk-rep-track"><div class="mk-rep-bar" style="width:' + Math.max(x.n / max * 100, 30) + '%;animation-delay:' + (i * 80) + 'ms">' + x.n + '件</div></div>' +
        '<span class="mk-rep-sub">今月の期限' + x.month + '件・要フォロー' + x.stale + '件</span></div>';
    }).join('') + '</div>' +
      '<div class="mk-insight">今月の期限は担当Bに2件あります。要フォローは担当Aと担当Bに2件ずつです。</div>';
    return panel('受け持ち件数', '担当者ごと', body);
  }

  function noticeHtml() {
    var list = DATA.filter(function (c) { return isStale(c) || (c.wk && c.s !== '提出済み'); }).sort(function (x, y) { return (y.wk - x.wk) || (y.g - x.g); });
    var body = '<div class="mk-notice"><div class="mk-notice-head">事務所チャット ・ 毎朝 8:00</div><div class="mk-notice-msg"><span class="mk-ai">AI</span>' +
      '<div class="mk-notice-body">おはようございます。今日やることは' + list.length + '件です。<ul>' +
      list.map(function (c) {
        var p = [];
        if (c.wk) p.push('今週が期限(' + c.due + ')');
        if (c.miss) p.push('書類未着');
        if (c.g >= 14) p.push(c.g + '日連絡なし');
        return '<li>' + c.n + '(担当' + c.r + '):' + p.join('・') + '。連絡メールの下書きあり</li>';
      }).join('') +
      '</ul>今月の期限は、あと' + month().length + '件です。</div></div></div>';
    return panel('チャットの見本', '毎朝 8:00 に届く内容', body);
  }

  function render(animate) {
    var h;
    if (st.mode === 'sheet') {
      nameEl.textContent = '顧問先リスト - スプレッドシート';
      urlEl.textContent = 'sheets.example/list';
      screen.classList.remove('is-tool');
      h = sheetHtml();
    } else {
      nameEl.textContent = '顧問先管理(事務所用)';
      urlEl.textContent = 'office.example/' + URLS[st.tab] + (st.tab === 'list' && st.detail ? '/' + st.detail.charAt(0).toLowerCase() : '');
      screen.classList.add('is-tool');
      var detail = st.tab === 'list' && st.detail;
      var body = detail ? detailHtml() : ({ list: listHtml, weekly: weeklyHtml, follow: followHtml, rep: repHtml, notice: noticeHtml })[st.tab]();
      h = shellHtml(detail ? '顧問先の詳細' : TABS[st.tab], body);
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
    else if (d.back) { focusKey = '.ap-link[data-open="' + st.detail + '"],.ap-mrow[data-open="' + st.detail + '"]'; st.detail = ''; }
    else if (d.kpi) { st.filter = st.filter === d.kpi ? '' : d.kpi; st.page = 1; focusKey = '[data-kpi="' + d.kpi + '"]'; }
    else if (d.clear) { st.filter = ''; st.page = 1; focusKey = '[data-kpi]'; }
    else if (d.view) { st.tab = d.view; st.detail = ''; focusKey = '[data-view="' + d.view + '"]'; }
    else if (d.src !== undefined) { st.src = d.src; st.page = 1; focusKey = '[data-src="' + d.src + '"]'; }
    else if (d.page) { st.page += +d.page; focusKey = '[data-page="' + d.page + '"]:not([disabled]),[data-page]:not([disabled])'; }
    else if (d.pick) { st.pick = d.pick; focusKey = '[data-pick="' + d.pick + '"]'; }
    else return;
    render(false);
    var all = focusKey ? screen.querySelectorAll(focusKey) : [];
    for (var i = 0; i < all.length; i++) { if (all[i].offsetParent) { all[i].focus({ preventScroll: true }); break; } }
  });

  // ---------- チャット ----------
  var chatBox = root.querySelector('.mk-chat');
  // 選択肢欄に続きがあるとき、下端に「続きがある」表示を出す
  function updMore() { choicesEl.classList.toggle('is-more', choicesEl.scrollHeight - choicesEl.scrollTop - choicesEl.clientHeight > 4); }
  choicesEl.addEventListener('scroll', updMore, { passive: true });
  window.addEventListener('resize', updMore);
  // スマホ幅: チャットが画面に入ったら縦幅を広げる(幅の条件はCSS側。動きを減らす設定では最初から広げる)
  function openChat() { chatBox.classList.add('is-open'); }
  if (reduce || !('IntersectionObserver' in window)) openChat();
  else {
    var chatIo = new IntersectionObserver(function (ents) {
      for (var i = 0; i < ents.length; i++) {
        if (ents[i].isIntersecting) { openChat(); chatIo.disconnect(); return; }
      }
    }, { threshold: 0.5 });
    chatIo.observe(chatBox);
  }
  chatBox.addEventListener('transitionend', function (e) { if (e.target === chatBox) { scrollLog(); updMore(); } });
  function scrollLog() { log.scrollTop = log.scrollHeight; chatBox.scrollTop = chatBox.scrollHeight; }
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
    choicesEl.innerHTML = (q ? '<div class="mk-choices-q' + (items[0] && items[0].cls === 'is-primary' ? ' is-hint' : '') + '">' + q + '</div>' : '') + items.map(function (c, i) {
      return '<button type="button" class="mk-choice' + (c.cls ? ' ' + c.cls : '') + '" data-i="' + i + '" style="animation-delay:' + (i * 80) + 'ms">' + '<span>' + esc(c.label) + '</span>' + (c.cls ? '' : ARROW) + '</button>';
    }).join('');
    choicesEl._items = items;
    choicesEl.scrollTop = 0;
    scrollLog();
    updMore();
    timers.push(setTimeout(updMore, 450));
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
    updMore();
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
      var r = root.getBoundingClientRect();
      if (r.top < 0) root.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
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
    if (opt.k === 'drill' || opt.k === 'field') { st.filter = ''; st.src = ''; }
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
      addMsg('最初はただの表だった顧問先リストが、欲しい機能を伝えるたびに、事務所に合ったツールになっていきました。<ul class="mk-done">' +
        st.done.map(function (d) { return '<li>' + CHECK + '<span>' + esc(d) + '</span></li>'; }).join('') +
        '</ul>');
      wait(500, function () {
        addMsg('使いながら「ここをこうしたい」と思ったら、また話しかけてください。AIを使うと、こうして事務所専用の仕組みを少しずつ育てていけます。');
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
    addMsg('顧問先リストのスプレッドシートを開きました。まずは、見やすいツールの形にしてみましょうか?');
    setChoices([{ label: 'ツールにする', cls: 'is-primary', run: function (f) {
      resetS.hidden = false;
      build('このリストを、見やすいツールにして', 'ツールを作っています', function () {
        st.mode = 'tool';
        st.done.push('スプレッドシートをツールに');
      }, 'ツールにしました。画面の上の数字は、シートの内容から自動で集計しています。', round(R1, 1), f);
    } }], '下のボタンを押して、お試しください', focus);
  }

  resetS.addEventListener('click', function () { reset(true); });
  reset(false);
})();
