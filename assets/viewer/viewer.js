// 計測: GTMへ送るイベント(dataLayer)。個人情報は載せない
function nausTrack(event,params){
  try{
    var p=location.pathname;
    var d={event:event,lp_type:p.indexOf('/shigyo')===0?'shigyo':'consult',
      page_type:/contact-thanks/.test(p)?'contact_thanks':/\/thanks/.test(p)?'thanks':/\/document/.test(p)?'document':'lp'};
    if(params)for(var k in params)d[k]=params[k];
    (window.dataLayer=window.dataLayer||[]).push(d);
  }catch(e){}
}

/*
 * 資料ビューア: 資料の各ページ画像を縦に並べて表示する。
 * 表示する画像は、[data-viewer] 要素の属性で指定する。
 *   data-src   … 画像のフォルダ(末尾に / を付ける)。中身は p01.webp, p02.webp … の連番
 *   data-pages … ページ数
 *   data-alt   … 画像の代替テキストの先頭(例: 「紹介資料」→「紹介資料 1ページ目」)
 * 資料の中の予約リンク(PDFではリンクになっている部分)は、画像の上に押せる範囲を重ねて再現する。
 */
(function(){
  // 画像の上に重ねる「押せる範囲」。位置はPDFのリンクの座標から計算した、ページに対する割合(%)
  // 押すと、ページ内の相談パネルのボタンと同じ行き先(=ページ内の予約画面)を開く
  var LINKS={
    consult:[{page:22,left:50.52,top:68.84,width:31.51,height:6.39,label:'無料相談の予約画面を開く'}],
    shigyo:[{page:24,left:50.52,top:68.84,width:31.51,height:6.39,label:'無料相談の予約画面を開く'}]
  };
  var root=document.querySelector('[data-viewer]');
  if(!root)return;
  var links=LINKS[root.getAttribute('data-viewer')]||[];
  var ctaSrc=document.querySelector('.dv-cta-btn');
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
    links.forEach(function(l){
      if(l.page!==i||!ctaSrc)return;
      var a=document.createElement('a');
      a.className='dv-hotspot';
      a.href=ctaSrc.getAttribute('href');
      a.target='_blank';
      a.rel='noopener';
      a.setAttribute('aria-label',l.label);
      a.style.left=l.left+'%';
      a.style.top=l.top+'%';
      a.style.width=l.width+'%';
      a.style.height=l.height+'%';
      li.appendChild(a);
    });
    list.appendChild(li);
  }
  root.appendChild(list);
  nausTrack('viewer_open',{page_count:pages});

  // 読み進み: 資料の50%(画面の下端が資料全体の半分に届いた)/最後のページの下端まで表示
  var sent50=false,sentEnd=false;
  function onRead(){
    var r=list.getBoundingClientRect();
    if(r.height<=0)return;
    if(!sent50&&(window.innerHeight-r.top)/r.height>=0.5){sent50=true;nausTrack('viewer_50percent');}
    var last=list.lastElementChild;
    if(!sentEnd&&last&&last.getBoundingClientRect().bottom<=window.innerHeight){sentEnd=true;nausTrack('viewer_complete');}
    if(sent50&&sentEnd)window.removeEventListener('scroll',onRead);
  }
  window.addEventListener('scroll',onRead,{passive:true});
})();

/*
 * 無料相談ボタン: 資料を読み進めた人に、右下(スマホは画面下部)へ予約ボタンを出す。
 *  1. 表示から delaySeconds 秒 または 資料の scrollRatio まで読んだら(早い方)、小さな予約ボタンを出す
 *  2. LPごとに指定したページ(expandAfterPages)をすべて過ぎたら、ボタンが広がってカードになる
 *     カードには氏名・会社名・メールアドレスの入力欄を置き、フォームで入力済みの値を最初から入れておく(直した値は保存し直す)
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
  // 入力欄(氏名・会社名・メールアドレス)。資料DLフォームで保存した値を最初から入れておき、その場で直せる。
  // Netlify Formsには送らない(画面上の入力欄だけ。値はこのタブ内の保存領域に書き戻す)
  var STORE_KEY='naus_lead';
  function readLead(){
    try{return JSON.parse(sessionStorage.getItem(STORE_KEY)||'null')||{};}catch(err){return {};}
  }
  function writeLead(patch){
    try{
      var cur=readLead();
      for(var k in patch)cur[k]=patch[k];
      if(!cur.source)cur.source=root.getAttribute('data-viewer')||'';
      sessionStorage.setItem(STORE_KEY,JSON.stringify(cur));
    }catch(err){}
  }
  var lead=readLead();
  var FIELDS=[
    {key:'name',label:'氏名',type:'text',autocomplete:'name'},
    {key:'company',label:LP?LP.companyLabel:'会社名',type:'text',autocomplete:'organization'},
    {key:'email',label:'メールアドレス',type:'email',autocomplete:'email'}
  ];
  var fieldsBox=el('div','dv-float-fields');
  FIELDS.forEach(function(f){
    var id='dv-float-'+f.key;
    var box=el('div','dv-float-field');
    var label=el('label','dv-float-label',f.label);
    label.setAttribute('for',id);
    var input=el('input','dv-float-input');
    input.id=id;
    input.type=f.type;
    input.autocomplete=f.autocomplete;
    input.value=lead[f.key]?String(lead[f.key]):'';
    var err=el('p','dv-float-error');
    err.id=id+'-error';
    err.hidden=true;
    input.addEventListener('input',function(){
      var patch={};patch[f.key]=input.value.trim();
      writeLead(patch);
      if(!err.hidden){setError(f,'');updateSpace();}
    });
    input.addEventListener('keydown',function(e){
      if(e.key==='Enter'){e.preventDefault();pick.click();}
    });
    f.input=input;f.err=err;
    box.appendChild(label);
    box.appendChild(input);
    box.appendChild(err);
    fieldsBox.appendChild(box);
  });
  panel.appendChild(fieldsBox);

  function setError(f,msg){
    f.err.textContent=msg;
    f.err.hidden=!msg;
    if(msg){
      f.input.setAttribute('aria-invalid','true');
      f.input.setAttribute('aria-describedby',f.err.id);
    }else{
      f.input.removeAttribute('aria-invalid');
      f.input.removeAttribute('aria-describedby');
    }
  }
  // 空欄と、明らかに形式がおかしいメールアドレスだけを止める
  function validate(){
    var first=null;
    FIELDS.forEach(function(f){
      var v=f.input.value.trim();
      var msg='';
      if(!v)msg='入力してください';
      else if(f.key==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))msg='メールアドレスの形式をご確認ください';
      setError(f,msg);
      if(msg&&!first)first=f.input;
    });
    if(first)first.focus();
    return !first;
  }

  var pick=el('a','dv-float-panel-btn','日程を選ぶ(30秒で完了)');
  pick.href=source.getAttribute('href');
  pick.target='_blank';
  pick.rel='noopener';
  pick.addEventListener('click',function(e){
    if(!validate()){e.preventDefault();updateSpace();return;}
    var patch={};
    FIELDS.forEach(function(f){patch[f.key]=f.input.value.trim();});
    writeLead(patch);
  });
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
    var h=wrap.offsetHeight+(parseFloat(getComputedStyle(wrap).bottom)||0)-kbOffset;
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

  var cardTracked=false;
  function show(viaExpand){
    if(shown)return;
    shown=true;
    if(timer)clearTimeout(timer);
    wrap.hidden=false;
    wrap.classList.add('is-in');
    render();
    if(!viaExpand)nausTrack('cta_shown',{cta_variant:'button'});
  }
  function trackCard(){
    if(cardTracked||minimized)return;
    cardTracked=true;
    nausTrack('cta_shown',{cta_variant:'card'});
  }

  function expand(){
    if(expanded)return;
    show(true);
    expanded=true;
    // 閉じてアイコンにしている人には、勝手に広げない(アイコンから戻したときにカードで出る)
    if(!minimized){
      wrap.classList.remove('is-in');
      wrap.classList.add('is-grow');
    }
    render();
    trackCard();
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
    if(expanded)trackCard();
    (expanded?pick:btn).focus();
  });
  // スマホで入力欄を使うとき、画面キーボードにカードが隠れないよう、見えている範囲の下端に合わせて持ち上げる
  var kbOffset=0;
  var vv=window.visualViewport;
  function fitKeyboard(){
    if(!vv)return;
    var off=MOBILE.matches&&expanded&&!minimized?Math.max(0,Math.round(window.innerHeight-vv.height-vv.offsetTop)):0;
    if(off===kbOffset)return;
    kbOffset=off;
    wrap.style.bottom=off?off+'px':'';
    panel.style.maxHeight=off?Math.max(160,Math.floor(vv.height-12))+'px':'';
  }
  if(vv){
    vv.addEventListener('resize',fitKeyboard);
    vv.addEventListener('scroll',fitKeyboard);
  }
  window.addEventListener('resize',updateSpace);
  if(MOBILE.addEventListener)MOBILE.addEventListener('change',updateSpace);

  timer=setTimeout(show,CONFIG.delaySeconds*1000);
  window.addEventListener('scroll',onScroll,{passive:true});
  onScroll();
})();
