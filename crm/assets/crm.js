(function () {
  // ---- お問い合わせのタブ切替 ----
  var tabs = document.querySelectorAll('.tab[data-tab]');
  var forms = document.querySelectorAll('.cform[data-panel]');
  function setTab(name) {
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-tab') === name;
      tabs[i].classList.toggle('is-active', on);
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    for (var j = 0; j < forms.length; j++) {
      forms[j].hidden = forms[j].getAttribute('data-panel') !== name;
    }
  }
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function () { setTab(this.getAttribute('data-tab')); });
  }

  // ---- スマホのメニュー ----
  var menuBtn = document.getElementById('menu-btn');
  var spNav = document.getElementById('sp-nav');
  function setMenu(open) {
    if (!menuBtn || !spNav) return;
    spNav.hidden = !open;
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.classList.toggle('is-open', open);
  }
  if (menuBtn && spNav) {
    menuBtn.addEventListener('click', function () { setMenu(spNav.hidden); });
    var spLinks = spNav.querySelectorAll('a');
    for (var m = 0; m < spLinks.length; m++) spLinks[m].addEventListener('click', function () { setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  }

  // ---- 「資料を見る」「問い合わせ」: お問い合わせ欄へスクロールしてタブを選ぶ ----
  var contact = document.getElementById('contact');
  var headerInner = document.querySelector('.header-inner');
  var gos = document.querySelectorAll('[data-go]');
  for (var k = 0; k < gos.length; k++) {
    gos[k].addEventListener('click', function (e) {
      e.preventDefault();
      setTab(this.getAttribute('data-go'));
      if (contact) window.scrollTo({ top: contact.getBoundingClientRect().top + window.scrollY - (headerInner ? headerInner.offsetHeight : 72), behavior: 'smooth' });
    });
  }

  // ---- 下部固定バー: ヒーローを過ぎたら表示、お問い合わせ欄が見えている間は隠す ----
  var bar = document.getElementById('fbar');
  var hero = document.getElementById('hero');
  function onScroll() {
    if (!bar) return;
    var past = hero ? hero.getBoundingClientRect().bottom < 0 : window.scrollY > 600;
    var inContact = false;
    if (contact) {
      var r = contact.getBoundingClientRect();
      inContact = r.top < window.innerHeight && r.bottom > 0;
    }
    bar.classList.toggle('is-show', past && !inContact);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  // ---- 費用の簡易試算 ----
  var seats = document.getElementById('sim-seats');
  var price = document.getElementById('sim-price');
  function fmt(n) { return Math.round(n).toLocaleString('ja-JP'); }
  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }
  function calc() {
    if (!seats || !price) return;
    var s = +seats.value, p = +price.value;
    var nowY = s * p * 12 / 10000;
    var save = Math.max(0, nowY - 18);
    setText('sim-seats-v', String(s));
    setText('sim-price-v', p.toLocaleString('ja-JP'));
    setText('sim-now', fmt(nowY));
    setText('sim-save', fmt(save));
    setText('sim-save3', fmt(save * 3));
  }
  if (seats) seats.addEventListener('input', calc);
  if (price) price.addEventListener('input', calc);
  calc();
})();
