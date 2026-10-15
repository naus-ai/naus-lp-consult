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
 *  1. 表示から delaySeconds 秒 または 資料の scrollRatio まで読んだら(早い方)、小さな予約ボタンを出す
 *  2. LPごとに指定したページ(expandAfterPages)をすべて過ぎたら、ボタンが広がってカードになる
 *     カードにはフォームで入力済みの氏名・会社名・メールアドレスを表示する(このタブ内の保存値。無ければ出さない)
 * ×で閉じるとアイコンとして残り、アイコンを押すと閉じる前の形に戻る。
 * 予約ボタンの行き先は、ページ内の相談パネルのボタン(.dv-cta-btn)と同じものを使う。
 */
(function(){
  var CONFIG={
    delaySeconds:30,   // ビューアを表示してから、この秒数が経ったら出す
    scrollRatio:0.5,   // 資料のこの割合(0.5=50%)まで読み進めたら出す
    // LPごとの設定(キーは各サンクスページの data-viewer の値)
    // expandAfterPages: このページ番号をすべて過ぎたら(ページの下端が画面の上端より上に出たら)カードに広げる
    lp:{
      consult:{expandAfterPages:[19,21],companyLabel:'会社名'},  // 19=支援パッケージの違い / 21=よくある質問
      shigyo:{expandAfterPages:[20,23],companyLabel:'事務所名'}   // 20=支援パッケージの違い / 23=よくある質問
    }
  };

  var root=document.querySelector('[data-viewer]');
  var pages=document.querySelector('.dv-pages');
  var source=document.querySelector('.dv-cta-btn');
  if(!root||!pages||!source)return;
  var LP=CONFIG.lp[root.getAttribute('data-viewer')]||null;

  var MOBILE=window.matchMedia('(max-width:640px)');
  var shown=false,expanded=false,minimized=false,timer=null;

  function el(tag,cls,text){
    var e=document.createElement(tag);
    if(cls)e.className=cls;
    if(text!=null)e.textContent=text;
    return e;
  }
  function closeButton(){
    var b=el('button','dv-float-close','×');
    b.type='button';
    b.setAttribute('aria-label','閉じる');
    return b;
  }

  var wrap=el('div','dv-float');
  wrap.hidden=true;

  // 小さな予約ボタン
  var card=el('div','dv-float-card');
  var btn=source.cloneNode(true);
  btn.className='dv-float-btn';
  btn.removeAttribute('id');
  var close=closeButton();
  card.appendChild(btn);
  card.appendChild(close);

  // 広がったカード
  var panel=el('div','dv-float-panel');
  panel.hidden=true;
  panel.setAttribute('role','region');
  panel.setAttribute('aria-labelledby','dv-float-panel-title');
  var titleSrc=document.getElementById('dv-cta-title');
  var title=el('p','dv-float-panel-title',titleSrc?titleSrc.textContent:'');
  title.id='dv-float-panel-title';
  panel.appendChild(title);
  var lead=null;
  try{lead=JSON.parse(sessionStorage.getItem('naus_lead')||'null');}catch(err){lead=null;}
  var rows=[];
  if(lead){
    if(lead.name)rows.push(['氏名',lead.name]);
    if(lead.company)rows.push([LP?LP.companyLabel:'会社名',lead.company]);
    if(lead.email)rows.push(['メールアドレス',lead.email]);
  }
  if(rows.length){
    panel.appendChild(el('p','dv-float-panel-note','ご入力いただいた内容'));
    var dl=el('dl','dv-float-panel-info');
    rows.forEach(function(r){
      var row=el('div','dv-float-panel-row');
      row.appendChild(el('dt',null,r[0]));
      row.appendChild(el('dd',null,r[1]));
      dl.appendChild(row);
    });
    panel.appendChild(dl);
  }
  var pick=el('a','dv-float-panel-btn','日程を選ぶ(30秒で完了)');
  pick.href=source.getAttribute('href');
  pick.target='_blank';
  pick.rel='noopener';
  panel.appendChild(pick);
  var closePanel=closeButton();
  panel.appendChild(closePanel);

  // 閉じた後のアイコン
  var mini=el('button','dv-float-mini');
  mini.type='button';
  mini.hidden=true;
  mini.setAttribute('aria-label','無料相談の予約ボタンを表示する');
  mini.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="2.5"></rect><path d="M3 9.5h18M8 2.5v4M16 2.5v4"></path></svg>';

  wrap.appendChild(card);
  wrap.appendChild(panel);
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

  // 表示状態を1か所で切り替える(小さなボタン / カード / アイコン)
  function render(){
    card.hidden=minimized||expanded;
    panel.hidden=minimized||!expanded;
    mini.hidden=!minimized;
    wrap.classList.toggle('is-mini',minimized);
    wrap.classList.toggle('is-expanded',expanded&&!minimized);
    updateSpace();
  }

  function show(){
    if(shown)return;
    shown=true;
    if(timer)clearTimeout(timer);
    wrap.hidden=false;
    wrap.classList.add('is-in');
    render();
  }

  function expand(){
    if(expanded)return;
    show();
    expanded=true;
    // 閉じてアイコンにしている人には、勝手に広げない(アイコンから戻したときにカードで出る)
    if(!minimized){
      wrap.classList.remove('is-in');
      wrap.classList.add('is-grow');
    }
    render();
  }

  // 指定ページの下端が画面の上端を越えたら「過ぎた」とみなす
  function passedAll(){
    if(!LP||!LP.expandAfterPages.length)return false;
    var items=pages.children;
    for(var i=0;i<LP.expandAfterPages.length;i++){
      var page=items[LP.expandAfterPages[i]-1];
      if(!page)return false;
      if(page.getBoundingClientRect().bottom>0)return false;
    }
    return true;
  }

  function onScroll(){
    var r=pages.getBoundingClientRect();
    if(r.height<=0)return;
    if(!shown&&(window.innerHeight-r.top)/r.height>=CONFIG.scrollRatio)show();
    if(!expanded&&passedAll())expand();
    if(shown&&expanded)window.removeEventListener('scroll',onScroll);
  }

  close.addEventListener('click',function(){minimized=true;render();mini.focus();});
  closePanel.addEventListener('click',function(){minimized=true;render();mini.focus();});
  mini.addEventListener('click',function(){
    minimized=false;
    render();
    (expanded?pick:btn).focus();
  });
  window.addEventListener('resize',updateSpace);
  if(MOBILE.addEventListener)MOBILE.addEventListener('change',updateSpace);

  timer=setTimeout(show,CONFIG.delaySeconds*1000);
  window.addEventListener('scroll',onScroll,{passive:true});
  onScroll();
})();
