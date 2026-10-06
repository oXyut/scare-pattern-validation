import {statusLabels,filterWorks,matchingScenes} from './core.mjs';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data;
const filterIds=['query','status','type','fit','group'];
const keys=['q','status','type','fit','group'];
const getFilters=()=>Object.fromEntries(keys.map((k,i)=>[k,$(filterIds[i]).value]));
const repoURL=path=>`https://github.com/oXyut/scare-pattern-validation/blob/${data.source_revision}/${path}`;
const tag=id=>`<a class="tag" href="#type-${esc(id)}" title="固定v1の${esc(id)}を読む">${esc(id)}</a>`;
const status=value=>`<span class="status ${esc(value)}">${esc(statusLabels[value])}</span>`;
const paragraph=value=>esc(value).replace(/\n/g,'<br>');
function fillFields(){
  const params=new URLSearchParams(location.search);
  filterIds.forEach((id,i)=>{const el=$(id);const v=params.get(keys[i])||'';el.value=el.tagName==='SELECT'&&!Array.from(el.options).some(o=>o.value===v)?'':v;});
}
function renderResults(){
  const filters=getFilters();
  const works=filterWorks(data.works,filters);
  const scenes=works.reduce((n,w)=>n+matchingScenes(w,filters).length,0);
  $('result-count').textContent=`${works.length} / 131項目を表示 · 条件に合う場面${scenes}行`;
  if(!works.length){$('results').innerHTML='<div class="empty"><h3>条件に合う項目がありません。</h3><p>検索語を減らすか、確認状態・型・判定の条件を変えてください。</p><button type="button" id="empty-reset">全ての項目に戻す</button></div>';$('empty-reset').onclick=resetFilters;return;}
  $('results').innerHTML=`<table class="results-table"><caption class="sr-only">条件に合う固定割当項目</caption><thead><tr><th scope="col">作品名・割当ID</th><th scope="col">本文の確認</th><th scope="col">場面の型ラベル</th><th scope="col">場面全体の判定</th></tr></thead><tbody>${works.map(w=>{
    const selected=matchingScenes(w,filters);
    const labels=[...new Set(selected.flatMap(s=>s.type_ids))].sort();
    const fits=[...new Set(selected.map(s=>s.fit))];
    return `<tr><th class="work-col" scope="row"><a href="#work=${esc(w.work_id)}">${esc(w.title)}</a><small>${esc(w.work_id)} · 群${esc(w.group_id.slice(-2))}</small></th><td>${status(w.body_status)}</td><td><div class="tags">${labels.length?labels.map(tag).join(''):'<span class="small-note">型なし</span>'}</div></td><td>${fits.map(esc).join('・')}<br><span class="scene-count">${selected.length}行${selected.length!==w.scenes.length?` / 全${w.scenes.length}行`:''}</span></td></tr>`;
  }).join('')}</tbody></table>`;
}
function updateFilters(){
  const params=new URLSearchParams();Object.entries(getFilters()).forEach(([k,v])=>{if(v)params.set(k,v);});
  history.replaceState(null,'',`${location.pathname}${params.size?'?'+params:''}${location.hash}`);
  renderResults();
}
function resetFilters(){filterIds.forEach(id=>$(id).value='');updateFilters();}
function renderTypes(){
  $('type-directory').innerHTML=data.type_groups.map(g=>`<div class="type-group"><h3>${esc(g.id)}群 / ${esc(g.name)}</h3>${data.types.filter(t=>t.id[0]===g.id).map(t=>`<details class="type-entry" id="type-${esc(t.id)}"><summary><span class="type-id">${esc(t.id)}</span>${esc(t.name)}</summary><dl><dt>発生条件</dt><dd>${esc(t.onset)}</dd><dt>主な対処・選択</dt><dd>${esc(t.choices)}</dd><dt>閉鎖・決着の条件</dt><dd>${esc(t.closure)}</dd><dt>世界モデル・他型との関係</dt><dd>${esc(t.connection)}</dd><dt>今回のレビューで残った境界</dt><dd>${esc(t.review)}</dd></dl><a class="type-search" href="?type=${esc(t.id)}#catalogue">${esc(t.id)}ラベルのある項目を探す</a></details>`).join('')}</div>`).join('');
  data.types.forEach(t=>$('type').add(new Option(`${t.id} ${t.name}`,t.id)));
}
function field(label,value){return value?`<dt>${esc(label)}</dt><dd>${paragraph(value)}</dd>`:'';}
function sceneHTML(s,w){
  const sourceLinks=s.source_ids.map(id=>`<a href="#source-${esc(id)}">${esc(id)}</a>`).join('・');
  return `<section class="scene" id="scene-${esc(s.scene_id)}" aria-label="場面 ${esc(s.scene_id)}"><div class="scene-header"><strong>${esc(s.scene_id)}</strong><span class="fit" data-fit="${esc(s.fit)}">${esc(s.fit)}</span><div class="tags">${s.type_ids.length?s.type_ids.map(tag).join(''):'型なし'}</div></div><p>${paragraph(s.evidence_summary)}</p><dl class="notation">${['Q','D','C','M'].map(k=>`<div><dt><span>${k}</span>${{Q:'問い',D:'危険',C:'選択',M:'世界モデル'}[k]}</dt><dd>${paragraph(s[k])}</dd></div>`).join('')}</dl><dl class="scene-analysis">${field('発生条件',s.onset_conditions)}${field('閉鎖・決着の条件',s.closure_conditions)}${field('判別根拠・留保',s.discriminators)}${field('説明しきれない残余',s.residue)}</dl><details class="scene-more"><summary>情報の変化・競合型・成果を読む</summary><dl class="scene-analysis">${field('情報状態の変化',s.information_state_change)}${field('競合する型',s.competing_types.join('・')||'記録なし')}${field('局所／広域の記録',s.local_or_global)}${field('成果・未解決対象',s.outcomes)}${field('解釈確信度',s.confidence===null?'未記録':String(s.confidence))}</dl></details><p class="scene-source-list">出典 ${sourceLinks||'本文出典を同定できていません。'}<br>判定は場面全体へのv1評価です。複合ラベルの個別成功を示しません。</p></section>`;
}
function sourceHTML(s){
  return `<section class="source-entry" id="source-${esc(s.source_id)}"><h3>${esc(s.source_id)} · ${esc(s.source_kind)}</h3><p>${s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">出典ページを開く</a>`:'URL未同定。本文を確認した出典として扱いません。'}</p><dl><div><dt>範囲</dt><dd>${paragraph(s.episode_scope)}</dd></div><div><dt>版・同定の留保</dt><dd>${paragraph(s.variant||'記録なし')}</dd></div><div><dt>本文確認の台帳値</dt><dd>${esc(s.body_verified)}。割当の同定状態とは別です。</dd></div><div><dt>取得・再読日時UTC</dt><dd>${esc(s.accessed_at_utc||'未記録')} · ${esc({timestamp_utc:'時刻精度',date_only_utc:'日付精度',not_recorded:'日時未記録'}[s.access_time_status]||'精度の明示なし')}</dd></div>${s.access_time_missing_reason?`<div><dt>日時の留保</dt><dd>${paragraph(s.access_time_missing_reason)}</dd></div>`:''}${s.url_missing_reason?`<div><dt>URLの留保</dt><dd>${paragraph(s.url_missing_reason)}</dd></div>`:''}</dl>${s.notes?`<p>${paragraph(s.notes)}</p>`:''}</section>`;
}
function renderWork(id){
  const w=data.works.find(w=>w.work_id===id);
  const back=`${location.pathname}${location.search}#catalogue`;
  if(!w){$('work-detail').innerHTML=`<a class="back-link" href="${esc(back)}">作品別資料に戻る</a><h1>この割当IDは見つかりません。</h1><p>全131項目の一覧から探してください。</p>`;return;}
  const sourceIds=new Set([...w.source_ids,...w.scenes.flatMap(s=>s.source_ids)]);
  const sources=data.sources.filter(s=>s.work_id===id||sourceIds.has(s.source_id));
  $('work-detail').innerHTML=`<a class="back-link" href="${esc(back)}">検索結果に戻る</a><header class="work-heading"><p class="section-index">作品別分析 / 固定v1</p><h1 tabindex="-1" id="work-title">${esc(w.title)}</h1><div class="work-meta"><span>${esc(w.work_id)}</span>${status(w.body_status)}<span>群${esc(w.group_id.slice(-2))} · ${w.scenes.length}場面行</span></div></header><div class="work-intro"><p class="small-note">展開・結末のネタバレを含む自作分析です。${w.body_status==='unverified'?'割当本文が未確認のため、保留行を場面証拠や分類の不適合に数えません。':''}${w.body_status==='partial'?'本文範囲や同定に留保があります。':''}</p><dl>${field('確認した本文範囲・同定状態',w.episode_scope)}${field('異名・派生・独立性の留保',w.alias_or_derivative)}${field('作品全体の問題・読み',w.overall_fears)}${field('未説明の残余',w.unexplained_residue)}${field('反例・強制しない対応',w.counterexamples)}${field('改訂の提案',w.change_proposals)}</dl></div><h2 class="scenes-heading">場面ごとの記録</h2>${w.scenes.map(s=>sceneHTML(s,w)).join('')}<section class="work-sources"><h2>出典・本文の版と留保</h2><p class="small-note">リンク先は外部サイトです。本文転載、候補、検索記録を区別し、日時欠測を補っていません。リンクの存在は原典との一致を保証しません。</p>${sources.length?sources.map(sourceHTML).join(''):'<p>この項目の本文出典URLは同定されていません。</p>'}<p class="reference">原資料 <a href="${repoURL(`groups/${w.group_id}/data/mappings.json`)}">群別対応表</a>・<a href="${repoURL(`groups/${w.group_id}/reports/report.md`)}">群別報告</a>・<a href="${repoURL(`groups/${w.group_id}/sources/ledger.csv`)}">出典台帳</a></p></section><a class="back-link" href="${esc(back)}">検索結果に戻る</a><p class="small-note">解釈確信度は主観的な見積もりです。恐怖効果や統計的確率は示しません。v3基準による再符号化ではありません。</p>`;
  document.title=`${w.title} | 洒落怖の問題状態を読む`;
}
function route(){
  const hash=decodeURIComponent(location.hash.slice(1));
  const detail=hash.startsWith('work=')||hash.startsWith('scene-')||hash.startsWith('source-');
  if(hash.startsWith('work=')){renderWork(hash.slice(5));}
  // Scene/source anchors belong to the currently open work, preserving its detail view.
  if((hash.startsWith('source-')||hash.startsWith('scene-'))&&!$('work-detail').innerHTML){
    const target=hash.replace(/^(source|scene)-/,'');
    const w=data.works.find(w=>w.scenes.some(s=>s.scene_id===target||s.source_ids.includes(target))||w.source_ids.includes(target))||data.works.find(w=>data.sources.some(s=>s.source_id===target&&s.work_id===w.work_id));
    if(w)renderWork(w.work_id);
  }
  $('report').hidden=detail;$('work-detail').hidden=!detail;
  if(!detail){document.title='洒落怖の問題状態を読む | 131項目の調査報告';fillFields();renderResults();}
  if(hash.startsWith('type-')){const el=$(hash);if(el)el.open=true;}
  const target=$(hash);
  if(target)requestAnimationFrame(()=>target.scrollIntoView({behavior:'instant'}));
  if(hash.startsWith('work=')){
    $('work-title')?.focus({preventScroll:true});
    requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'instant'}));
  }
}
try{
  const response=await fetch('data.json');if(!response.ok)throw new Error('data unavailable');data=await response.json();
  renderTypes();fillFields();renderResults();
  document.querySelectorAll('[data-repo]').forEach(a=>a.href=repoURL(a.dataset.repo));
  $('group-source-links').innerHTML=data.groups.map(g=>`<a href="${repoURL(`groups/${g.group_id}/reports/report.md`)}">群${esc(g.group_id.slice(-2))}の報告</a> <a href="${repoURL(`groups/${g.group_id}/sources/ledger.csv`)}">台帳</a>`).join(' · ');
  $('filters').addEventListener('submit',event=>event.preventDefault());
  $('query').addEventListener('input',updateFilters);['status','type','fit','group'].forEach(id=>$(id).addEventListener('change',updateFilters));
  $('filters').addEventListener('reset',event=>{event.preventDefault();resetFilters();});
  window.addEventListener('hashchange',route);window.addEventListener('popstate',route);route();
}catch(error){
  $('result-count').textContent='資料を読み込めませんでした。';
  $('results').innerHTML='<p class="error">再読み込みしてください。復旧しない場合は、下の出典からリポジトリの資料を確認できます。</p>';
  $('type-directory').innerHTML='<p>基準目録はリポジトリの固定v1全文から確認できます。</p>';
  document.querySelectorAll('[data-repo]').forEach(a=>a.href=`https://github.com/oXyut/scare-pattern-validation/blob/148359a/${a.dataset.repo}`);
  $('group-source-links').innerHTML='<a href="https://github.com/oXyut/scare-pattern-validation/tree/148359a/groups">全5群の資料</a>';
}
