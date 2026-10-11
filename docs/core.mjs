export const statusLabels = {verified:'指定範囲を確認',partial:'範囲・作品一致に留保',unverified:'対象本文に未到達'};
// Display annotations for the original v1 result. Never upgrade v1 from later readings.
// Evidence: each work's mappings.json, report.md and ledger.csv at data.source_revision.
const unreachedResults = {
  'G01-W05':['作品特定不可','顔のある少女・成人女性の比較本文は読めたが、題名の少女と一致する根拠がない。'],
  'G01-W06':['作品特定不可','名称への言及は見つかったが、怪談本文と元の投稿を特定できなかった。'],
  'G01-W11':['作品特定不可','「坂の上の女」の本文などを比較したが、指定題名との同一性は確認できなかった。'],
  'G01-W13':['作品特定不可','名称一覧・言及にとどまり、発端から結末までの本文を特定できなかった。'],
  'G01-W20':['作品特定不可','名称一覧や別作品の候補はあるが、調査対象の本文を特定できなかった。'],
  'G01-W27':['作品特定不可','題名を検索したが、調査対象として一致する本文を特定できなかった。'],
  'G02-W03':['作品特定不可','表記違いも調べたが、伝承・図像と区別できる対象の怪談本文は未同定。'],
  'G02-W08':['作品特定不可','軽自動車・満員というモチーフを調べたが、題名と本文の対応は未同定。'],
  'G02-W12':['作品特定不可','同名の検索断片はあるが、指定された怪談の本文とは確認できなかった。'],
  'G02-W13':['作品特定不可','名称情報にとどまり、対象の本文と元の投稿URLを特定できなかった。'],
  'G02-W16':['作品特定不可','題名の揺れや特徴を検索したが、対象の本文を特定できなかった。'],
  'G03-W03':['作品特定不可','二次紹介の検索断片はあるが、独立した対象作品の全編・原版は未同定。'],
  'G03-W09':['作品特定不可','名称・画像の候補にとどまり、怪談本文として確認できなかった。'],
  'G03-W10':['候補本文取得不可','Fandomの候補ページを取得できず、題名の表記違いも調べたが対象本文は未同定。'],
  'G03-W14':['作品特定不可','雲・鳥居・創作などの検索候補と区別できる対象本文を特定できなかった。'],
  'G03-W16':['作品特定不可','能力名などの別分野の候補はあるが、対象の怪談本文は未同定。'],
  'G03-W19':['作品特定不可','動画の題名・概要にとどまり、本文や字幕を取得して作品を照合できなかった。'],
  'G03-W21':['作品特定不可','題名を調べたが、怪談本文を特定できず、内容・結末は確認できなかった。'],
  'G03-W24':['作品特定不可','対象の本文は未同定。似た題名だけでは同じ作品として扱えない。'],
  'G04-W01':['作品特定不可','書誌や後発の同名台本の候補はあるが、調査対象との同一性は確認できなかった。'],
  'G04-W02':['作品特定不可','「紅い石段」などの候補はあるが、指定題名との同一性は確認できなかった。'],
  'G04-W20':['候補本文取得不可','同名候補は取得時に502エラーとなり、対象作品の全編と同一性は確認できなかった。'],
  'G05-W04':['作品特定不可','題名や特徴を検索したが、対象本文と出典URLを特定できなかった。'],
  'G05-W21':['作品特定不可','名称一覧や別分野の候補にとどまり、対象の怪談本文を特定できなかった。'],
  'G05-W26':['作品特定不可','用語集が示す投稿先などを探したが、題名に一致する本文を特定できなかった。']
};
export function readingResult(work) {
  const base={scope:work.episode_scope||'確認範囲の記録なし'};
  if(work.body_status==='verified')return {...base,rank:0,symbol:'○',label:statusLabels.verified,outcome:'指定した掲載範囲を読了',reason:'確認範囲：'+base.scope,attempt:'本文読了の記録あり'};
  if(work.body_status==='partial')return {...base,rank:1,symbol:'△',label:statusLabels.partial,outcome:'一部範囲・比較候補のみ',reason:base.scope,attempt:'限定した本文読了の記録あり'};
  const found=unreachedResults[work.work_id];
  if(work.body_status==='unverified'&&found)return {...base,rank:2,symbol:'×',label:statusLabels.unverified,outcome:found[0],reason:found[1],attempt:'検索・取得などを試行した記録あり'};
  return {...base,rank:3,symbol:'□',label:'結果の記録不足',outcome:'到達結果を判別できず',reason:'既存資料だけでは確認結果を判別できません。',attempt:'試行結果の記録不足'};
}
export function narrativeReadingResult(n) {
  if(n.status==='ready')return {symbol:'○',label:'掲載範囲を確認',reason:n.scope};
  if(n.status==='scoped')return {symbol:'△',label:'一部範囲・候補を確認',reason:n.scope};
  // The failed game-forum candidate for 死なず舞妓 is unrelated to an identified horror text.
  const relevantFailures=new Set(['G03-W09','G03-W10','G03-W19','G04-W02','G04-W20','G05-W26']);
  const failed=relevantFailures.has(n.work_id)&&n.investigation.some(a=>/fetch_failed|access_failed|retrieval_failed/.test(a.outcome));
  return {symbol:'×',label:failed?'候補本文取得不可・同定留保':'作品・範囲を特定できず',reason:n.reason};
}
export function sortWorks(works, order='result') {
  if(order==='original')return [...works];
  const collator=new Intl.Collator('ja',{numeric:true});
  return [...works].sort((a,b)=>(order==='title'?0:readingResult(a).rank-readingResult(b).rank)||collator.compare(a.title,b.title)||a.work_id.localeCompare(b.work_id));
}
export function recordCounts(scenes) {
  const holds=scenes.filter(s=>s.fit==='本文不足').length;
  return {scenes:scenes.length-holds,holds,total:scenes.length};
}
// The source IDs and four analytical axes remain unchanged. Only prose is expanded.
export const axisLabels = {Q:'問い（分かっていないこと）',D:'危険（予期される損失）',C:'選択（選べる行動と条件）',M:'世界モデル（安全・自己・因果などへの前提）'};
const axisNames = {Q:'問い',D:'危険',C:'選択',M:'世界モデル'};
const proposalNames={'G01-N01':'迫る直接加害','G01-N02':'秘密・脆弱さが公に露見する','G02-N01':'順番・手続による直接加害の到来','G02-N02':'社会的正常性の不透明さ','G03-N01':'身体外面への付着・切り離せない','G03-N02':'現在の追跡が観測されていない加害者への再加害予期','G04-N01':'標的情報を知られている','G04-N02':'突然の直接加害への対処'};
export function readerText(value, vocabulary) {
  let text=String(value??'').replace(/(?:担当群|群別|各群|全群|他群|群間)/g,word=>({担当群:'担当',群別:'資料別',各群:'各資料',全群:'記録全体',他群:'別資料',群間:'資料間'}[word])).replace(/群0[1-5](?:–0[1-5])?/g,'調査資料');
  text=text.replace(/G0[1-4]-N0[12]/g,id=>'未採用の候補「'+proposalNames[id]+'」');
  text=text.replace(/(?:FU-)?G\d{2}-(?:W\d{2}(?:-S(?:C)?\d{2})?(?:-[QDCM])?|S\d{3})(?![A-Za-z0-9_-])/g,raw=>{
    const suffix=/-([QDCM])$/.exec(raw),id=suffix?raw.slice(0,-2):raw;
    const work=vocabulary.works?.find(w=>w.work_id===id);
    if(work)return '「'+work.title+'」';
    const owner=vocabulary.works?.find(w=>w.scenes.some(s=>s.scene_id===id));
    if(owner)return '「'+owner.title+'」の場面'+(owner.scenes.findIndex(s=>s.scene_id===id)+1)+(suffix?'の'+axisNames[suffix[1]]:'');
    const source=vocabulary.sources?.find(s=>s.source_id===id);
    if(source){const title=vocabulary.works.find(w=>w.work_id===source.work_id)?.title;return '「'+title+'」の出典'+(vocabulary.sources.filter(s=>s.work_id===source.work_id).findIndex(s=>s.source_id===id)+1);}
    return '参照資料';
  });
  for(const type of vocabulary.types){
    text=text.replaceAll(type.id+'「'+type.name+'」','「'+type.name+'」');
  }
  text=text.replace(/(?<![A-Za-z0-9_-])([A-F][1-5])(?![A-Za-z0-9_-])/g,(id)=>{
    const type=vocabulary.types.find(t=>t.id===id);return type?'「'+type.name+'」':id;
  }).replace(/(?<![A-Za-z0-9_-])([A-F])群/g,(whole,id)=>{
    const group=vocabulary.type_groups.find(g=>g.id===id);return group?'「'+group.name+'」の分類':whole;
  });
  // C is also a person's initial in two stories. Those literal references are not axes.
  const personC=/Cだけ|Cの(?:反応|再訪|死亡|死|損失|別の再接触)|(?:音源は何で、|トンネルでも雨音が続き、|救助する)C|Cにも接触/.test(text);
  for(const [id,name] of Object.entries(axisNames))text=text.replaceAll(name+id,name);
  return text.replace(/(?<![A-Za-z0-9_-])[QDCM](?![A-Za-z0-9_-]|子)/g,id=>id==='C'&&personC?id:axisNames[id]);
}
export function shortSynopsis(narrative) {
  if(!narrative||narrative.status==='pending')return '';
  // Independent candidates must not read as consecutive events in a single story.
  const independentSummaries={
    'G01-W09':'独立した二つの話。第2話では白いものを見た兄の様子が変わり、弟は再び見た後の経過が書かれない。第3話では遠くの白いものを見た子が搬送され、後年、休学したと伝え聞く。',
    'G03-W25':'第1話では家の異変に儀式で対処する。別の第15話では語り手と弟子が禁山で妖怪との取り決めを更新し、下山後に弟子が語り手を追う影を見た気がしたと話す。二話の間の経過やシリーズ全体は未確認。',
    'G04-W09':'独立した二つの候補。学校を徘徊する少女は教師には見えず、親に迎えられて下校した児童は十八年後も正体を知らない。別の話では一部の生徒だけが呼び出しを聞くが、呼び出し先へ行かず、母親も無事だった。',
    'G04-W12':'「降霊実験」「壷」の二篇のみ。前者では語り手が想像した家から抜けられなくなり、第三者の介入で戻る。後者では壷の周囲で異常を感じて逃げ、師匠は連れ戻される。シリーズ全体の結末は未確認。',
    'G05-W23':'教師Uが登場する独立した二つの候補。「光の誓い」では儀式の後に子供の不調が続き、教師は消える。「幽霊が出る部屋」では見えない児童がいる一方、教師と多くの子供が逃げる。'
  };
  if(independentSummaries[narrative.work_id])return independentSummaries[narrative.work_id];
  // Extract complete sentences from each part; never cut a negation or invent an ending.
  return ['opening','development','ending'].map(key=>{
    const text=narrative.summary[key];const end=text.indexOf('。');return end<0?text:text.slice(0,end+1);
  }).join('');
}
export const normalise = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ja').replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0)-0x60));
const trackingText = work => [
  ...(work.target_outcomes || []).flatMap(row=>[row.target,row.Q,row.D,row.C,row.M]),
  ...(work.problem_tracking || []).flatMap(row=>[row.target,row.outcome,row.unresolved,row.transition]),
  work.outcome_tracking?.confirmed_or_reported_outcome, work.outcome_tracking?.unresolved_targets,
  ...[...(work.transitions || []),...(work.outcome_tracking?.transitions || [])].flatMap(row=>[row.retained_problem,row.closure_audit])
];
export function searchText(work) {
  const n=work.narrative;
  const narrativeText=n?[n.scope,n.reason,...Object.values(n.summary||{}),...n.threads.flatMap(t=>t.steps.flatMap(s=>[s.title,s.event,...s.fears.flatMap(f=>[f.fear,f.basis])]))]:[];
  return normalise([work.title,work.work_id,...(work.type_names||[]),...(work.type_group_names||[]),work.episode_scope,work.alias_or_derivative,work.overall_fears,work.unexplained_residue,work.counterexamples,...trackingText(work),...narrativeText,...work.scenes.flatMap(s=>[s.evidence_summary,s.Q,s.D,s.C,s.M,s.discriminators,s.residue,s.outcomes,...(s.transitions||[])])].join(' '));
}
export function matchingScenes(work, filters) {
  return work.scenes.filter(s=>(!filters.type || (filters.type==='none'?s.type_ids.length===0:s.type_ids.includes(filters.type))) && (!filters.fit || s.fit===filters.fit));
}
export function filterWorks(works, filters={}) {
  const terms=normalise(filters.q).trim().split(/\s+/u).filter(Boolean);
  return works.filter(w=>(!filters.status||w.body_status===filters.status) && terms.every(t=>searchText(w).includes(t)) && matchingScenes(w,filters).length>0);
}

// Resolve every detail URL against the data, regardless of the previously rendered work.
export function resolveRoute(data, fragment) {
  let anchor;
  try {anchor=decodeURIComponent(fragment.replace(/^#/,''));}
  catch {return {kind:'invalid'};}
  const match=/^(work=|work-sources-|reading-result-|source-|scene-)(.*)$/su.exec(anchor);
  if (!match) return {kind:'report',anchor};
  const [,prefix,id]=match;
  const resource={ 'work=':'work', 'work-sources-':'work', 'reading-result-':'work', 'source-':'source', 'scene-':'scene' }[prefix];
  let work;
  if(resource==='work') work=data.works.find(w=>w.work_id===id);
  if(resource==='scene') work=data.works.find(w=>w.scenes.some(s=>s.scene_id===id));
  if(resource==='source') {
    const source=data.sources.find(s=>s.source_id===id);
    if(source) work=data.works.find(w=>w.work_id===source.work_id);
  }
  return work ? {kind:'work',work,anchor:prefix==='work='?'work-title':anchor} : {kind:'missing',resource};
}
