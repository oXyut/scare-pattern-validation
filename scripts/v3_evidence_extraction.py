"""Validate authored r2 body-condition extraction; never fill omitted conditions."""
import argparse
from collections import Counter
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'research/v3-20261011-r2'
STATES = {'supported', 'explicitly_false', 'unknown'}


def read(path):
    return json.loads((ROOT / path).read_text())


def type_records(rec, codebook):
    by_id = {c['condition_id']: c for c in rec['conditions']}
    rows = []
    for t in codebook['types']:
        ids = t['common_required_ids'] + [c['id'] for c in t['required_conditions']]
        states = [by_id[k]['state'] for k in ids]
        result = 'not_fit' if 'explicitly_false' in states else 'fit' if set(states) == {'supported'} else 'pending'
        rows.append(dict(type_id=t['id'], type_name=t['name'], layer=t['layer'], decision=result,
                         required_condition_ids=ids,
                         explicitly_false_condition_ids=[k for k in ids if by_id[k]['state'] == 'explicitly_false'],
                         unknown_condition_ids=[k for k in ids if by_id[k]['state'] == 'unknown']))
    return rows


def validate(data, reviews, narratives, codebook):
    if data['schema_version'] != 'v3-r2-authored-condition-extractions-1' or data['version'] != 'v3-development-review-r2':
        raise ValueError('Wrong extraction schema or research version')
    if data['codebook_id'] != codebook['codebook_id'] or data['partial_allowed'] is not False:
        raise ValueError('Do not change the frozen proposed criteria or allow partial')
    if any(data[k] is not False for k in ('independent_human_coding_performed', 'independent_test_performed')) or data['agreement'] is not None:
        raise ValueError('A reread is not independent coding or measured agreement')
    condition_ids = {c['id'] for c in codebook['common_required']}
    condition_ids.update(c['id'] for t in codebook['types'] for c in t['required_conditions'])
    if len(condition_ids) != 78:
        raise ValueError('The frozen codebook no longer contains 78 distinct conditions')
    works = {w['work_id']: w for w in narratives['works']}
    source_reviews = {r['review_id']: r for r in reviews['reviews']}
    if len(works) != 131 or len(source_reviews) != len(reviews['reviews']):
        raise ValueError('Changed assignment count or duplicate source review ID')
    seen = set()
    records_by_work = Counter()
    judgments = Counter()
    complete_source_works = {r['work_id'] for r in reviews['reviews']
                             if r['status'] == 'full_published_body_reread'}
    if len(complete_source_works) != reviews['fully_rechecked_published_bodies']:
        raise ValueError('Source reading progress disagrees with distinct work count')
    r1_targeted = {r['work_id'] for r in read('research/v3-20261011/source-rechecks.json')['records']}
    remaining_pool = {wid for wid, w in works.items() if w['status'] != 'pending'} - r1_targeted
    newly_reread = complete_source_works & remaining_pool
    if (len(remaining_pool) != 102 or
            reviews['fully_rechecked_of_r1_inherited_102'] != len(newly_reread) or
            reviews['remaining_of_r1_inherited_102'] != len(remaining_pool - newly_reread)):
        raise ValueError('R1 overlap cannot be counted twice in the 102-work reread progress')
    if set(source_reviews[r]['work_id'] for r in source_reviews) - works.keys():
        raise ValueError('Unknown work in source review')
    for rec in data['records']:
        wid = rec['work_id']
        if wid not in works or works[wid]['status'] == 'pending':
            raise ValueError('Cannot invent scenes for unknown or held works')
        rid = rec['record_id']
        if rid in seen or not rid.startswith(wid + '-'):
            raise ValueError('Duplicate or foreign record ID')
        seen.add(rid)
        if not all(rec.get(k) for k in ('actor', 'time_scope', 'selection_reason', 'world_layer', 'limitation')):
            raise ValueError('Actor, time, layer and selected scope are required')
        ev = {e['evidence_id']: e for e in rec['evidence']}
        if len(ev) != len(rec['evidence']) or not ev:
            raise ValueError('Duplicate or missing body evidence')
        for eid, e in ev.items():
            review = source_reviews.get(e['source_review_id'])
            if not eid.startswith(wid + '-') or not review or review['work_id'] != wid:
                raise ValueError('Evidence cannot borrow another work or review')
            allowed_urls = {review['url'], *review.get('additional_urls', [])}
            if e['url'] not in allowed_urls or not all(e.get(k) for k in ('range', 'layer', 'summary')):
                raise ValueError('Evidence URL/range/layer must belong to the inspected source')
        cs = rec['conditions']
        if {c['condition_id'] for c in cs} != condition_ids or len(cs) != len(condition_ids):
            raise ValueError('Every one of the 78 conditions must be authored exactly once')
        if rec.get('authorship_format') == 'explicit_condition_groups':
            authored = {}
            for group in rec.get('condition_review_groups', []):
                for cid in group['condition_ids']:
                    if cid in authored:
                        raise ValueError('Authored condition groups duplicate a condition')
                    authored[cid] = group
            if set(authored) != condition_ids:
                raise ValueError('Authored condition groups must explicitly name all 78 conditions')
            for c in cs:
                g = authored[c['condition_id']]
                if any(g[k] != c[k] for k in ('state', 'reason', 'inspected_evidence_ids')):
                    raise ValueError('Expanded condition differs from its authored condition group')
        for c in cs:
            if c['state'] not in STATES or not c['reason'].strip():
                raise ValueError('Invalid condition state or missing reason')
            if c['inspection'] != 'explicit_body_condition_review':
                raise ValueError('Automatic expansion is not completed extraction')
            if not c['inspected_evidence_ids'] or set(c['inspected_evidence_ids']) - ev.keys():
                raise ValueError('Every authored judgment needs owned inspected evidence')
            if set(c['evidence_ids']) - ev.keys():
                raise ValueError('Foreign evidence ID')
            if c['state'] == 'unknown' and c['evidence_ids']:
                raise ValueError('Unknown does not have established supporting evidence')
            if c['state'] != 'unknown' and not c['evidence_ids']:
                raise ValueError('Supported or false requires explicit evidence')
            judgments[c['state']] += 1
        model = rec['world_model_evidence']
        for key in ('old_premise', 'new_evidence', 'evidence_scope', 'acceptance_and_threat',
                    'why_local_explanation_insufficient', 'alternative_hypotheses', 'limitation'):
            if key not in model or not model[key]:
                raise ValueError('F needs actual extracted fields and explicit limitations')
        for t in type_records(rec, codebook):
            judgments['type_' + t['decision']] += 1
        records_by_work[wid] += 1
    if set(works) != set(data['work_progress']):
        raise ValueError('Progress must cover the same 131 assignment IDs')
    completed = set()
    for wid, p in data['work_progress'].items():
        if p['inherited_narrative_status'] != works[wid]['status']:
            raise ValueError('Inherited narrative coverage changed')
        actual = records_by_work[wid]
        if p['completed_records'] != actual:
            raise ValueError('Record completion count differs from authored input')
        if p['condition_extraction_status'] == 'selected_records_complete':
            if not actual or wid not in complete_source_works:
                raise ValueError('Completed extraction requires authored records and full specified source reread')
            completed.add(wid)
        elif p['condition_extraction_status'] not in ('unextracted', 'source_hold') or actual:
            raise ValueError('Unextracted work cannot be counted as reviewed')
        if works[wid]['status'] == 'pending' and p['condition_extraction_status'] != 'source_hold':
            raise ValueError('Source hold must be kept distinct')
    if reviews['stage'] == 'selected_scope_review_complete' and completed != {wid for wid, w in works.items() if w['status'] != 'pending'}:
        raise ValueError('Final selected-scope coverage must include every non-held work')
    return dict(assigned_entries=len(works), fully_rechecked_published_bodies=len(complete_source_works),
                fully_rechecked_of_r1_inherited_102=len(newly_reread),
                remaining_of_r1_inherited_102=len(remaining_pool - newly_reread),
                condition_extraction_complete_works=len(completed), selected_records=sum(records_by_work.values()),
                distinct_conditions_per_record=len(condition_ids), explicitly_inspected_condition_judgments=sum(judgments[s] for s in STATES),
                condition_states={s: judgments[s] for s in sorted(STATES)},
                type_record_states={s: judgments['type_' + s] for s in ('fit', 'not_fit', 'pending')},
                inherited_narrative_counts=dict(Counter(w['status'] for w in works.values())))


def validate_identity(rechecks, narratives, reviews):
    expected = {w['work_id']: w for w in narratives['works'] if w['status'] in ('scoped', 'pending')}
    actual = {w['work_id']: w for w in rechecks['works']}
    if len(actual) != len(rechecks['works']) or actual.keys() != expected.keys():
        raise ValueError('Identity rechecks must preserve the 18 scoped and 21 held entries')
    sources = {r['review_id']: r for r in reviews['reviews']}
    statuses = {'not_rechecked', 'batch_search_inspected_unresolved', 'specified_published_body_reread_unresolved'}
    for wid, record in actual.items():
        inherited = expected[wid]
        for field, original in [('inherited_status', 'status'), ('inherited_scope', 'scope'),
                                ('inherited_limitations', 'limitations')]:
            if record[field] != inherited[original]:
                raise ValueError('Identity recheck cannot alter inherited coverage or limitations')
        status = record['r2_identity_review_status']
        if status not in statuses or 'status' in record or record['resolution'] != 'unchanged':
            raise ValueError('Identity progress uses one status field and does not invent resolution')
        if status == 'specified_published_body_reread_unresolved':
            if not record.get('source_review_ids') or not record.get('note'):
                raise ValueError('Scoped reread needs a source and remaining identity limitation')
            for rid in record['source_review_ids']:
                if rid not in sources or sources[rid]['work_id'] != wid or sources[rid]['status'] != 'full_published_body_reread':
                    raise ValueError('Identity reread needs its own fully read specified source')
    return Counter(w['r2_identity_review_status'] for w in actual.values())


def results(data, reviews, narratives, codebook, correspondence):
    counts = validate(data, reviews, narratives, codebook)
    old_works = {}
    for path in sorted((ROOT / 'groups').glob('*/data/mappings.json')):
        for w in json.loads(path.read_text())['works']:
            old_works[w['work_id']] = w
    by_work = {}
    by_id = {}
    for rec in data['records']:
        by_work.setdefault(rec['work_id'], []).append(rec)
        by_id[rec['record_id']] = rec
    seen = set()
    for match in correspondence['records']:
        wid, sid = match['work_id'], match['scene_id']
        key = (wid, sid)
        if key in seen or wid not in old_works or sid not in {s['scene_id'] for s in old_works[wid]['scenes']}:
            raise ValueError('Duplicate or unknown historical scene')
        seen.add(key)
        if any(rid not in by_id or by_id[rid]['work_id'] != wid for rid in match['record_ids']):
            raise ValueError('Comparison cannot borrow a different work or record')
        if match['relation'] not in ('same_actor_time_scope', 'overlapping_scope', 'not_reviewed_in_r2') or not match['reason']:
            raise ValueError('Comparison must state actor/time/scope correspondence')
        if bool(match['record_ids']) == (match['relation'] == 'not_reviewed_in_r2'):
            raise ValueError('Unreviewed historical scope cannot have a linked judgment')
    if reviews['stage'] == 'selected_scope_review_complete':
        expected = {(wid, s['scene_id']) for wid, w in old_works.items()
                    if by_work.get(wid) for s in w['scenes']}
        if seen != expected:
            raise ValueError('Final comparison must map every historical scene of non-held works')
    works = []
    for n in narratives['works']:
        wid = n['work_id']
        recs = [dict(record_id=r['record_id'], actor=r['actor'], time_scope=r['time_scope'],
                     world_layer=r['world_layer'], selection_reason=r['selection_reason'],
                     anticipated_loss=r['anticipated_loss'], recognition_basis=r['recognition_basis'],
                     type_records=type_records(r, codebook), world_model_evidence=r['world_model_evidence'],
                     closure_observed=r['closure_observed'], limitation=r['limitation'],
                     condition_evidence_location='condition-extractions.json#' + r['record_id']) for r in by_work.get(wid, [])]
        comparisons = []
        for scene in old_works[wid]['scenes']:
            match = next((m for m in correspondence['records'] if m['scene_id'] == scene['scene_id']), None)
            held = n['status'] == 'pending'
            changes = []
            if match:
                for rid in match['record_ids']:
                    decisions = {t['type_id']: t['decision'] for t in type_records(by_id[rid], codebook)}
                    old_ids = scene['type_ids']
                    changes.append(dict(record_id=rid,
                                        historical_ids_with_v3_required_condition_result={tid: decisions[tid] for tid in old_ids},
                                        v3_fit_ids_outside_historical_candidates=[tid for tid, state in decisions.items() if state == 'fit' and tid not in old_ids],
                                        caution='型IDの一致は意味・基準の同一性を示さない。旧場面の型をコピーせずv3必須条件を別判定。重複範囲の差は作品全体の型の削除・追加としない。'))
            comparisons.append(dict(scene_id=scene['scene_id'], historical_type_ids=scene['type_ids'], historical_scene_fit=scene['fit'],
                                    relation=match['relation'] if match else 'source_hold' if held else 'not_mapped_for_comparison',
                                    record_ids=match['record_ids'] if match else [],
                                    reason=match['reason'] if match else '本文・作品同定保留のためv3場面を捏造せず、継承した保留理由を保持。' if held else '追加調査の場面対応は未記入。未抽出を不成立・保留の条件判断へ変換しない。',
                                    selected_scope_differences=changes))
        works.append(dict(work_id=wid, title=old_works[wid]['title'], inherited_narrative_status=n['status'],
                          progress=data['work_progress'][wid], inherited_scope=n['scope'], inherited_limitations=n['limitations'],
                          inherited_reason=n.get('reason'), inherited_reason_codes=n.get('reason_codes', []),
                          r2_source_reviews=[r for r in reviews['reviews'] if r['work_id'] == wid], selected_records=recs,
                          v1_comparisons=comparisons))
    return dict(schema_version='v3-r2-selected-record-results-1', version=data['version'], codebook_id=data['codebook_id'],
                stage=reviews['stage'], count_unit=data['count_unit'], counts=counts,
                independent_human_coding_performed=False, independent_test_performed=False, agreement=None,
                comparison_caution='旧候補は旧場面全体、新しい判定は指定当事者・時点。未抽出・条件保留・明示的不成立を分ける。対応が異なる範囲を含む候補の差を作品全体の削除と扱わない。',
                works=works)


def report(result):
    c = result['counts']
    lines = ['# v3追加調査 r2（全131割当の選定範囲・保留を記録）', '',
             f"掲載本文全体の再読{c['fully_rechecked_published_bodies']}件。選定場面の条件抽出{c['condition_extraction_complete_works']}作品・{c['selected_records']}記録、各78条件・{c['explicitly_inspected_condition_judgments']}判断。",
             '131割当のうち110作品は選定記録の全条件を本文と照合し、21作品は理由付き本文・同定保留を維持した。未処理作品は0。継承した92指定本文・18限定範囲・21保留を変更しない。確認範囲は指定掲載版で、作品の全場面・原投稿一致・シリーズ全体の完了ではない。', '',
             f"根拠あり{c['condition_states']['supported']}、明示的不成立{c['condition_states']['explicitly_false']}、点検済み証拠不明{c['condition_states']['unknown']}。型×記録では成立{c['type_record_states']['fit']}、明示的不成立{c['type_record_states']['not_fit']}、保留{c['type_record_states']['pending']}。これらを作品数・独立評価数として数えない。", '',
             '初回の355明示判断へ加算しない。共通条件・対象・記録の数え方が異なり、同じ根拠を再点検している。単一AI・非盲検の開発資料点検で、独立符号化・一致度・効果測定は行っていない。', '',
             '## 選定記録の結果', '',
             '| 作品・当事者 | 条件が揃う型 | 明示的不成立の型 | 保留数 | 選定範囲と限界 |',
             '| --- | --- | --- | --- | --- |']
    def cell(s):
        return str(s).replace('|', '\\|').replace('\n', ' ')
    for w in result['works']:
        for r in w['selected_records']:
            fits = [t['type_id'] + ' ' + t['type_name'] for t in r['type_records'] if t['decision'] == 'fit']
            negatives = [t['type_id'] for t in r['type_records'] if t['decision'] == 'not_fit']
            pending = sum(t['decision'] == 'pending' for t in r['type_records'])
            lines.append('| ' + ' | '.join(map(cell, [w['title'] + '／' + r['actor'], ' / '.join(fits) or '未確定',
                                                    ' / '.join(negatives) or 'なし（陰性の意味ではない）', pending,
                                                    r['time_scope'] + ' ' + r['limitation']])) + ' |')
    lines += ['', '主型・副型とも必須条件を緩和せず、中心性の順位は未固定。部分適合は用いない。型が揃わない記録を全般的な陰性へ置換しない。', '',
              '## 本文・同定保留21作品', '',
              '| 作品 | 継承した具体的な保留理由 |',
              '| --- | --- |']
    for w in result['works']:
        if w['inherited_narrative_status'] == 'pending':
            lines.append('| ' + cell(w['title']) + ' | ' + cell(w['inherited_reason']) + ' ' + cell(' / '.join(w['inherited_limitations'])) + ' |')
    lines += ['', '## 場面対応と根拠', '',
              '[条件別の著者入力](condition-extractions.json)、[場面対応の著者入力](scene-correspondences.json)、[全131割当の進捗・結果](selected-record-results.json)に記録する。',
              '本文確認110作品の旧237場面すべてについて、同一当事者・時点の対応、範囲の重なり、未抽出の区分を記入した。対応する記録には旧候補IDごとのv3条件結果と旧候補外の成立IDを保存する。本文保留21作品の旧場面はsource_holdで、型別の不成立には置換しない。',
              '八尺様の夜と搬送は別の当事者×時点記録。十年後の地蔵の管理は本文を再読したが、別記録の全条件抽出は未完了。ナール・ナーシュの相談時に後のYの死亡を予期したとは扱わない。',
              'E1・E5・Fの論点は [boundary-questions.md](boundary-questions.md)。基準変更を採用せず、Fの局所的な旧前提・新証拠・受容と、一般化の不足を実記入する。', '',
              '## 保存と確認', '',
              'v1、92指定本文・18限定範囲・21保留、公開済みr1、現行UIを保持する。追加調査はPR #24の別ブランチ。UI共通カラー・上位分類グループ化は別セッションの担当。',
              '機械検査の結果は [validation.md](validation.md)。r1公開の根拠と直接HTTP未確認は [r1-publication.json](r1-publication.json)。']
    return '\n'.join(lines) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    validate_identity(read('research/v3-20261011-r2/identity-rechecks.json'),
                      read('site/narratives.json'), read('research/v3-20261011-r2/source-checks.json'))
    result = results(read('research/v3-20261011-r2/condition-extractions.json'),
                     read('research/v3-20261011-r2/source-checks.json'), read('site/narratives.json'),
                     read('followup/classification/v3-codebook.json'), read('research/v3-20261011-r2/scene-correspondences.json'))
    output = {'extraction-counts.json': json.dumps(result['counts'], ensure_ascii=False, indent=2) + '\n',
              'selected-record-results.json': json.dumps(result, ensure_ascii=False, indent=2) + '\n',
              'report.md': report(result)}
    for name, content in output.items():
        path = DIR / name
        if args.check:
            if path.read_text() != content:
                raise ValueError('Extraction output is stale: ' + name)
        else:
            path.write_text(content)
    print(json.dumps(result['counts'], ensure_ascii=False))


if __name__ == '__main__':
    main()
