import {r2Views, validateR2Index, validateR2Work} from './v3-r2.mjs';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const states = {supported:'根拠あり',explicitly_false:'明示的不成立',unknown:'証拠不明'};
const decisions = {fit:'成立条件の根拠あり',not_fit:'選定場面で不成立',pending:'保留'};
const coverage = {ready:'指定本文',scoped:'限定範囲',pending:'本文保留'};
const safeURL = value => {try {const u=new URL(value);return /^https?:$/.test(u.protocol) ? u.href : null;}catch{return null;}};
const link = (url,label) => safeURL(url) ? `<a href="${esc(safeURL(url))}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label);
let data, v1Types=new Map(), activeWork=null, epoch=0, views;
const indexes=new Map(), detailRequests=new Map();
const cache = new Map();
const params = () => new URL(location.href).searchParams;
function readControls(){
  const p=params();
  // Existing evidence URLs still identify the saved r1 edition.
  const legacy=/\/evidence-G\d{2}-W\d{2}-T/.test(location.hash);
  $('edition').value=['r1','r2'].includes(p.get('edition'))?p.get('edition'):legacy?'r1':'r2';
  $('version').value=['v1','v3','compare'].includes(p.get('version'))?p.get('version'):'v3';
  $('search').value=p.get('q')||'';
  $('coverage').value=['ready','scoped','pending'].includes(p.get('coverage'))?p.get('coverage'):'all';
}
function saveControls(push=false,clearAnchor=false){
  const u=new URL(location.href);
  for(const [k,v] of [['edition',$('edition').value],['version',$('version').value],['q',$('search').value],['coverage',$('coverage').value]]) {
    if(v&&v!=='all')u.searchParams.set(k,v);else u.searchParams.delete(k);
  }
  if(clearAnchor)u.hash=u.hash.split('/')[0];
  history[push?'pushState':'replaceState'](null,'',u);
}
function list(){
  const q=$('search').value.trim().toLocaleLowerCase(), cov=$('coverage').value;
  const matches=data.works.filter(w=>(cov==='all'||w.inherited_narrative_status===cov)&&(`${w.title} ${w.work_id} ${w.synopsis||''}`.toLocaleLowerCase().includes(q)));
  const labels={ready:'○ 指定掲載範囲を確認',scoped:'△ 範囲・作品一致に留保',pending:'× 本文・同定保留'};
  $('result-count').textContent=`${matches.length} / 131作品 · ${$('edition').value==='r2'?'追加調査 r2':'初回 r1'} · 判定は選定した当事者・時点に限ります`;
  $('works').innerHTML=matches.map(w=>`<li><a href="#${w.work_id}">${esc(w.title)}</a><small>${labels[w.inherited_narrative_status]}${w.selected_record_count?` · 選定${w.selected_record_count}記録`:''}</small>${w.synopsis?`<p class="synopsis">${esc(w.synopsis)}</p>`:''}</li>`).join('')||'<li>該当する作品はありません。</li>';
}
function editionInfo(){
  const r2=$('edition').value==='r2';
  $('research-link').href=`https://github.com/oXyut/scare-pattern-validation/blob/5298470d71c900842d8fe1965b48f0e6638bb64d/research/${r2?'v3-20261011-r2/report.md':'v3-20261011/README.md'}`;
  $('review-note').textContent=r2?'追加調査 r2 · 110作品の選定118記録の必須条件を本文と照合し、21作品は本文・同定保留です。単一AI・非盲検の開発資料点検で、独立評価・一致度測定は未実施です。':'初回 r1 · 保存した暫定記録です。本文条件を明示点検した355判断と、未点検の自動補完を含みます。追加調査 r2の結果や判断件数と合算しません。独立評価・一致度測定は未実施です。';
  $('edition-info').textContent=r2?'選定記録×異なる必須条件の入力は9,204件。独立観測数・検証済み成果・作品全体の適合率ではありません。旧104場面は条件未抽出のまま保持しています。':'表示する初回データは保存したr1のままです。調査版を変えてもv1の旧場面・旧判定は変わりません。';
}
function oldView(w){return `<div class="panel v1-panel"><h3>v1 歴史的記録</h3><p><strong>v1の本文確認状態:</strong> ${esc(({verified:'○ 指定範囲を確認',partial:'△ 本文範囲に留保',unverified:'× 本文未確認'})[w.v1_body_status])}<br>v1の92確認・14留保・25未確認と、後発あらすじの92指定・18限定・21保留は別の記録です。</p><p>型ID・判定は旧場面の記録です。v3の条件や意味へ読み替えません。</p>${w.v1_historical_scenes.map(s=>`<p><code>${esc(s.scene_id)}</code><br>${s.type_ids.map(id=>`<span class="type-tag" data-type-group="${esc(id[0])}">${esc(v1Types.get(id)?.name||'')} <small>${esc(id)}</small></span>`).join(' / ')||'型なし'} · 旧判定 ${esc(s.fit)}</p>`).join('')}${link(`./#work=${w.work_id}`,'現行 v1 の場面詳細')}</div>`;}
function judgments(rows){return rows.map(r=>{const t=data.types.find(t=>t.id===r.type_id);return `<details class="judgment" data-type="${r.type_id}" data-type-group="${r.type_id[0]}"><summary><span class="${r.decision==='fit'?'fit':r.decision==='not_fit'?'not-fit':'pending'}">${esc(t.name)} <small>${esc(r.type_id)}</small> · ${decisions[r.decision]}</span></summary><ul class="conditions">${r.required_evidence.map(c=>`<li><strong>${esc(c.condition_id)} · ${states[c.state]}</strong><span class="condition-text">${esc(t.required_conditions.find(x=>x.id===c.condition_id)?.text)}</span><p>${esc(c.reason)}</p><span class="evidence-ref">根拠: ${c.evidence_ids.map(id=>`<a href="#${esc(id.split('-T')[0])}/evidence-${esc(id)}">${esc(id)}</a>`).join(' / ')||'未特定'}</span></li>`).join('')}</ul></details>`;}).join('');}
function newView(w){return `<div class="v3-panel"><h3>v3 条件点検</h3><p>「部分適合」は用いません。全必須条件の根拠が揃う場合だけ成立とし、主型・副型の順位付けは保留しています。閉じ方の案は観測結果とは別です。</p>${w.hold_reason?`<div class="notice"><h3>本文保留</h3><p>${esc(w.hold_reason)}</p></div><h3>A〜E 問題状態</h3>${judgments(w.source_hold_judgments.filter(r=>r.layer==='problem_state'))}<h3>F 世界モデル</h3>${judgments(w.source_hold_judgments.filter(r=>r.layer==='world_model'))}`:w.records.map(rec=>`<article class="record"><h3>${esc(rec.record_id)}</h3><dl><dt>当事者</dt><dd>${esc(rec.actor)}</dd><dt>時点</dt><dd>${rec.timepoints.map(esc).join(' / ')}</dd><dt>証拠の層</dt><dd>${esc(rec.world_layer)}</dd><dt>予期・進行中の損失</dt><dd>${esc(rec.anticipated_loss||'未特定')}</dd><dt>当事者の認識</dt><dd>${esc(rec.recognition_basis)}</dd></dl><p>${esc(rec.selection_reason)}</p><details><summary>選定場面の根拠を読む</summary>${rec.evidence.map(e=>`<div id="evidence-${esc(e.step_id)}"><p><strong>${esc(e.time)}</strong> · ${esc(e.fact_kind)}<br>${esc(e.event)}</p>${e.inherited_event?`<p class="muted">再閲覧による修正: ${esc(e.correction_reason)}<br>以前の要約: ${esc(e.inherited_event)}<br>今回の出典記録: ${e.correction_source_recheck_ids.map(esc).join(' / ')}</p>`:''}<small>${esc(e.step_id)} · 既存本文レビュー ${e.source_review_ids.map(esc).join(' / ')}</small></div>`).join('')}</details><h3>A〜E 問題状態</h3>${judgments(rec.problem_state_records)}<h3>F 世界モデルの前提変更</h3><p>${esc(rec.world_model_evidence.limitation)}</p>${judgments(rec.world_model_records)}<details><summary>Fの記録と代替仮説</summary><dl>${[['old_premise','旧前提'],['new_evidence','新証拠'],['evidence_scope','証拠の範囲'],['acceptance_and_threat','受容・脅威'],['why_local_explanation_insufficient','局所説明では足りない理由']].map(([k,l])=>`<dt>${l}</dt><dd>${esc(rec.world_model_evidence[k]||'未特定')}</dd>`).join('')}</dl><p>${rec.world_model_evidence.alternative_hypotheses.map(h=>`${esc(h.hypothesis)}: ${esc(h.basis)}`).join('<br>')}</p></details><p><strong>観察された閉じ方</strong><br>${esc(rec.closure_observed)}</p><p><strong>残る問題</strong><br>${esc(rec.residue)}</p><p class="muted">${esc(rec.confidence_limit)}</p></article>`).join('')}</div>`;}
function sources(w){return `<details class="panel"><summary>出典・確認範囲・今回の再閲覧</summary><h3>引き継いだ本文レビュー</h3>${w.source_reviews.map(r=>`<p>${link(r.url,r.url)}<br>${esc(r.review_id)} · ${esc(r.accessed_at_utc)}<br>${esc(r.scope)}<br>${esc(r.identity_basis)}</p>`).join('')||'<p>本文レビューなし。</p>'}<h3>今回の再閲覧・検索</h3>${w.targeted_rechecks.map(r=>`<p>${r.url?link(r.url,r.url):esc(r.query)}<br><code>${esc(r.recheck_id)}</code> · ${esc(r.outcome)} · ${esc(r.observed_after_at_utc)}（バッチ完了後の時計）<br>${esc(r.scope)}<br>${esc(r.note)}</p>`).join('')||'<p>今回の新しい直接再閲覧は行っていません。既存本文レビューと時系列による点検です。</p>'}<h3>既存の取得・同定調査</h3>${w.investigation.map(r=>`<p>${r.url?link(r.url,r.url):esc(r.query)}<br>${esc(r.checked_at_utc)} · ${esc(r.outcome)}<br>${esc(r.note)}</p>`).join('')}</details>`;}
function render(w){
  const mode=$('version').value, r2=$('edition').value==='r2';
  const compare=mode==='compare'?(r2?views.comparison(w):`<p class="notice">v1は全旧場面の候補、r1は指定した当事者・時点の選定場面です。未支持の旧候補は保留を含み、作品全体の削除・適合率の差を示しません。</p><p>v1旧候補: ${w.comparison.historical_candidate_type_ids.map(esc).join(' / ')||'なし'}<br>r1選定場面で条件が揃うA〜E: ${w.comparison.v3_supported_problem_type_ids.map(esc).join(' / ')||'未確定'}</p>`):'';
  $('detail').innerHTML=`<a href="#">作品一覧へ戻る</a><h2 id="work-title" tabindex="-1">${esc(w.title)}</h2><p class="edition-label">${coverage[w.inherited_narrative_status]} · ${mode==='v1'?'v1 歴史的記録':r2?'追加調査 r2':'初回 r1'}</p><p><strong>あらすじで確認した掲載範囲</strong><br>${esc(w.scope)}</p><ul class="scope-limit">${w.limitations.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>${r2&&w.summary?`<details class="synopsis-detail"><summary>既存のあらすじを読む</summary><p>${esc(w.summary.opening)}</p><p>${esc(w.summary.development)}</p><p>${esc(w.summary.ending)}</p></details>`:''}<div class="${mode==='compare'?'comparison':''}">${mode!=='v3'?oldView(w):''}${mode!=='v1'?(r2?views.newView(w):newView(w)):''}</div>${compare}${r2?views.sources(w):sources(w)}`;
  document.title=`${w.title} · ${mode} · ${$('edition').value} | 洒落怖恐怖分類`;
}
async function getJSON(path){
  const response=await fetch(path);if(!response.ok)throw new Error('取得失敗');return response.json();
}
async function indexData(edition){
  if(!indexes.has(edition))indexes.set(edition,(async()=>{
    const result=await getJSON(edition==='r2'?'v3/r2/index.json':'v3/index.json');
    if(edition==='r2')validateR2Index(result);
    else if(result.schema_version!=='v3-development-review-1'||result.version!=='v3-development-review-r1'||result.works.length!==131||result.v1_baseline_id!=='fear-patterns-v1-26types')throw new Error('r1版の不一致');
    return result;
  })().catch(error=>{indexes.delete(edition);throw error;}));
  return indexes.get(edition);
}
async function workData(edition,id,index){
  const key=edition+':'+id;
  if(cache.has(key))return cache.get(key);
  let w;
  if(edition==='r2'){
    w=await getJSON(`v3/r2/works/${id}.json`);validateR2Work(w,index,id);
  }else{
    if(!detailRequests.has(edition))detailRequests.set(edition,(async()=>{
      const result=await getJSON('v3/works.json');
      if(result.schema_version!=='v3-work-records-1'||result.version!==index.version)throw new Error('r1データ版の不一致');
      return result.works;
    })().catch(error=>{detailRequests.delete(edition);throw error;}));
    w=(await detailRequests.get(edition))[id];
    if(!w||w.work_id!==id||w.version!==index.version)throw new Error('版・作品の不一致');
  }
  cache.set(key,w);return w;
}
function showEvidence(anchor){
  const node=document.getElementById(anchor);
  if(!node)return false;
  if(node.tagName==='DETAILS')node.open=true;
  let parent=node.parentElement;
  while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}
  node.tabIndex=-1;node.focus();node.scrollIntoView();return true;
}
async function route(focus=true){
  const ticket=++epoch, edition=$('edition').value;
  let raw;try{raw=decodeURIComponent(location.hash.slice(1));}catch{raw='INVALID';}
  const [id,anchor,...extra]=raw.split('/');
  activeWork=null;$('detail').hidden=!id;$('catalogue').hidden=!!id;
  if(id)$('detail').innerHTML='<p role="status">選んだ版の作品を読み込み中…</p>';
  try{
    const index=await indexData(edition);if(ticket!==epoch)return;
    data=index;v1Types=new Map(index.v1_types.map(t=>[t.id,t]));views=edition==='r2'?r2Views(index):null;
    list();editionInfo();
    if(!id){document.title=`${edition==='r2'?'追加調査 r2':'初回 r1'} | 洒落怖恐怖分類`;return;}
    if(extra.length||!data.works.some(w=>w.work_id===id)){
      $('detail').innerHTML='<p class="error" role="alert">作品が見つかりません。</p><a href="#">作品一覧へ戻る</a>';return;
    }
    const work=await workData(edition,id,index);if(ticket!==epoch)return;
    activeWork=work;render(work);
    if(anchor){
      const allowed=edition==='r2'?views.anchors(work).includes(anchor):work.records.some(rec=>rec.evidence.some(e=>'evidence-'+e.step_id===anchor));
      if(!allowed||!showEvidence(anchor)){
        $('detail').innerHTML='<p class="error" role="alert">この版・作品の根拠が見つかりません。</p><a href="#">作品一覧へ戻る</a>';activeWork=null;return;
      }
    }else if(focus)$('work-title').focus();
  }catch{
    if(ticket!==epoch)return;
    $('result-count').textContent='選んだ版のデータを読み込めません。版・作品の整合性と接続を確認してください。';
    $('works').innerHTML='';
    if(id)$('detail').innerHTML='<p class="error" role="alert">作品データを読み込めません。</p><a href="#">作品一覧へ戻る</a>';
  }
}
$('main').tabIndex=-1;
document.querySelector('.skip').addEventListener('click',event=>{event.preventDefault();$('main').focus();});
readControls();
for(const id of ['search','coverage','version','edition'])$(id).addEventListener(id==='search'?'input':'change',()=>{
  saveControls(id!=='search',id==='version'||id==='edition');
  if(id==='search'||id==='coverage'){if(data)list();}
  else route(false);
});
addEventListener('hashchange',()=>route());
addEventListener('popstate',()=>{readControls();route(false);});
route();
