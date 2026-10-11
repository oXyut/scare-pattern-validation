const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stateNames = {supported:'根拠あり', explicitly_false:'明示的不成立', unknown:'証拠不明'};
const decisionNames = {fit:'必須条件の根拠が揃う', not_fit:'選定記録で明示的不成立', pending:'条件の証拠が不足・保留'};
const relations = {same_actor_time_scope:'同じ当事者・時点', overlapping_scope:'確認範囲が一部重なる', not_reviewed_in_r2:'この旧場面の条件は未抽出', source_hold:'本文・同定保留'};
const safeURL = value => {try {const u=new URL(value); return /^https?:$/.test(u.protocol) ? u.href : null;} catch {return null;}};
const external = (url, label) => safeURL(url) ? `<a href="${esc(safeURL(url))}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label);
function href(wid, anchor) {
  const url=new URL(location.href); url.searchParams.set('edition','r2');
  if(url.searchParams.get('version')==='v1')url.searchParams.set('version','v3');
  url.hash=`${wid}/${anchor}`; return esc(url.pathname+url.search+url.hash);
}
export function layerName(layer) {
  if(layer==='narrated_as_T_with_final_identity_retraction') return 'Tの経験としての叙述。末尾で投稿者の正体が訂正される';
  if(layer.includes('script')) return '台本に描かれた出来事';
  if(layer.includes('induced_imagery')) return '誘導された想像の中';
  const parts=[];
  if(layer.includes('dream'))parts.push('夢内の経験');
  if(layer.includes('narrat')||layer.includes('observation')||layer.includes('perception'))parts.push('本文で語られた観測');
  if(layer.includes('report')||layer.includes('hearsay')||layer.includes('explanation')||layer.includes('story'))parts.push('作中の伝聞・説明');
  if(layer.includes('belief')||layer.includes('infer')||layer.includes('hypothesis')||layer.includes('speculation'))parts.push('信念・推測');
  if(layer.includes('memory')||layer.includes('recollection')||layer.includes('retrospective'))parts.push('過去の回想');
  if(layer.includes('reconstruction'))parts.push('再構成を含む');
  return parts.join('／') || '掲載本文で語られた出来事';
}
export function validateR2Index(index) {
  if(index.schema_version!=='v3-r2-view-index-1'||index.version!=='v3-development-review-r2'||
     index.codebook_id!=='fear-patterns-v3-codebook-proposed-1'||index.v1_baseline_id!=='fear-patterns-v1-26types'||
     index.independent_human_coding_performed!==false||index.independent_test_performed!==false||index.agreement!==null||
     index.works.length!==131||new Set(index.works.map(w=>w.work_id)).size!==131)throw new Error('R2 index mismatch');
  const ids=[...index.common_required.map(c=>c.id),...index.types.flatMap(t=>t.required_conditions.map(c=>c.id))];
  if(ids.length!==78||new Set(ids).size!==78||index.types.length!==26||index.types.some(t=>t.partial_allowed!==false))throw new Error('R2 criteria mismatch');
  const count = status => index.works.filter(w=>w.inherited_narrative_status===status).length;
  if(count('ready')!==92||count('scoped')!==18||count('pending')!==21||
     index.works.reduce((n,w)=>n+w.selected_record_count,0)!==118||
     index.works.some(w=>w.inherited_narrative_status==='pending'?w.selected_record_count!==0:w.selected_record_count<1))throw new Error('R2 coverage mismatch');
}
export function validateR2Work(work, index, wid) {
  if(work.schema_version!=='v3-r2-work-1'||work.work_id!==wid||work.version!==index.version||
     work.codebook_id!==index.codebook_id||work.v1_baseline_id!==index.v1_baseline_id)throw new Error('R2 work mismatch');
  const entry=index.works.find(w=>w.work_id===wid);
  if(!entry||work.inherited_narrative_status!==entry.inherited_narrative_status||work.records.length!==entry.selected_record_count||
     new Set(work.records.map(r=>r.record_id)).size!==work.records.length)throw new Error('R2 work coverage mismatch');
  const required=new Set([...index.common_required.map(c=>c.id),...index.types.flatMap(t=>t.required_conditions.map(c=>c.id))]);
  const reviews=new Map(work.r2_source_reviews.map(r=>[r.review_id,r]));
  for(const rec of work.records) {
    if(!rec.record_id.startsWith(wid+'-V3-R2-')||rec.conditions.length!==78||new Set(rec.conditions.map(c=>c.condition_id)).size!==78||rec.type_records.length!==26)throw new Error('R2 record mismatch');
    const evidence=new Map(rec.evidence.map(e=>[e.evidence_id,e]));
    if(evidence.size!==rec.evidence.length)throw new Error('R2 duplicate evidence');
    for(const e of rec.evidence) {
      const source=reviews.get(e.source_review_id);
      if(!e.evidence_id.startsWith(wid+'-')||!source||source.work_id!==wid||![source.url,...(source.additional_urls||[])].includes(e.url))throw new Error('R2 foreign source');
    }
    const conditions=new Map(rec.conditions.map(c=>[c.condition_id,c]));
    for(const c of rec.conditions) {
      if(!required.has(c.condition_id)||!Object.hasOwn(stateNames,c.state)||!c.reason||
         !c.inspected_evidence_ids.length||[...c.inspected_evidence_ids,...c.evidence_ids].some(id=>!evidence.has(id))||
         (c.state==='unknown'?c.evidence_ids.length!==0:c.evidence_ids.length===0))throw new Error('R2 condition evidence mismatch');
    }
    if(new Set(rec.type_records.map(t=>t.type_id)).size!==26)throw new Error('R2 duplicate type');
    for(const t of index.types) {
      const row=rec.type_records.find(r=>r.type_id===t.id);
      const ids=[...t.common_required_ids,...t.required_conditions.map(c=>c.id)];
      const states=ids.map(id=>conditions.get(id).state);
      const decision=states.includes('explicitly_false')?'not_fit':states.every(s=>s==='supported')?'fit':'pending';
      if(!row||row.decision!==decision||JSON.stringify(row.required_condition_ids)!==JSON.stringify(ids))throw new Error('R2 decision mismatch');
    }
  }
  const oldIds=new Set(work.v1_historical_scenes.map(s=>s.scene_id));
  if([...oldIds].some(id=>!id.startsWith(wid+'-'))||work.v1_comparisons.length!==oldIds.size||new Set(work.v1_comparisons.map(m=>m.scene_id)).size!==oldIds.size||
     work.v1_comparisons.some(m=>!oldIds.has(m.scene_id)||!Object.hasOwn(relations,m.relation)||
       m.record_ids.some(rid=>!work.records.some(r=>r.record_id===rid))||
       (['not_reviewed_in_r2','source_hold'].includes(m.relation)?m.record_ids.length!==0||m.selected_scope_differences.length!==0:m.record_ids.length===0)))throw new Error('R2 comparison mismatch');
}
export function r2Views(index) {
  const types=new Map(index.types.map(t=>[t.id,t]));
  const oldTypes=new Map(index.v1_types.map(t=>[t.id,t]));
  const groups=index.type_groups;
  const conditionText=new Map([...index.common_required,...index.types.flatMap(t=>t.required_conditions)].map(c=>[c.id,c.text]));
  function tags(ids, old=false) {
    return ids.map(id=>`<span class="type-tag" data-type-group="${esc(id[0])}">${esc((old?oldTypes:types).get(id)?.name||id)} <small>${esc(id)}</small></span>`).join(' ');
  }
  function condition(rec,c,w) {
    const refs=c.state==='unknown'?c.inspected_evidence_ids:c.evidence_ids;
    return `<li><strong>${esc(conditionText.get(c.condition_id))}</strong><br><span class="state ${c.state}">${stateNames[c.state]}</span> <small>${esc(c.condition_id)}</small><p>${esc(c.reason)}</p><p class="evidence-ref">${c.state==='unknown'?'点検した本文箇所':'根拠の本文箇所'}: ${refs.map((id,i)=>`<a href="${href(w.work_id,`evidence-${rec.record_id}-${id}`)}">本文根拠${rec.evidence.findIndex(e=>e.evidence_id===id)+1}</a>`).join(' / ')}</p></li>`;
  }
  function judgments(rec, group, w) {
    const byId=new Map(rec.conditions.map(c=>[c.condition_id,c]));
    return `<section class="type-group" data-type-group="${group.id}"><h4>${esc(group.name)} <small>${group.id}</small></h4>${rec.type_records.filter(t=>t.type_id.startsWith(group.id)).map(t=>`<details class="judgment" data-type="${t.type_id}"><summary><strong>${esc(types.get(t.type_id).name)}</strong> <small>${esc(t.type_id)}</small><span class="decision ${t.decision}">${decisionNames[t.decision]}</span></summary><ul class="conditions">${t.required_condition_ids.map(id=>condition(rec,byId.get(id),w)).join('')}</ul></details>`).join('')}</section>`;
  }
  function record(rec,i,w) {
    const fits=rec.type_records.filter(t=>t.decision==='fit').map(t=>t.type_id);
    return `<article class="record" id="record-${esc(rec.record_id)}"><h3>選定記録${i+1} · ${esc(rec.actor)}</h3><p class="fit-summary"><strong>必須条件の根拠が揃う型</strong><br>${fits.length?tags(fits):'未確定。証拠不足の型と明示的不成立の型を下で分けています。'}</p><dl><dt>時点と選定範囲</dt><dd>${esc(rec.time_scope)}</dd><dt>予期・進行中の損失</dt><dd>${esc(rec.anticipated_loss||'本文から未特定')}</dd><dt>当事者の認識</dt><dd>${esc(rec.recognition_basis)}</dd><dt>証拠の層</dt><dd>${esc(layerName(rec.world_layer))}</dd></dl><p>${esc(rec.selection_reason)}</p><p class="scope-limit"><strong>この記録の限界</strong><br>${esc(rec.limitation)}</p><details class="body-evidence"><summary>本文根拠と出典を読む（${rec.evidence.length}箇所）</summary>${rec.evidence.map((e,j)=>`<section class="evidence" id="evidence-${esc(rec.record_id)}-${esc(e.evidence_id)}"><h4>本文根拠${j+1} · ${esc(layerName(e.layer))}</h4><p>${esc(e.summary)}</p><p>${external(e.url,'出典本文を開く')} · ${esc(e.range)}</p><small>記録: ${esc(e.evidence_id)}／${esc(e.source_review_id)}<br>本文の層: ${esc(e.layer)}</small></section>`).join('')}</details><h3>A〜E · 当事者の問題状態</h3><p class="muted">当事者・時点を揃えて必須条件を点検。「部分適合」や主型・副型の順位は付けません。</p>${groups.filter(g=>g.id!=='F').map(g=>judgments(rec,g,w)).join('')}<h3>F · 世界モデルの前提変更</h3><p>個別の怪異や信念の変化と、世界・人間一般の前提変更を分けます。</p><details class="world-model"><summary>旧前提・新証拠・一般化の限界を読む</summary><dl>${[['old_premise','旧前提'],['new_evidence','新証拠'],['evidence_scope','証拠の範囲'],['acceptance_and_threat','受容・脅威'],['why_local_explanation_insufficient','局所説明では足りない理由']].map(([k,label])=>`<dt>${label}</dt><dd>${esc(rec.world_model_evidence[k])}</dd>`).join('')}</dl><h4>代替仮説</h4><ul>${rec.world_model_evidence.alternative_hypotheses.map(h=>`<li>${esc(h.hypothesis)}: ${esc(h.basis)}</li>`).join('')}</ul><p>${esc(rec.world_model_evidence.limitation)}</p></details>${judgments(rec,groups.find(g=>g.id==='F'),w)}<p><strong>観察された閉じ方</strong><br>${esc(rec.closure_observed)}</p><small>選定記録ID: ${esc(rec.record_id)}</small></article>`;
  }
  function newView(w) {
    if(w.inherited_narrative_status==='pending')return `<div class="v3-panel notice"><h3>r2 · 本文・同定保留</h3><p>${esc(w.inherited_reason)}</p><p>本文を確認できないため、当事者・場面や型別の条件判定を作成していません。選定記録での証拠不明・明示的不成立とは別です。</p><a href="${href(w.work_id,'sources')}">取得・同定の理由と確認範囲へ</a></div>`;
    return `<div class="v3-panel"><h3>r2 · 本文の必須条件点検</h3><p>${w.records.length}の選定記録を表示。作品の全場面やシリーズ全体の評価ではありません。</p>${w.records.map((r,i)=>record(r,i,w)).join('')}</div>`;
  }
  function comparison(w) {
    return `<section class="panel comparison-scope"><h3>旧場面とr2選定記録の対応</h3><p class="notice">v1は旧場面の記録、r2は指定当事者・時点の条件点検です。同じ型IDでも意味や基準をコピーしません。未抽出場面は削除・不成立ではなく、作品全体の適合率の差も示しません。</p>${w.v1_comparisons.map(m=>`<article class="scene-match" data-relation="${m.relation}"><h4>${relations[m.relation]} <small>${esc(m.scene_id)}</small></h4><p><strong>v1の旧候補</strong><br>${tags(m.historical_type_ids,true)||'型なし'} · 旧判定 ${esc(m.historical_scene_fit)}</p><p>${esc(m.reason)}</p>${m.record_ids.map(rid=>`<p><a href="${href(w.work_id,'record-'+rid)}">対応する選定記録${w.records.findIndex(r=>r.record_id===rid)+1}へ</a></p>`).join('')}${m.selected_scope_differences.map(diff=>`<dl><dt>旧候補のr2条件結果</dt><dd>${Object.entries(diff.historical_ids_with_v3_required_condition_result).map(([id,state])=>`${tags([id])}: ${decisionNames[state]}`).join('<br>')||'旧候補なし'}</dd><dt>旧候補外で根拠が揃う型</dt><dd>${tags(diff.v3_fit_ids_outside_historical_candidates)||'なし（全体の陰性を意味しません）'}</dd></dl>`).join('')}</article>`).join('')}</section>`;
  }
  function sources(w) {
    return `<details class="panel source-panel" id="sources"><summary>出典・限定範囲・取得と同定の理由を読む</summary><h3>r2で再読した指定掲載範囲</h3><p class="muted">行番号は今回の閲覧表示の索引で、原投稿の固定行番号ではありません。</p>${w.r2_source_reviews.map(r=>`<section><p>${external(r.url,'指定掲載本文を開く')}${(r.additional_urls||[]).map((url,i)=>' / '+external(url,`追加ページ${i+1}`)).join('')}<br>${esc(r.range)}<br>${esc(r.note)}</p><small>${esc(r.review_id)} · ${esc(r.observed_after_at_utc)}以後の再読バッチ。初出原投稿の一致は未確認。</small></section>`).join('')||'<p>r2で確認できた本文はありません。</p>'}${w.identity_recheck?`<h3>作品・範囲の同定</h3><p>${esc(w.identity_recheck.note||w.identity_recheck.inherited_reason)}</p><p>同定の解消は未確認。継承した限定範囲・保留を保持しています。</p>${(w.identity_recheck.r2_investigation||[]).map(r=>`<p><strong>今回の探索:</strong> ${esc(r.query)}<br>${esc(r.note)}<br><small>検索メタデータの点検。本文取得・同定の解消ではありません。</small></p>`).join('')}`:''}<h3>引き継いだ本文レビュー</h3>${w.source_reviews.map(r=>`<p>${external(r.url,'既存の出典を開く')}<br>${esc(r.scope)}<br>${esc(r.identity_basis)}<br><small>${esc(r.review_id)}</small></p>`).join('')||'<p>本文レビューなし。</p>'}<h3>既存の取得・同定調査</h3>${w.investigation.map(r=>`<p>${r.url?external(r.url,'調査対象を開く'):esc(r.query)}<br>${esc(r.note)}<br><small>${esc(r.checked_at_utc)} · ${esc(r.outcome)}</small></p>`).join('')}</details>`;
  }
  function anchors(w) {
    return w.records.flatMap(r=>['record-'+r.record_id,...r.evidence.map(e=>`evidence-${r.record_id}-${e.evidence_id}`)]).concat('sources');
  }
  return {newView, comparison, sources, anchors, tags};
}
