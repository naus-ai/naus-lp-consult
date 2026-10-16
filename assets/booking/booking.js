/*
 * 無料相談の予約画面(全ページ共通)
 * - ページ内の外部予約リンク(calendar.app.google)を押すと、外部に飛ばずにこの予約画面を開く
 *   (リンク自体は残してあるので、このファイルが読み込めない場合は従来どおり外部の予約ページが開く)
 * - 空き枠は /api/booking/slots、予約は /api/booking/create(Netlify Functions)を使う
 * - 予約APIが使えないときは、押されたリンクの外部予約ページを案内する
 * 入力値は、このタブ内の保存領域(sessionStorage の naus_lead)から読み書きする。URLには載せない
 */
(function(){
  var API_SLOTS='/api/booking/slots';
  var API_CREATE='/api/booking/create';
  var STORE_KEY='naus_lead';
  var EXTERNAL=/^https:\/\/calendar\.app\.google\//;
  var SOURCE=location.pathname.indexOf('/shigyo')===0?'shigyo':'consult';
  var COMPANY_LABEL=SOURCE==='shigyo'?'事務所名':'会社名';
  var WD=['日','月','火','水','木','金','土'];
  var JST=9*60*60*1000;
  var DAY=24*60*60*1000;
  var MOBILE=window.matchMedia('(max-width:640px)');

  var FIELDS=[
    {key:'name',label:'氏名',type:'text',ac:'name'},
    {key:'company',label:COMPANY_LABEL,type:'text',ac:'organization'},
    {key:'email',label:'メールアドレス',type:'email',ac:'email'},
    {key:'phone',label:'電話番号',type:'tel',ac:'tel'}
  ];

  var st={open:false,fallback:'',slots:[],mock:false,selected:null,from:'',weekStart:0,day:'',editing:false,notice:'',sending:false};
  var overlay,dialog,body,lastFocus=null,prevOverflow='';

  // ---- 日付の表示(利用者の端末の時刻設定に関係なく、日本時間で表示する) ----
  function jst(ms){var d=new Date(ms+JST);return {y:d.getUTCFullYear(),m:d.getUTCMonth()+1,d:d.getUTCDate(),w:d.getUTCDay(),h:d.getUTCHours(),mi:d.getUTCMinutes()};}
  function pad(n){return (n<10?'0':'')+n;}
  function hm(ms){var p=jst(ms);return p.h+':'+pad(p.mi);}
  function md(ms){var p=jst(ms);return p.m+'/'+p.d+'('+WD[p.w]+')';}
  function dayKey(ms){var p=jst(ms);return p.y+'-'+pad(p.m)+'-'+pad(p.d);}
  function midnight(ms){var p=jst(ms);return Date.UTC(p.y,p.m-1,p.d)-JST;}
  function monday(ms){var m=midnight(ms);var w=jst(m).w;return m-((w+6)%7)*DAY;}
  function slotLabel(s){return md(s.start)+' '+hm(s.start)+'〜'+hm(s.end);}

  // ---- 入力値の保存 ----
  function readLead(){try{return JSON.parse(sessionStorage.getItem(STORE_KEY)||'null')||{};}catch(e){return {};}}
  function writeLead(patch){
    try{
      var cur=readLead();
      for(var k in patch)cur[k]=patch[k];
      if(!cur.source)cur.source=SOURCE;
      sessionStorage.setItem(STORE_KEY,JSON.stringify(cur));
    }catch(e){}
  }

  function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
  function clear(node){while(node.firstChild)node.removeChild(node.firstChild);}

  // ---- 画面の骨組み ----
  function build(){
    overlay=el('div','bk-overlay');
    overlay.hidden=true;
    dialog=el('div','bk-dialog');
    dialog.setAttribute('role','dialog');
    dialog.setAttribute('aria-modal','true');
    dialog.setAttribute('aria-labelledby','bk-title');
    dialog.tabIndex=-1;
    var head=el('div','bk-head');
    var title=el('h2','bk-title','無料相談(30分・オンライン)のご予約');
    title.id='bk-title';
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
    overlay.addEventListener('click',function(e){if(e.target===overlay&&!st.sending)close();});
    document.body.appendChild(overlay);
    document.addEventListener('keydown',onKey);
    MOBILE.addEventListener&&MOBILE.addEventListener('change',function(){if(st.open&&!st.selected&&st.slots.length)renderSelect();});
  }

  function onKey(e){
    if(!st.open)return;
    if(e.key==='Escape'||e.key==='Esc'){if(!st.sending){e.preventDefault();close();}return;}
    if(e.key==='Tab'){
      var f=Array.prototype.filter.call(dialog.querySelectorAll('button,a[href],input,textarea,select'),function(n){return !n.disabled&&n.offsetParent!==null&&n.tabIndex!==-1;});
      if(!f.length)return;
      var first=f[0],last=f[f.length-1],a=document.activeElement;
      if(e.shiftKey&&(a===first||a===dialog)){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&a===last){e.preventDefault();first.focus();}
    }
  }

  function open(fallback){
    if(!overlay)build();
    st.fallback=fallback||'';
    st.selected=null;st.from='';st.editing=false;st.notice='';st.sending=false;
    lastFocus=document.activeElement;
    prevOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    overlay.hidden=false;
    st.open=true;
    dialog.focus();
    loadSlots();
  }
  function close(){
    if(!st.open||st.sending)return; // 予約の送信中は閉じない(結果を必ず表示する)
    st.open=false;
    overlay.hidden=true;
    document.body.style.overflow=prevOverflow;
    if(lastFocus&&lastFocus.focus)lastFocus.focus();
  }

  // ---- 空き枠の取得 ----
  function loadSlots(){
    clear(body);
    body.appendChild(el('p','bk-status','空き状況を確認しています…'));
    fetch(API_SLOTS,{headers:{'Accept':'application/json'},cache:'no-store'})
      .then(function(r){if(!r.ok)throw new Error(String(r.status));return r.json();})
      .then(function(data){
        if(!st.open)return;
        st.mock=!!data.mock;
        st.slots=(data.slots||[]).map(function(s){return {start:Date.parse(s.start),end:Date.parse(s.end),iso:s.start};});
        if(!st.slots.length){renderEmpty();return;}
        var w=monday(st.slots[0].start);
        st.weekStart=w;
        st.day=dayKey(st.slots[0].start);
        renderSelect();
      })
      .catch(function(){if(st.open)renderFallback();});
  }

  function mockBanner(){
    if(st.mock)body.appendChild(el('p','bk-mock','テスト表示: 仮の空き枠です。予約しても実際のカレンダーには登録されません。'));
  }
  function noticeBox(){
    if(st.notice){body.appendChild(el('p','bk-notice',st.notice));st.notice='';}
  }

  // 予約APIが使えないとき: 押されたリンクの外部予約ページを案内する
  function renderFallback(){
    clear(body);
    var box=el('div','bk-done');
    box.appendChild(el('p','bk-text','現在、この画面から予約を受け付けられません。お手数ですが、下のボタンから予約ページを開いてお申し込みください。'));
    var a=el('a','bk-primary','予約ページを開く');
    a.href=st.fallback||'#';
    a.target='_blank';
    a.rel='noopener';
    box.appendChild(a);
    body.appendChild(box);
  }
  function renderEmpty(){
    clear(body);
    mockBanner();
    var box=el('div','bk-done');
    box.appendChild(el('p','bk-text','現在、ご予約いただける日時がありません。お手数ですが、下のボタンから予約ページをご確認ください。'));
    var a=el('a','bk-primary','予約ページを開く');
    a.href=st.fallback||'#';
    a.target='_blank';
    a.rel='noopener';
    box.appendChild(a);
    body.appendChild(box);
  }

  // ---- 日時を選ぶ ----
  function pick(slot,from){
    st.selected=slot;
    st.from=from;
    renderConfirm();
  }

  function renderSelect(){
    clear(body);
    mockBanner();
    noticeBox();
    // 上部: 最短の候補(4件)
    var sec1=el('section','bk-sec');
    sec1.appendChild(el('h3','bk-sec-title','最短の候補'));
    var list=el('div','bk-earliest');
    st.slots.slice(0,4).forEach(function(s){
      var b=el('button','bk-early-btn');
      b.type='button';
      b.appendChild(el('span',null,slotLabel(s)));
      b.appendChild(el('span',null,'›'));
      b.setAttribute('aria-label',slotLabel(s)+'を選ぶ');
      b.addEventListener('click',function(){pick(s,'earliest');});
      list.appendChild(b);
    });
    sec1.appendChild(list);
    body.appendChild(sec1);
    // 下部: カレンダー
    var sec2=el('section','bk-sec');
    sec2.appendChild(el('h3','bk-sec-title','カレンダーから選ぶ'));
    if(MOBILE.matches)renderChips(sec2);else renderWeek(sec2);
    body.appendChild(sec2);
    body.scrollTop=0;
  }

  function slotsOfDay(key){return st.slots.filter(function(s){return dayKey(s.start)===key;});}

  // PC: 5日分(月〜金)の週表示
  function renderWeek(sec){
    var firstWeek=monday(Date.now());
    var lastWeek=monday(st.slots[st.slots.length-1].start);
    var nav=el('div','bk-weeknav');
    var prev=el('button','bk-navbtn','‹ 前の週');prev.type='button';
    var next=el('button','bk-navbtn','次の週 ›');next.type='button';
    var fri=st.weekStart+4*DAY;
    var label=el('span','bk-weeklabel',md(st.weekStart)+' 〜 '+md(fri));
    prev.disabled=st.weekStart<=firstWeek;
    next.disabled=st.weekStart>=lastWeek;
    prev.addEventListener('click',function(){st.weekStart-=7*DAY;renderSelect();});
    next.addEventListener('click',function(){st.weekStart+=7*DAY;renderSelect();});
    nav.appendChild(prev);nav.appendChild(label);nav.appendChild(next);
    sec.appendChild(nav);

    var grid=el('div','bk-grid');
    grid.setAttribute('role','group');
    grid.setAttribute('aria-label',md(st.weekStart)+'〜'+md(fri)+'の空き時間');
    var cols=[],times={};
    for(var i=0;i<5;i++){
      var dms=st.weekStart+i*DAY;
      var ds=slotsOfDay(dayKey(dms));
      cols.push({ms:dms,slots:ds});
      ds.forEach(function(s){times[hm(s.start)]=jst(s.start).h*60+jst(s.start).mi;});
      var h=el('div','bk-gh'+(ds.length?'':' is-off'),md(dms));
      grid.appendChild(h);
    }
    // 行: この週に1つでも空きがある時刻(無い週は「空きがありません」)
    var rows=Object.keys(times).sort(function(a,b){return times[a]-times[b];});
    if(!rows.length){
      var none=el('p','bk-status','この週は空きがありません。');
      none.style.gridColumn='1/-1';
      grid.appendChild(none);
    }
    rows.forEach(function(t){
      cols.forEach(function(c){
        var s=null;
        c.slots.forEach(function(x){if(hm(x.start)===t)s=x;});
        if(s){
          var b=el('button','bk-slot',t);
          b.type='button';
          b.setAttribute('aria-label',slotLabel(s)+'を選ぶ');
          b.addEventListener('click',function(){pick(s,'calendar');});
          grid.appendChild(b);
        }else{
          var c2=el('div','bk-cell','—');
          c2.setAttribute('aria-hidden','true');
          grid.appendChild(c2);
        }
      });
    });
    sec.appendChild(grid);
  }

  // スマホ: 日付を横スクロールのチップで選び、その日の空き時間を縦に並べる
  function renderChips(sec){
    var chips=el('div','bk-chips');
    chips.setAttribute('role','tablist');
    var start=midnight(Date.now());
    var last=st.slots[st.slots.length-1].start;
    var active=null;
    for(var ms=start;ms<=last;ms+=DAY){
      var w=jst(ms).w;
      if(w===0||w===6)continue;
      (function(ms){
        var key=dayKey(ms);
        var n=slotsOfDay(key).length;
        var c=el('button','bk-chip'+(key===st.day?' is-active':''));
        c.type='button';
        c.setAttribute('role','tab');
        c.setAttribute('aria-selected',key===st.day?'true':'false');
        c.appendChild(document.createTextNode(md(ms)));
        c.appendChild(el('small',null,n?'空きあり':'×'));
        c.disabled=!n;
        c.addEventListener('click',function(){st.day=key;renderSelect();});
        if(key===st.day)active=c;
        chips.appendChild(c);
      })(ms);
    }
    sec.appendChild(chips);
    var times=el('div','bk-times');
    slotsOfDay(st.day).forEach(function(s){
      var b=el('button','bk-time',hm(s.start)+'〜'+hm(s.end));
      b.type='button';
      b.setAttribute('aria-label',slotLabel(s)+'を選ぶ');
      b.addEventListener('click',function(){pick(s,'calendar');});
      times.appendChild(b);
    });
    sec.appendChild(times);
    if(active)setTimeout(function(){active.scrollIntoView({block:'nearest',inline:'center'});},0);
  }

  // ---- 確認と予約 ----
  var ERR={required:'入力してください',invalid_email:'メールアドレスの形式をご確認ください',invalid_phone:'電話番号の形式をご確認ください',too_long:'文字数が多すぎます'};
  function checkValue(key,v){
    if(!v)return 'required';
    if(key==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))return 'invalid_email';
    if(key==='phone'){
      var half=v.replace(/[０-９]/g,function(c){return String.fromCharCode(c.charCodeAt(0)-0xFEE0);});
      var digits=half.replace(/\D/g,'');
      if(digits.length<10||digits.length>15)return 'invalid_phone';
    }
    return '';
  }

  function renderConfirm(){
    clear(body);
    mockBanner();
    noticeBox();
    var s=st.selected;
    var when=el('p','bk-when');
    when.appendChild(el('small',null,'ご予約日時'));
    when.appendChild(document.createTextNode(slotLabel(s)));
    body.appendChild(when);

    var lead=readLead();
    var complete=FIELDS.every(function(f){return !checkValue(f.key,(lead[f.key]||'').trim());});
    var inputs={};

    if(complete&&!st.editing){
      // 入力済み: 内容を表示し、直したいときだけ編集に切り替える
      var dl=el('dl','bk-info');
      FIELDS.forEach(function(f){dl.appendChild(el('dt',null,f.label));dl.appendChild(el('dd',null,lead[f.key]));});
      body.appendChild(dl);
      var ed=el('button','bk-edit','入力内容を修正する');
      ed.type='button';
      ed.addEventListener('click',function(){st.editing=true;renderConfirm();});
      body.appendChild(ed);
    }

    var box=el('div','bk-fields');
    FIELDS.forEach(function(f){
      if(complete&&!st.editing)return;
      var wrap=el('div');
      var id='bk-f-'+f.key;
      var lab=el('label','bk-label',f.label);
      lab.setAttribute('for',id);
      lab.appendChild(el('em',null,'必須'));
      var inp=el('input','bk-input');
      inp.id=id;inp.type=f.type;inp.autocomplete=f.ac;inp.required=true;
      inp.value=lead[f.key]||'';
      inp.addEventListener('input',function(){var p={};p[f.key]=inp.value.trim();writeLead(p);setErr(inp,'');});
      var err=el('p','bk-err');err.id=id+'-err';err.hidden=true;
      wrap.appendChild(lab);wrap.appendChild(inp);wrap.appendChild(err);
      box.appendChild(wrap);
      inputs[f.key]=inp;
    });
    // 相談内容(任意)
    var mw=el('div','bk-field-full');
    var mlab=el('label','bk-label','相談したい内容');
    mlab.setAttribute('for','bk-f-message');
    var opt=el('em','is-opt','任意');
    mlab.appendChild(opt);
    var ta=el('textarea','bk-input');
    ta.id='bk-f-message';ta.rows=4;ta.maxLength=1000;
    var merr=el('p','bk-err');merr.id='bk-f-message-err';merr.hidden=true;
    mw.appendChild(mlab);mw.appendChild(ta);mw.appendChild(merr);
    box.appendChild(mw);
    // スパム対策の隠し欄(人には見えない)
    var hp=el('div','bk-hp');
    hp.setAttribute('aria-hidden','true');
    var hpi=el('input');hpi.type='text';hpi.name='website';hpi.tabIndex=-1;hpi.autocomplete='off';
    hp.appendChild(hpi);
    box.appendChild(hp);
    body.appendChild(box);

    var act=el('div','bk-actions');
    var go=el('button','bk-primary','この日時で予約する');
    go.type='button';
    var back=el('button','bk-secondary','‹ 日時を選び直す');
    back.type='button';
    back.addEventListener('click',function(){st.selected=null;renderSelect();});
    go.addEventListener('click',function(){submit(inputs,ta,hpi,go,back);});
    act.appendChild(go);act.appendChild(back);
    body.appendChild(act);
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

  function submit(inputs,ta,hpi,go,back){
    if(st.sending)return;
    var lead=readLead();
    var data={source:SOURCE,start:st.selected.iso,message:ta.value.trim(),website:hpi.value};
    var first=null;
    FIELDS.forEach(function(f){
      var inp=inputs[f.key];
      var v=inp?inp.value.trim():String(lead[f.key]||'').trim();
      data[f.key]=v;
      if(inp){var c=checkValue(f.key,v);setErr(inp,c);if(c&&!first)first=inp;}
    });
    if(first){first.focus();return;}
    var patch={};FIELDS.forEach(function(f){patch[f.key]=data[f.key];});
    writeLead(patch);

    st.sending=true;
    go.disabled=true;back.disabled=true;
    go.textContent='予約しています…';
    fetch(API_CREATE,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(data)})
      .then(function(r){return r.json().catch(function(){return {};}).then(function(b){return {status:r.status,body:b};});})
      .then(function(res){
        st.sending=false;
        if(!st.open)return;
        if(res.status===200&&res.body.ok){renderDone(res.body,data.email);return;}
        if(res.status===409||(res.status===400&&res.body.fields&&res.body.fields.start)){
          st.notice='この枠は選択できなくなりました。お手数ですが、別の日時をお選びください。';
          st.selected=null;
          loadSlotsKeepNotice();
          return;
        }
        if(res.status===400&&res.body.fields){
          // 入力の不備: 該当欄を編集できる状態にして知らせる
          st.editing=true;
          renderConfirm();
          Object.keys(res.body.fields).forEach(function(k){
            var code=res.body.fields[k];
            var inp=document.getElementById('bk-f-'+k);
            if(!inp)return;
            setErr(inp,code==='invalid'?(k==='email'?'invalid_email':k==='phone'?'invalid_phone':'required'):code);
          });
          return;
        }
        if(res.status===429){
          go.disabled=false;back.disabled=false;go.textContent='この日時で予約する';
          st.notice='短時間に操作が続いたため、受け付けられませんでした。少し時間をおいて、もう一度お試しください。';
          var n=el('p','bk-notice',st.notice);st.notice='';
          body.insertBefore(n,body.firstChild);
          body.scrollTop=0;
          return;
        }
        renderFallback();
      })
      .catch(function(){st.sending=false;if(st.open)renderFallback();});
  }

  function loadSlotsKeepNotice(){
    var keep=st.notice;
    clear(body);
    body.appendChild(el('p','bk-status','空き状況を確認しています…'));
    fetch(API_SLOTS,{headers:{'Accept':'application/json'},cache:'no-store'})
      .then(function(r){if(!r.ok)throw new Error(String(r.status));return r.json();})
      .then(function(data){
        if(!st.open)return;
        st.slots=(data.slots||[]).map(function(s){return {start:Date.parse(s.start),end:Date.parse(s.end),iso:s.start};});
        if(!st.slots.length){renderEmpty();return;}
        st.weekStart=monday(st.slots[0].start);
        st.day=dayKey(st.slots[0].start);
        st.notice=keep;
        renderSelect();
      })
      .catch(function(){if(st.open)renderFallback();});
  }

  function renderDone(res,email){
    clear(body);
    mockBanner();
    var box=el('div','bk-done');
    box.appendChild(el('span','bk-check','✓'));
    box.appendChild(el('h3','bk-done-title','ご予約が完了しました'));
    var when=el('p','bk-when');
    when.appendChild(el('small',null,'ご予約日時'));
    when.appendChild(document.createTextNode(slotLabel({start:Date.parse(res.start),end:Date.parse(res.end)})));
    box.appendChild(when);
    if(res.meetUrl){
      var mp=el('p','bk-meet');
      mp.appendChild(document.createTextNode('Google Meet: '));
      var a=el('a',null,res.meetUrl);
      a.href=res.meetUrl;a.target='_blank';a.rel='noopener';
      mp.appendChild(a);
      box.appendChild(mp);
    }else{
      box.appendChild(el('p','bk-meet','Google MeetのURLは、招待メールでお知らせします。'));
    }
    var msg=el('p','bk-text',email+' 宛てに、Googleカレンダーの招待メールをお送りしました。');
    msg.appendChild(document.createElement('br'));
    msg.appendChild(document.createTextNode('当日は招待メールのGoogle Meetからご参加ください。'));
    box.appendChild(msg);
    var c=el('button','bk-primary','閉じる');
    c.type='button';
    c.addEventListener('click',close);
    box.appendChild(c);
    body.appendChild(box);
    body.scrollTop=0;
  }

  // ---- 外部予約リンクを、この予約画面を開く動作に切り替える ----
  document.addEventListener('click',function(e){
    if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;
    if(!a||!EXTERNAL.test(a.href))return;
    if(overlay&&overlay.contains(a))return; // 予約画面の中の「予約ページを開く」は外部ページをそのまま開く
    e.preventDefault();
    open(a.href);
  });

  window.nausBooking={open:open,close:close};
})();
