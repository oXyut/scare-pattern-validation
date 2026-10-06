import {statusLabels,filterWorks,matchingScenes,resolveRoute} from './core.mjs';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data;
let renderedWorkId=null;
let routedURL=null;
let scrollFrame;
const filterIds=['query','status','type','fit','group'];
const keys=['q','status','type','fit','group'];
const getFilters=()=>Object.fromEntries(keys.map((k,i)=>[k,$(filterIds[i]).value]));
const repoURL=path=>`https://github.com/oXyut/scare-pattern-validation/blob/${data.source_revision}/${path}`;
const followupURL=path=>`https://github.com/oXyut/scare-pattern-validation/blob/${data.followup.source_revision}/${path}`;
// Reader-facing labels leave the source document metadata unchanged.
const followupDocumentLabels={"followup/README.md":"追加調査の案内","followup/classification/v1-boundary-audit.md":"v1の型の使い分けを追加点検","followup/classification/v3-codebook.md":"26型の判定条件案（未検証）","followup/evaluation/protocol.md":"独立した評価の手順案（未実施）","followup/evaluation/analysis-plan.md":"評価指標・必要な標本数・判定の計画案","followup/evaluation/gm-rubric.md":"型名に依存しないGM評価基準案","followup/evaluation/records.md":"未記入テンプレートの一覧と受入条件"};
const followupLabels={confirmed:'全範囲確認',partial:'関連本文を限定確認',unresolved:'未解決'};
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
  $('result-count').textContent=`${works.length} / 131項目を表示 · 条件に合う場面記録${scenes}行`;
  if(!works.length){$('results').innerHTML='<div class="empty"><h3>条件に合う項目がありません。</h3><p>検索語を減らすか、確認状態・型・判定の条件を変えてください。</p><button type="button" id="empty-reset">全ての項目に戻す</button></div>';$('empty-reset').onclick=resetFilters;return;}
  $('results').innerHTML=`<table class="results-table"><caption class="sr-only">条件に合う調査対象</caption><thead><tr><th scope="col">作品名・項目ID</th><th scope="col">本文の確認</th><th scope="col">場面に付けた型</th><th scope="col">場面全体の判定</th></tr></thead><tbody>${works.map(w=>{
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
  $('type-directory').innerHTML=data.type_groups.map(g=>`<div class="type-group"><h3>${esc(g.id)}群 / ${esc(g.name)}</h3>${data.types.filter(t=>t.id[0]===g.id).map(t=>`<details class="type-entry" id="type-${esc(t.id)}"><summary><span class="type-id">${esc(t.id)}</span>${esc(t.name)}</summary><dl><dt>問題が生じる条件</dt><dd>${esc(t.onset)}</dd><dt>主な対処と選べる行動</dt><dd>${esc(t.choices)}</dd><dt>問題が決着する条件</dt><dd>${esc(t.closure)}</dd><dt>安全や因果の前提・他の型との関係</dt><dd>${esc(t.connection)}</dd><dt>今回のレビューで使い分けを判断しきれなかった点</dt><dd>${esc(t.review)}</dd></dl><a class="type-search" href="?type=${esc(t.id)}#catalogue">${esc(t.id)}を付けた場面のある項目を探す</a></details>`).join('')}</div>`).join('');
  data.types.forEach(t=>$('type').add(new Option(`${t.id} ${t.name}`,t.id)));
}
function field(label,value){return value?`<dt>${esc(label)}</dt><dd>${paragraph(value)}</dd>`:'';}
function renderFollowup(){
  const f=data.followup;
  $('followup-counts').textContent=`再調査した39項目：全範囲確認${f.counts.confirmed}件、関連本文の限定確認${f.counts.partial}件、未解決${f.counts.unresolved}件`;
  $('followup-links').innerHTML=f.documents.map(d=>`<a href="${followupURL(d.path)}">${esc(followupDocumentLabels[d.path]||d.label)}</a>`).join(' · ');
  $('followup-results').innerHTML=`<table class="followup-table"><caption>v1で未確認25・部分確認14だった39項目</caption><thead><tr><th scope="col">作品・項目ID</th><th scope="col">調査時のv1の状態</th><th scope="col">追加調査の状態</th></tr></thead><tbody>${f.works.map(w=>`<tr><th scope="row"><a href="#work=${esc(w.work_id)}">${esc(w.title)}</a><small>${esc(w.work_id)}</small></th><td>${esc(statusLabels[w.old_status])}</td><td>${esc(followupLabels[w.followup_status])}</td></tr>`).join('')}</tbody></table>`;
}
function workFollowupHTML(w){
  const f=data.followup.works.find(row=>row.work_id===w.work_id);
  if(!f)return '';
  const observations=f.observations.map(s=>{
    const retrieval={success:'ページ取得成功',failed:'取得不能',search_completed:'検索記録'}[s.retrieval_status];
    const relation={scope_support:'指定した掲載範囲の根拠',candidate_only:'比較候補のみ',cross_group_comparison:'群間の比較候補',name_only:'名称一覧のみ',bibliography_only:'書誌のみ',unavailable:'本文取得不能',search_only:'検索のみ',target_candidate:'対象に関連する候補。元の調査対象や版との一致は未確定',context_only:'比較資料のみ'}[s.relation]||s.relation;
    return `<details class="document-details followup-observation"><summary>${esc(s.source_id)} · ${retrieval} · ${s.body_read?'掲載範囲の本文読了':'対象本文の読了なし'}</summary><p>${paragraph(s.evidence_summary)}</p><dl class="scene-analysis">${field('確認した範囲',s.scope)}${field('版',s.variant)}${field('調査対象を特定する上での位置づけ',relation)}${field('取得した日時（UTC）',s.accessed_at_utc)}${field('取得を試みた日時（UTC）',s.attempted_at_utc)}${field('検索した日時（UTC）',s.searched_at_utc)}${field('取得できなかった理由',s.failure_reason)}${field('検索語',s.query)}</dl>${s.url?`<p><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">記録対象の外部ページ</a></p>`:''}${s.result_urls.length?`<p>検索候補 ${s.result_urls.map((url,i)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">候補${i+1}</a>`).join('・')}。候補のURLを見つけても、本文を読めたとは限りません。</p>`:''}</details>`;
  }).join('');
  return `<section class="work-followup" aria-label="2026年10月6日の出典の追加調査"><h2>2026年10月6日の出典の追加調査</h2><p class="followup-state">調査時のv1：${esc(statusLabels[f.old_status])} / 今回：${esc(followupLabels[f.followup_status])}</p><p class="small-note">今回読めた関連本文や限られた版の範囲を、元の調査対象の特定や全範囲の確認としては扱いません。v1の再判定も行っていないため、上に表示した確認状態と場面判定は調査時の記録です。</p><p>${paragraph(f.evidence_summary)}</p><dl class="scene-analysis">${field('今回確認した範囲',f.scope)}${field('未解決の理由',f.unresolved_reasons.join('\n'))}${field('別名・シリーズについて未確定の点',f.cautions.join('\n'))}</dl>${observations}<p class="reference"><a href="${followupURL(f.report_path)}">担当群ごとの追加調査報告</a> · <a href="#followup">再調査した39項目と追加調査の案内</a></p></section>`;
}
const sceneLink=id=>`<a href="#scene-${esc(id)}">${esc(id)}</a>`;
const hasWorkTracking=w=>Boolean(w.target_outcomes||w.problem_tracking||w.outcome_tracking);
function transitionsHTML(rows){
  if(!rows?.length)return '<p class="small-note">場面間で問題がどう変わったかの記録はありません。</p>';
  return rows.map(row=>`<div class="transition-record"><p>${sceneLink(row.from_scene)} → ${sceneLink(row.to_scene)}</p><dl class="scene-analysis">${row.from_type_ids?`<dt>前の場面に付けた型</dt><dd><div class="tags">${row.from_type_ids.map(tag).join('')||'型なし'}</div></dd><dt>次の場面に付けた型</dt><dd><div class="tags">${row.to_type_ids.map(tag).join('')||'型なし'}</div></dd>`:''}${field('次の場面にも残る問題',row.retained_problem)}${field('問題が決着したかの点検',row.closure_audit)}</dl></div>`).join('');
}
function workTrackingHTML(w){
  if(!hasWorkTracking(w))return '';
  let records='';
  if(w.target_outcomes){
    records+=`<h3>対象ごとの記録（作品全体）</h3>${w.target_outcomes.map(row=>`<div class="tracking-record"><h4>${esc(row.target)}</h4><dl class="scene-analysis">${['Q','D','C','M'].map(k=>field(`${k}：${{Q:'問い',D:'危険',C:'選択',M:'世界モデル（安全や因果の前提）'}[k]}`,row[k])).join('')}</dl></div>`).join('')}<h3>場面間で問題がどう変わったか</h3>${transitionsHTML(w.transitions)}`;
  }
  if(w.problem_tracking){
    records+=`<h3>問題ごとの追跡</h3>${w.problem_tracking.map(row=>`<div class="tracking-record"><h4>${esc(row.target)}</h4><p class="small-note">参照場面 ${sceneLink(row.scene_id)}</p><dl class="scene-analysis">${field('記録された成果',row.outcome)}${field('解決していない対象',row.unresolved)}${field('問題の変化',row.transition)}</dl></div>`).join('')}`;
  }
  if(w.outcome_tracking){
    const row=w.outcome_tracking;
    records+=`<h3>作品全体の記録</h3><dl class="scene-analysis">${field('確認・報告された成果',row.confirmed_or_reported_outcome)}${field('解決していない対象',row.unresolved_targets)}</dl><h3>場面間の変化と決着の点検</h3>${transitionsHTML(row.transitions)}`;
  }
  return `<section class="work-tracking" aria-label="作品全体・対象ごとの成果と残る問題"><h2>作品全体・対象ごとの成果と残る問題</h2><p class="small-note">作品全体や対象ごとに、得られた成果と残る問題を記録しています。後に続く場面ごとの四つの分析欄、決着の条件、v1の判定とは、分析の範囲が異なります。付けた型が変わっただけで、危険がなくなった、成果が得られたとは判断しません。${w.body_status==='unverified'?'本文が不足しているため、資料を特定するまでの作業記録を、物語の中で得られた成果としては扱いません。':''}</p>${records}</section>`;
}
function sceneHTML(s,w){
  const sourceLinks=s.source_ids.map(id=>`<a href="#source-${esc(id)}">${esc(id)}</a>`).join('・');
  const outcomes=s.outcomes||`場面単位の成果欄は未記録です。${hasWorkTracking(w)?'上の「作品全体・対象ごとの成果と残る問題」に作品全体や対象別の記録があります。':''}`;
  return `<section class="scene" id="scene-${esc(s.scene_id)}" aria-label="場面 ${esc(s.scene_id)}"><div class="scene-header"><strong>${esc(s.scene_id)}</strong><span class="fit" data-fit="${esc(s.fit)}">${esc(s.fit)}</span><div class="tags">${s.type_ids.length?s.type_ids.map(tag).join(''):'型なし'}</div></div><p>${paragraph(s.evidence_summary)}</p><dl class="notation">${['Q','D','C','M'].map(k=>`<div><dt><span>${k}</span>${{Q:'問い',D:'危険',C:'選択',M:'世界モデル（安全や因果の前提）'}[k]}</dt><dd>${paragraph(s[k])}</dd></div>`).join('')}</dl><dl class="scene-analysis">${field('問題が生じる条件',s.onset_conditions)}${field('問題が決着する条件',s.closure_conditions)}${field('型を判断した根拠と未確定の点',s.discriminators)}${field('型では説明しきれない点',s.residue)}</dl><details class="scene-more"><summary>情報の変化・他の型の候補・成果を読む</summary><dl class="scene-analysis">${field('情報や理解の変化',s.information_state_change)}${field('他に当てはまる型の候補',s.competing_types.join('・')||'記録なし')}${field('問題が及ぶ範囲（局所／広域）',s.local_or_global)}${field('成果・解決していない対象の記録',outcomes)}${field('場面内で問題がどう変わったか',s.transitions?.join('\n'))}${field('解釈確信度',s.confidence===null?'未記録':String(s.confidence))}</dl></details><p class="scene-source-list">出典 ${sourceLinks||'本文の出典を特定できていません。'}<br>判定はv1の基準による場面全体の評価です。複数の型が付いていても、一つひとつの型が適合したことを示すものではありません。</p></section>`;
}
function sourceHTML(s){
  return `<section class="source-entry" id="source-${esc(s.source_id)}"><h3>${esc(s.source_id)} · ${esc(s.source_kind)}</h3><p>${s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">出典ページを開く</a>`:'出典のURLを特定できていません。本文を確認した出典としては扱いません。'}</p><dl><div><dt>範囲</dt><dd>${paragraph(s.episode_scope)}</dd></div><div><dt>版や作品の一致について未確定の点</dt><dd>${paragraph(s.variant||'記録なし')}</dd></div><div><dt>出典台帳での本文確認の記録</dt><dd>${esc(s.body_verified)}。調査対象の作品を特定できたかどうかとは別の記録です。</dd></div><div><dt>取得・再読した日時（UTC）</dt><dd>${esc(s.accessed_at_utc||'未記録')} · ${esc({timestamp_utc:'時刻まで記録',date_only_utc:'日付のみ記録',not_recorded:'日時未記録'}[s.access_time_status]||'記録の精度は未明示')}</dd></div>${s.access_time_missing_reason?`<div><dt>日時について確認できていない点</dt><dd>${paragraph(s.access_time_missing_reason)}</dd></div>`:''}${s.url_missing_reason?`<div><dt>URLについて確認できていない点</dt><dd>${paragraph(s.url_missing_reason)}</dd></div>`:''}</dl>${s.notes?`<p>${paragraph(s.notes)}</p>`:''}</section>`;
}
function renderWork(id){
  const w=data.works.find(w=>w.work_id===id);
  const back=`${location.pathname}${location.search}#catalogue`;
  const sourceIds=new Set([...w.source_ids,...w.scenes.flatMap(s=>s.source_ids)]);
  const sources=data.sources.filter(s=>s.work_id===id||sourceIds.has(s.source_id));
  $('work-detail').innerHTML=`<a class="back-link" href="${esc(back)}">検索結果に戻る</a><header class="work-heading"><p class="section-index">作品別分析 / 調査時の基準v1</p><h1 tabindex="-1" id="work-title">${esc(w.title)}</h1><div class="work-meta"><span>${esc(w.work_id)}</span>${status(w.body_status)}<span>群${esc(w.group_id.slice(-2))} · ${w.scenes.length}行の場面記録</span></div></header><div class="work-intro"><p class="small-note">展開・結末のネタバレを含む自作の分析です。${w.body_status==='unverified'?'調査対象の本文は未確認です。判定を保留した記録を、場面の証拠や型に当てはまらない例には数えません。':''}${w.body_status==='partial'?'確認できた本文の範囲や、調査対象との一致に未確定の点があります。':''}</p><dl>${field('確認した本文の範囲と作品の一致',w.episode_scope)}${field('別名・派生作品・独立性について未確定の点',w.alias_or_derivative)}${field('作品全体で当事者が直面する問題と解釈',w.overall_fears)}${field('説明できていない点',w.unexplained_residue)}${field('型に当てはまらない例・無理に当てはめない箇所',w.counterexamples)}${field('改訂の提案',w.change_proposals)}</dl></div>${workFollowupHTML(w)}${workTrackingHTML(w)}<h2 class="scenes-heading">場面ごとの記録</h2>${w.scenes.map(s=>sceneHTML(s,w)).join('')}<section class="work-sources"><h2>出典・本文の版・未確定の点</h2><p class="small-note">リンク先は外部サイトです。本文の転載先、調査対象の候補、検索記録を分けて掲載しています。記録がない取得日時は補っていません。リンクがあることは、原典との一致を保証しません。</p>${sources.length?sources.map(sourceHTML).join(''):'<p>この項目の本文の出典URLは特定できていません。</p>'}<p class="reference">原資料 <a href="${repoURL(`groups/${w.group_id}/data/mappings.json`)}">群別対応表</a>・<a href="${repoURL(`groups/${w.group_id}/reports/report.md`)}">群別報告</a>・<a href="${repoURL(`groups/${w.group_id}/sources/ledger.csv`)}">出典台帳</a></p></section><a class="back-link" href="${esc(back)}">検索結果に戻る</a><p class="small-note">「解釈確信度」は、分析者が自分の解釈にどの程度確信を持つかの主観的な見積もりです。恐怖の効果や統計的な確率を示す値ではありません。この分析をv3の基準で分類し直したものでもありません。</p>`;
  renderedWorkId=id;
}
function route(){
  // Browsers can emit both popstate and hashchange for the same navigation.
  if(routedURL===location.href)return;
  routedURL=location.href;
  cancelAnimationFrame(scrollFrame);
  const state=resolveRoute(data,location.hash);
  const detail=state.kind!=='report';
  fillFields();renderResults();
  $('report').hidden=detail;$('work-detail').hidden=!detail;
  if(state.kind==='work'){
    if(renderedWorkId!==state.work.work_id)renderWork(state.work.work_id);
    document.title=`${state.work.title} | 洒落怖の問題状態を読む`;
  }else if(detail){
    const title=state.kind==='invalid'?'リンクの形式が正しくありません。':`この${{work:'項目',source:'出典',scene:'場面'}[state.resource]}IDは見つかりません。`;
    const back=`${location.pathname}${location.search}#catalogue`;
    $('work-detail').innerHTML=`<a class="back-link" href="${esc(back)}">作品別資料に戻る</a><h1 tabindex="-1" id="route-error">${title}</h1><p>全131項目の一覧から探してください。</p>`;
    renderedWorkId=null;document.title=`${title} | 洒落怖の問題状態を読む`;
  }else{
    document.title='洒落怖の問題状態を読む | 131項目の調査報告';
    if(state.anchor.startsWith('type-')){const el=$(state.anchor);if(el)el.open=true;}
  }
  const target=$(detail&&state.kind!=='work'?'route-error':state.anchor);
  if(target){
    target.setAttribute('tabindex','-1');target.focus({preventScroll:true});
    scrollFrame=requestAnimationFrame(()=>{
      target.scrollIntoView({behavior:'instant'});
      if(state.anchor==='work-title'||target.id==='route-error')window.scrollTo({top:0,behavior:'instant'});
    });
  }
}
try{
  const response=await fetch('data.json');if(!response.ok)throw new Error('data unavailable');data=await response.json();
  renderTypes();fillFields();renderResults();renderFollowup();
  document.querySelectorAll('[data-repo]').forEach(a=>a.href=repoURL(a.dataset.repo));
  document.querySelectorAll('[data-followup]').forEach(a=>a.href=followupURL(a.dataset.followup));
  $('group-source-links').innerHTML=data.groups.map(g=>`<a href="${repoURL(`groups/${g.group_id}/reports/report.md`)}">群${esc(g.group_id.slice(-2))}の報告</a> <a href="${repoURL(`groups/${g.group_id}/sources/ledger.csv`)}">台帳</a>`).join(' · ');
  $('filters').addEventListener('submit',event=>event.preventDefault());
  $('query').addEventListener('input',updateFilters);['status','type','fit','group'].forEach(id=>$(id).addEventListener('change',updateFilters));
  $('filters').addEventListener('reset',event=>{event.preventDefault();resetFilters();});
  window.addEventListener('hashchange',route);window.addEventListener('popstate',route);route();
}catch(error){
  $('result-count').textContent='資料を読み込めませんでした。';
  $('results').innerHTML='<p class="error">再読み込みしてください。復旧しない場合は、下の出典からリポジトリの資料を確認できます。</p>';
  $('type-directory').innerHTML='<p>26型の定義はリポジトリの基準v1全文から確認できます。</p>';
  document.querySelectorAll('[data-repo]').forEach(a=>a.href=`https://github.com/oXyut/scare-pattern-validation/blob/148359a/${a.dataset.repo}`);
  $('group-source-links').innerHTML='<a href="https://github.com/oXyut/scare-pattern-validation/tree/148359a/groups">全5群の資料</a>';
}
