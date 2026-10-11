import {keys,fieldIds,validateReaderIndex,validateReaderWork,filterReaderWorks,parseReaderRoute,editionHref,esc} from './v3-reader-core.mjs';
import {readerViews} from './v3-reader-views.mjs';
const $=id=>document.getElementById(id);
let index,views,narrativesPromise,routedURL,renderedWorkId;
let routeSerial=0,focusFrame;
const workCache=new Map();
async function json(path){const response=await fetch(path);if(!response.ok)throw new Error('資料を取得できません');return response.json();}
function readFilters(){return Object.fromEntries(keys.map((key,i)=>[key,$(fieldIds[i]).value]));}
function fillFilters(){
  const params=new URLSearchParams(location.search);
  fieldIds.forEach((id,i)=>{const el=$(id),value=params.get(keys[i])||'';el.value=el.tagName==='SELECT'&&!Array.from(el.options).some(o=>o.value===value)?'':value;});
}
function renderResults(){
  const filters=readFilters(),works=filterReaderWorks(index,filters);
  $('result-count').textContent=`${works.length} / 131項目 · あらすじ${works.filter(w=>w.synopsis).length}件 · 本文・同定保留${works.filter(w=>w.inherited_narrative_status==='pending').length}件`;
  $('results').innerHTML=views.catalogue(works,filters);
  if($('empty-reset'))$('empty-reset').onclick=resetFilters;
}
function updateFilters(){
  const params=new URLSearchParams();Object.entries(readFilters()).forEach(([key,value])=>{if(value)params.set(key,value);});
  history.replaceState(null,'',`${location.pathname}${params.size?'?'+params:''}${location.hash}`);
  routedURL=location.href;renderResults();
  $('v1-edition-link').href=editionHref('./','',$('query').value);
}
function resetFilters(){fieldIds.forEach(id=>$(id).value='');updateFilters();$('query').focus();}
async function narrativeFor(id){
  if(!narrativesPromise)narrativesPromise=json('data.json').then(data=>{
    if(data.baseline_id!==index.v1_baseline_id||data.narratives.works.length!==131)throw new Error('あらすじの参照版が一致しません');
    return new Map(data.narratives.works.map(n=>[n.work_id,n]));
  }).catch(error=>{narrativesPromise=null;throw error;});
  const n=(await narrativesPromise).get(id),w=index.works.find(w=>w.work_id===id);
  if(!n||n.status!==w.inherited_narrative_status)throw new Error('あらすじの本文範囲が一致しません');
  return n;
}
async function workFor(id){
  if(!workCache.has(id))workCache.set(id,json(`v3/r2/works/${id}.json`).then(w=>{validateReaderWork(w,index,id);return w;}).catch(error=>{workCache.delete(id);throw error;}));
  return workCache.get(id);
}
function focusAnchor(anchor){
  const target=$(anchor);
  if(!target)return false;
  let parent=target;while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}
  const focusTarget=target.tagName==='DETAILS'?target.querySelector('summary'):target.matches('section,article,div')?(target.querySelector('h1,h2,h3,h4')||target):target;
  focusTarget.setAttribute('tabindex','-1');focusTarget.classList.add('route-heading');
  focusFrame=requestAnimationFrame(()=>{focusTarget.focus({preventScroll:true});target.scrollIntoView({behavior:'instant'});if(anchor==='work-title')scrollTo({top:0,behavior:'instant'});});
  return true;
}
function errorHTML(message){return `<div class="reader-error"><a class="back-link" href="${esc(location.pathname+location.search)}#catalogue">作品一覧に戻る</a><h1 id="route-error" tabindex="-1">資料を表示できません</h1><p role="alert">${esc(message)}</p><p>保存データの不一致や取得失敗を、別の版の判定で補いません。</p><button type="button" id="retry">もう一度読み込む</button></div>`;}
async function route(){
  if(routedURL===location.href)return;
  routedURL=location.href;const serial=++routeSerial;cancelAnimationFrame(focusFrame);
  fillFilters();renderResults();
  const state=parseReaderRoute(location.hash,index);
  $('report').hidden=state.kind!=='report';$('work-detail').hidden=state.kind==='report';
  const v1Href=editionHref('./',state.kind==='work'?state.work.work_id:'',$('query').value);
  $('v1-edition-link').href=v1Href;
  if(state.kind==='report'){
    renderedWorkId=null;document.title='洒落怖を作品から読む · v3';
    if(state.anchor)focusAnchor(state.anchor);
    return;
  }
  if(state.kind==='error'){
    renderedWorkId=null;$('work-detail').innerHTML=errorHTML('リンクの作品・参照箇所が見つからないか、形式が正しくありません。');
    $('retry').onclick=()=>{routedURL=null;route();};focusAnchor('route-error');return;
  }
  const id=state.work.work_id;
  if(renderedWorkId!==id){
    $('work-detail').innerHTML='<p role="status">作品資料を読み込み中…</p>';
    try{
      const [w,n]=await Promise.all([workFor(id),narrativeFor(id)]);
      if(serial!==routeSerial)return;
      $('work-detail').innerHTML=views.work(w,n,location.pathname+location.search+'#catalogue',v1Href);renderedWorkId=id;
    }catch(error){
      if(serial!==routeSerial)return;
      renderedWorkId=null;$('work-detail').innerHTML=errorHTML(error.message);$('retry').onclick=()=>{routedURL=null;route();};focusAnchor('route-error');return;
    }
  }
  if(serial!==routeSerial)return;
  document.title=`${state.work.title} | 洒落怖 · v3`;
  const owned=new Set(['work-title','story','classification','work-sources',...state.work.records.map(r=>'record-'+r.record_id)]);
  const w=await workFor(id);w.records.forEach(r=>r.evidence.forEach(e=>owned.add(`evidence-${r.record_id}-${e.evidence_id}`)));
  if(serial!==routeSerial)return;
  if(!owned.has(state.anchor)){
    $('work-detail').innerHTML=errorHTML('この作品の参照箇所が見つかりません。別作品・別版の根拠は表示しません。');renderedWorkId=null;$('retry').onclick=()=>{routedURL=null;route();};focusAnchor('route-error');return;
  }
  focusAnchor(state.anchor);
}
try{
  index=await json('v3/reader-index.json');validateReaderIndex(index);views=readerViews(index);
  for(const g of index.type_groups){
    $('group').append(new Option(g.name+(g.id==='F'?'（世界モデル）':''),g.id));
    const group=document.createElement('optgroup');group.label=g.name;index.types.filter(t=>t.id[0]===g.id).forEach(t=>group.append(new Option(t.name,t.id)));$('type').append(group);
  }
  $('type-directory').innerHTML=views.types();
  $('filters').addEventListener('submit',event=>event.preventDefault());
  $('filters').addEventListener('reset',event=>{event.preventDefault();resetFilters();});
  $('query').addEventListener('input',updateFilters);
  for(const id of fieldIds.slice(1))$(id).addEventListener('change',()=>{
    if(id==='group'&&$('type').value&&$('type').value[0]!==$('group').value)$('type').value='';
    if(id==='type'&&$('type').value)$('group').value=$('type').value[0];
    if(['group','type'].includes(id)&&$(id).value&&!$('decision').value)$('decision').value='fit';
    updateFilters();
  });
  document.addEventListener('click',event=>{
    const a=event.target.closest('a');if(!a||a.target||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const url=new URL(a.href,location.href);if(url.origin!==location.origin||url.pathname!==location.pathname||!url.search||url.search===location.search)return;
    event.preventDefault();history.pushState(null,'',url);route();
  });
  window.addEventListener('hashchange',route);window.addEventListener('popstate',route);route();
}catch(error){$('results').innerHTML=`<p role="alert">資料を読み込めません。${esc(error.message)}</p>`;$('result-count').textContent='資料の取得・版の確認に失敗しました。';}
