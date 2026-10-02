(function () {
  var menuBtn = document.getElementById('menu-btn');
  var navMobile = document.getElementById('nav-mobile');

  function setMenu(open) {
    navMobile.hidden = !open;
  }

  menuBtn.addEventListener('click', function () {
    setMenu(navMobile.hidden);
  });

  navMobile.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () { setMenu(false); });
  });

  window.addEventListener('resize', function () {
    if (window.innerWidth >= 860) setMenu(false);
  });

  var tabs = document.querySelectorAll('.tab');
  var panels = document.querySelectorAll('.contact-form');

  function setTab(name) {
    tabs.forEach(function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-tab') === name);
    });
    panels.forEach(function (p) {
      p.hidden = p.getAttribute('data-panel') !== name;
    });
  }

  document.querySelectorAll('[data-tab]').forEach(function (el) {
    el.addEventListener('click', function () {
      setTab(el.getAttribute('data-tab'));
    });
  });

  var fixedCta = document.querySelector('.fixed-cta');
  var heroBtns = document.querySelector('.hero-btns');

  if (fixedCta && heroBtns && 'IntersectionObserver' in window) {
    fixedCta.classList.add('is-hidden');
    new IntersectionObserver(function (entries) {
      fixedCta.classList.toggle('is-hidden', entries[entries.length - 1].isIntersecting);
    }).observe(heroBtns);
  }
})();

(function () {
  var upcomingWrap = document.getElementById('sem-upcoming-wrap');
  var upcomingList = document.getElementById('sem-upcoming-list');
  var pastList = document.getElementById('sem-past-list');
  if (!upcomingWrap || !upcomingList || !pastList) return;

  var WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function formatDate(dateStr) {
    var parts = dateStr.split('-').map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    return parts[0] + '/' + parts[1] + '/' + parts[2] + '(' + WEEKDAYS[d.getDay()] + ')';
  }

  function byOrder(a, b) {
    if (!!a.shigyo !== !!b.shigyo) return a.shigyo ? -1 : 1;
    if (a.date === b.date) return 0;
    return a.date < b.date ? 1 : -1;
  }

  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text) e.textContent = text;
    return e;
  }

  function cardLink(className, item) {
    var a = el('a', 'card ' + className);
    a.href = item.link;
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
  }

  function thumb(className, item) {
    var wrap = el('div', className);
    var img = document.createElement('img');
    img.src = item.thumbnail;
    img.alt = item.title + 'の告知画像';
    img.loading = 'lazy';
    wrap.appendChild(img);
    return wrap;
  }

  function buildUpcomingCard(item) {
    var a = cardLink('sem-card-upcoming', item);
    a.appendChild(thumb('sem-card-upcoming-thumb', item));
    var body = el('div', 'sem-card-upcoming-body');
    var top = el('div', 'sem-card-upcoming-top');
    top.appendChild(el('span', 'sem-pill-upcoming', '開催予定'));
    if (item.shigyo) top.appendChild(el('span', 'sem-shigyo-label', '士業向け'));
    top.appendChild(el('span', 'sem-meta', 'オンライン開催・' + formatDate(item.date)));
    body.appendChild(top);
    body.appendChild(el('h4', 'sem-card-upcoming-title', item.title));
    body.appendChild(el('p', 'sem-card-upcoming-summary', item.summary));
    var foot = el('div', 'sem-card-upcoming-foot');
    var btn = el('span', 'btn-grad');
    btn.innerHTML = '申し込む<span aria-hidden="true">→</span>';
    foot.appendChild(btn);
    body.appendChild(foot);
    a.appendChild(body);
    return a;
  }

  function buildPastCard(item) {
    var a = cardLink('sem-past-card', item);
    a.appendChild(thumb('sem-past-thumb', item));
    var body = el('div', 'sem-past-body');
    var labels = el('div', 'sem-labels');
    labels.appendChild(el('span', 'sem-past-label', 'PAST EVENT'));
    if (item.shigyo) labels.appendChild(el('span', 'sem-shigyo-label', '士業向け'));
    body.appendChild(labels);
    body.appendChild(el('p', 'sem-past-title', item.title));
    body.appendChild(el('p', 'sem-past-date', formatDate(item.date)));
    a.appendChild(body);
    return a;
  }

  fetch('data/seminars.json')
    .then(function (res) { return res.json(); })
    .then(function (items) {
      var today = todayStr();
      var upcoming = items.filter(function (i) { return i.date >= today; }).sort(byOrder);
      var past = items.filter(function (i) { return i.date < today; }).sort(byOrder);
      if (upcoming.length) {
        upcoming.forEach(function (item) { upcomingList.appendChild(buildUpcomingCard(item)); });
        upcomingWrap.hidden = false;
      }
      past.forEach(function (item) { pastList.appendChild(buildPastCard(item)); });
    })
    .catch(function () {});
})();
