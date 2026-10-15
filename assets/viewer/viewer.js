/*
 * 資料ビューア: 資料の各ページ画像を縦に並べて表示する。
 * 表示する画像は、[data-viewer] 要素の属性で指定する。
 *   data-src   … 画像のフォルダ(末尾に / を付ける)。中身は p01.webp, p02.webp … の連番
 *   data-pages … ページ数
 *   data-alt   … 画像の代替テキストの先頭(例: 「紹介資料」→「紹介資料 1ページ目」)
 */
(function(){
  var root=document.querySelector('[data-viewer]');
  if(!root)return;
  var src=root.getAttribute('data-src')||'';
  var pages=parseInt(root.getAttribute('data-pages'),10)||0;
  var alt=root.getAttribute('data-alt')||'資料';
  var list=document.createElement('ol');
  list.className='dv-pages';
  for(var i=1;i<=pages;i++){
    var li=document.createElement('li');
    li.className='dv-page';
    var img=document.createElement('img');
    img.src=src+'p'+(i<10?'0':'')+i+'.webp';
    img.alt=alt+' '+i+'ページ目';
    img.width=1600;
    img.height=900;
    img.decoding='async';
    if(i>2)img.loading='lazy';
    li.appendChild(img);
    list.appendChild(li);
  }
  root.appendChild(list);
})();

/*
 * 無料相談ボタン: 資料を読み進めた人に、右下(スマホは画面下部)へ予約ボタンを出す。
 * 出るタイミングは下の設定値で変えられる(どちらか早い方で出る)。
 * ボタンの行き先と文言は、ページ内の相談パネルのボタン(.dv-cta-btn)と同じものを使う。
 */
(function(){
  var CONFIG={
    delaySeconds:30,   // ビューアを表示してから、この秒数が経ったら出す
    scrollRatio:0.5    // 資料のこの割合(0.5=50%)まで読み進めたら出す
  };

  var pages=document.querySelector('.dv-pages');
  var source=document.querySelector('.dv-cta-btn');
  if(!pages||!source)return;

  var MOBILE=window.matchMedia('(max-width:640px)');
  var shown=false,timer=null;

  var wrap=document.createElement('div');
  wrap.className='dv-float';
  wrap.hidden=true;

  var card=document.createElement('div');
  card.className='dv-float-card';
  var btn=source.cloneNode(true);
  btn.className='dv-float-btn';
  btn.removeAttribute('id');
  var close=document.createElement('button');
  close.type='button';
  close.className='dv-float-close';
  close.setAttribute('aria-label','閉じる');
  close.textContent='×';
  card.appendChild(btn);
  card.appendChild(close);

  var mini=document.createElement('button');
  mini.type='button';
  mini.className='dv-float-mini';
  mini.hidden=true;
  mini.setAttribute('aria-label','無料相談の予約ボタンを表示する');
  mini.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="2.5"></rect><path d="M3 9.5h18M8 2.5v4M16 2.5v4"></path></svg>';

  wrap.appendChild(card);
  wrap.appendChild(mini);
  document.body.appendChild(wrap);

  // スマホでは固定バーがページの最後を隠さないよう、ページ末尾の要素に同じ高さの余白を足す
  var tail=document.querySelector('body > footer')||document.querySelector('main');
  var basePad=tail?parseFloat(getComputedStyle(tail).paddingBottom)||0:0;
  function updateSpace(){
    if(!tail)return;
    if(!shown||!MOBILE.matches){tail.style.paddingBottom='';return;}
    // 出現アニメーション中でもずれないよう、位置ではなく高さ+下端からの距離で測る
    var h=wrap.offsetHeight+(parseFloat(getComputedStyle(wrap).bottom)||0);
    tail.style.paddingBottom=(basePad+h+8)+'px';
  }

  function setMini(on){
    card.hidden=on;
    mini.hidden=!on;
    wrap.classList.toggle('is-mini',on);
    updateSpace();
  }

  function show(){
    if(shown)return;
    shown=true;
    if(timer)clearTimeout(timer);
    window.removeEventListener('scroll',onScroll);
    wrap.hidden=false;
    wrap.classList.add('is-in');
    updateSpace();
  }

  function onScroll(){
    var r=pages.getBoundingClientRect();
    if(r.height<=0)return;
    var read=(window.innerHeight-r.top)/r.height;
    if(read>=CONFIG.scrollRatio)show();
  }

  close.addEventListener('click',function(){setMini(true);mini.focus();});
  mini.addEventListener('click',function(){setMini(false);btn.focus();});
  window.addEventListener('resize',updateSpace);
  if(MOBILE.addEventListener)MOBILE.addEventListener('change',updateSpace);

  timer=setTimeout(show,CONFIG.delaySeconds*1000);
  window.addEventListener('scroll',onScroll,{passive:true});
  onScroll();
})();
