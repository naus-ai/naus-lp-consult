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
