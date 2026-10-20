/*
 * 資料ページ(/crm-doc/)の「資料をPDFで保存する」
 * - リンクを押すと、会社名・氏名・メールアドレスの入力画面を開く。送信すると PDF の保存が始まり、
 *   入力した人には PDF と資料ページのリンクを書いた自動メールが届く
 * - 入力は Google Apps Script のウェブアプリに送る(管理シートの「資料ダウンロード」タブに記録し、自動メールを送る)。Netlify Functions は使わない
 * - このファイルが読み込めないときは、リンクのとおり PDF がそのまま保存される
 * - 入力値は、予約画面と同じく、このタブ内の保存領域(sessionStorage の naus_lead)から読み書きする。URLや計測(dataLayer)には載せない
 * - 見た目は予約画面(/assets/booking/booking.css)の部品を使う
 */
(function(){
  // Apps Script のウェブアプリ(管理シートにつながっている「GA4の記録_自動更新」の pdf-form.gs)
  var ENDPOINT='https://script.google.com/macros/s/AKfycbwBjcxTahp18GmyxEK5jrPaErXRM2NXMgt44lYaL2pH-Zq04qjmx8vGm9_O80l9tYcjvg/exec';
  var STORE_KEY='naus_lead';
  var PRIVACY_URL='https://www.naus.co.jp/2';
  var BOOKING=/^https:\/\/calendar\.app\.google\//;
  // 受け取る側(Apps Script)と同じ条件
  var EMAIL_RE=/^[^\s@<>()"',;:\\]+@[^\s@<>()"',;:\\]+\.[^\s@<>()"',;:\\]{2,}$/;
  var FIELDS=[
    {key:'company',label:'会社名',type:'text',ac:'organization',max:100},
    {key:'name',label:'氏名',type:'text',ac:'name',max:50},
    {key:'email',label:'メールアドレス',type:'email',ac:'email',max:254}
  ];
  var ERR={required:'入力してください',invalid_email:'メールアドレスの形式をご確認ください'};

  var link=document.getElementById('pdf-download');
  if(!link||!window.fetch)return;
  var pdfHref=link.getAttribute('href');
  // 入力画面を開いただけで、GA4の自動計測が「PDFを保存した」(file_download)と数えないように、リンクの先を入力画面に変える
  link.setAttribute('href','#pdf-form');
  link.removeAttribute('download');
  link.setAttribute('aria-haspopup','dialog');

  var overlay,dialog,body,lastFocus=null,prevOverflow='',isOpen=false;

  function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
  function clear(node){while(node.firstChild)node.removeChild(node.firstChild);}

  function readLead(){try{return JSON.parse(sessionStorage.getItem(STORE_KEY)||'null')||{};}catch(e){return {};}}
  function writeLead(patch){
    try{
      var cur=readLead();
      for(var k in patch)cur[k]=patch[k];
      if(!cur.source)cur.source='consult';
      sessionStorage.setItem(STORE_KEY,JSON.stringify(cur));
    }catch(e){}
  }

  // 計測: GTMへ送るイベント(dataLayer)。個人情報(会社名・氏名・メール)は載せない
  function track(event,params){
    try{
      var d={event:event,lp_type:'consult',page_type:'crm_doc'};
      if(params)for(var k in params)d[k]=params[k];
      (window.dataLayer=window.dataLayer||[]).push(d);
    }catch(e){}
  }

  // URLの ?c= の値(会社ごとの記号)
  function companyCode(){
    var m=location.search.match(/[?&]c=([^&#]*)/);
    if(!m)return '';
    try{return decodeURIComponent(m[1].replace(/\+/g,' '));}catch(e){return m[1];}
  }
  // 全角の英数字・記号を半角に(メールアドレス用)
  function toHalf(v){return v.replace(/[！-～]/g,function(c){return String.fromCharCode(c.charCodeAt(0)-0xFEE0);}).replace(/\s+/g,'');}

  // ---- 画面の骨組み ----
  function build(){
    overlay=el('div','bk-overlay');
    overlay.hidden=true;
    dialog=el('div','bk-dialog pf-dialog');
    dialog.setAttribute('role','dialog');
    dialog.setAttribute('aria-modal','true');
    dialog.setAttribute('aria-labelledby','pf-title');
    dialog.tabIndex=-1;
    var head=el('div','bk-head');
    var title=el('h2','bk-title','資料をPDFで保存する');
    title.id='pf-title';
    var x=el('button','bk-close','×');
    x.type='button';
    x.setAttribute('aria-label','閉じる');
    x.addEventListener('click',close);
    head.appendChild(title);
    head.appendChild(x);
    body=el('div','bk-body');
    dialog.appendChild(head);
    dialog.appendChild(body);
    overlay.appendChild(dialog);
    overlay.addEventListener('click',function(e){if(e.target===overlay)close();});
    document.body.appendChild(overlay);
    document.addEventListener('keydown',onKey);
  }

  function onKey(e){
    if(!isOpen)return;
    if(e.key==='Escape'||e.key==='Esc'){e.preventDefault();close();return;}
    if(e.key==='Tab'){
      var f=Array.prototype.filter.call(dialog.querySelectorAll('button,a[href],input,textarea,select'),function(n){return !n.disabled&&n.offsetParent!==null&&n.tabIndex!==-1;});
      if(!f.length)return;
      var first=f[0],last=f[f.length-1],a=document.activeElement;
      if(e.shiftKey&&(a===first||a===dialog)){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&a===last){e.preventDefault();first.focus();}
    }
  }

  function open(){
    if(!overlay)build();
    renderForm();
    lastFocus=document.activeElement;
    prevOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    overlay.hidden=false;
    isOpen=true;
    dialog.focus();
    track('pdf_form_open');
  }
  function close(){
    if(!isOpen)return;
    isOpen=false;
    overlay.hidden=true;
    document.body.style.overflow=prevOverflow;
    // #pdf-form で開いた場合は、閉じたらURLから #pdf-form を外す(再読み込みで再び開かないように)
    if(location.hash==='#pdf-form'&&history.replaceState){
      try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}
    }
    if(lastFocus&&lastFocus.focus)lastFocus.focus();
  }

  // ---- 入力画面 ----
  function renderForm(){
    clear(body);
    body.appendChild(el('p','bk-text','会社名・氏名・メールアドレスをご入力ください。送信するとPDFの保存が始まり、ご入力のメールアドレスにもPDFのリンクをお送りします。'));
    var form=el('form');
    form.noValidate=true;
    var lead=readLead();
    var inputs={};
    var box=el('div','bk-fields pf-fields');
    FIELDS.forEach(function(f){
      var wrap=el('div');
      var id='pf-f-'+f.key;
      var lab=el('label','bk-label',f.label);
      lab.setAttribute('for',id);
      lab.appendChild(el('em',null,'必須'));
      var inp=el('input','bk-input');
      inp.id=id;inp.name=f.key;inp.type=f.type;inp.autocomplete=f.ac;inp.required=true;inp.maxLength=f.max;
      inp.value=lead[f.key]||'';
      inp.addEventListener('input',function(){setErr(inp,'');});
      var err=el('p','bk-err');err.id=id+'-err';err.hidden=true;
      wrap.appendChild(lab);wrap.appendChild(inp);wrap.appendChild(err);
      box.appendChild(wrap);
      inputs[f.key]=inp;
    });
    // スパム対策の隠し欄(人には見えない)
    var hp=el('div','bk-hp');
    hp.setAttribute('aria-hidden','true');
    var hpi=el('input');hpi.type='text';hpi.name='hp';hpi.tabIndex=-1;hpi.autocomplete='off';
    hp.appendChild(hpi);
    box.appendChild(hp);
    form.appendChild(box);

    var act=el('div','bk-actions');
    var go=el('button','bk-primary','送信してPDFを保存する');
    go.type='submit';
    act.appendChild(go);
    form.appendChild(act);

    var pp=el('p','pf-privacy','ご入力いただいた個人情報は、資料のご提供と、本サービスに関するご連絡のためにのみ利用します。詳細は');
    var pl=el('a',null,'プライバシーポリシー');
    pl.href=PRIVACY_URL;pl.target='_blank';pl.rel='noopener';
    pp.appendChild(pl);
    pp.appendChild(document.createTextNode('をご確認ください。'));
    form.appendChild(pp);

    form.addEventListener('submit',function(e){e.preventDefault();submit(inputs,hpi);});
    body.appendChild(form);
    body.scrollTop=0;
  }

  function setErr(inp,code){
    var err=document.getElementById(inp.id+'-err');
    if(!err)return;
    err.textContent=code?(ERR[code]||ERR.required):'';
    err.hidden=!code;
    if(code){inp.setAttribute('aria-invalid','true');inp.setAttribute('aria-describedby',err.id);}
    else{inp.removeAttribute('aria-invalid');inp.removeAttribute('aria-describedby');}
  }

  function submit(inputs,hpi){
    var data={},first=null;
    FIELDS.forEach(function(f){
      var inp=inputs[f.key];
      var v=inp.value.trim();
      if(f.key==='email'){v=toHalf(v);inp.value=v;}
      data[f.key]=v;
      var c=!v?'required':(f.key==='email'&&!EMAIL_RE.test(v))?'invalid_email':'';
      setErr(inp,c);
      if(c&&!first)first=inp;
    });
    if(first){first.focus();return;}
    writeLead({company:data.company,name:data.name,email:data.email});
    send({company:data.company,name:data.name,email:data.email,hp:hpi.value,c:companyCode(),page:location.origin+location.pathname+location.search});
    track('pdf_form_submit');
    download();
    renderDone();
  }

  // Apps Script に送る。返事は読まない(別のドメインなので読めない)。届かなくてもPDFは保存できる
  function send(payload){
    try{
      fetch(ENDPOINT,{method:'POST',mode:'no-cors',credentials:'omit',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)}).catch(function(){});
    }catch(e){}
  }

  function download(){
    var a=document.createElement('a');
    a.href=pdfHref;
    a.setAttribute('download','');
    a.style.display='none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){if(a.parentNode)a.parentNode.removeChild(a);},0);
  }

  // ---- 送信後 ----
  function renderDone(){
    clear(body);
    var box=el('div','bk-done');
    box.appendChild(el('span','bk-check','✓'));
    box.appendChild(el('h3','bk-done-title','PDFの保存を始めました'));
    box.appendChild(el('p','bk-text','ご入力いただいたメールアドレスにも、PDFと資料ページのリンクをお送りします。'));
    var again=el('a','pf-again','保存が始まらないときは、こちらから保存してください');
    again.href=pdfHref;
    again.setAttribute('download','');
    box.appendChild(again);

    var act=el('div','bk-actions');
    // 続けて無料診断を予約できるように、予約画面(booking.js)を開くボタンを出す
    var top=document.getElementById('cta-top');
    if(top&&BOOKING.test(top.href)&&window.nausBooking){
      var b=el('button','bk-primary','無料診断を予約する（30分・オンライン）');
      b.type='button';
      b.addEventListener('click',function(){
        var href=top.href;
        close();
        track('cta_click',{cta_location:'pdf_form'});
        window.nausBooking.open(href);
      });
      act.appendChild(b);
    }
    var c=el('button','bk-secondary','閉じる');
    c.type='button';
    c.addEventListener('click',close);
    act.appendChild(c);
    box.appendChild(act);
    body.appendChild(box);
    body.scrollTop=0;
  }

  link.addEventListener('click',function(e){
    if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    e.preventDefault();
    open();
  });
  // 新しいタブで開かれたなどで #pdf-form 付きのURLになったときも、入力画面を開く
  if(location.hash==='#pdf-form')open();
})();
