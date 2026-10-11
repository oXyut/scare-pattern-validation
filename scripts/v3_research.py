"""Expand authored condition judgments; never infer v3 labels from v1 labels."""
import argparse
from collections import Counter
from datetime import datetime
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / 'research/v3-20261011'
STATES = {'supported', 'explicitly_false', 'unknown'}


def read(path):
    return json.loads((ROOT / path).read_text())


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


def verify_inputs(root=ROOT):
    manifest = json.loads((root / 'research/v3-20261011/inputs.json').read_text())
    for name, expected in manifest['files'].items():
        actual = hashlib.sha256((root / name).read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError(f'Frozen research input changed: {name}')
    return manifest


def decision(conditions):
    states = [c['state'] for c in conditions]
    if not states or any(s not in STATES for s in states):
        raise ValueError('Invalid or empty condition states')
    if 'explicitly_false' in states:
        return 'not_fit'
    return 'fit' if all(s == 'supported' for s in states) else 'pending'


def expand(note, narrative, codebook, ordinal):
    work_id = note['work_id']
    all_steps = {s['step_id']: s for t in narrative['threads'] for s in t['steps']}
    steps = [all_steps[work_id + '-T' + suffix] for suffix in note['steps']]
    evidence_ids = [s['step_id'] for s in steps]
    corrections = note.get('evidence_corrections', {})
    if set(corrections) - set(evidence_ids):
        raise ValueError(f'{work_id}: corrected evidence must belong to the selected record')
    selected_evidence = []
    for s in steps:
        item = {k: s[k] for k in ('step_id', 'time', 'event', 'fact_kind', 'source_review_ids')}
        if s['step_id'] in corrections:
            correction = corrections[s['step_id']]
            if not correction['event'] or not correction['reason'] or not correction['recheck_ids']:
                raise ValueError(f'{work_id}: correction lacks actual rereading provenance')
            item.update(inherited_event=s['event'], event=correction['event'],
                        correction_reason=correction['reason'], correction_source_recheck_ids=correction['recheck_ids'])
        selected_evidence.append(item)
    conditions = {c['id']: c['text'] for c in codebook['common_required']}
    conditions.update({c['id']: c['text'] for t in codebook['types'] for c in t['required_conditions']})
    overrides = note['conditions']
    if set(overrides) - set(conditions):
        raise ValueError(f'{work_id}: unknown condition ID')
    if note['problem_supported'] and (not note['loss'] or not note['recognition']):
        raise ValueError(f'{work_id}: problem lacks loss/recognition')
    if not note['actor'] or not steps or not note['residual']:
        raise ValueError(f'{work_id}: actor, selected evidence and limitation required')
    common = {}
    for key in ('AE.G1', 'AE.G2'):
        common[key] = ['supported' if note['problem_supported'] else 'unknown',
                       (f"当事者: {note['actor']}。時点: {' / '.join(s['time'] for s in steps)}。"
                        f"損失: {note['loss'] or '未特定'}。" if key == 'AE.G1' else note['recognition'])]
    rows = []
    for t in codebook['types']:
        required_ids = t['common_required_ids'] + [c['id'] for c in t['required_conditions']]
        evidence = []
        for key in required_ids:
            default = ['unknown', 'この選定範囲では条件の根拠を確定できない。記録の残る問題・確認範囲を参照。']
            state, reason = overrides.get(key, common.get(key, default))
            if state not in STATES or not isinstance(reason, str) or not reason.strip():
                raise ValueError(f'{work_id}: invalid evidence {key}')
            evidence.append(dict(condition_id=key, state=state, reason=reason,
                                 evidence_ids=evidence_ids if state != 'unknown' else [],
                                 inspected_evidence_ids=evidence_ids,
                                 evidence_layer=note['world_layer']))
        fit = decision(evidence)
        if fit == 'fit' and t['layer'] == 'problem_state' and (not note['loss'] or not note['recognition']):
            raise ValueError(f'{work_id}: positive problem lacks loss/recognition')
        rows.append(dict(type_id=t['id'], layer=t['layer'], decision=fit,
                         role='unranked' if fit == 'fit' and t['layer'] == 'problem_state' else None,
                         required_evidence=evidence,
                         unresolved_condition_ids=[c['condition_id'] for c in evidence if c['state'] == 'unknown'],
                         explicitly_false_condition_ids=[c['condition_id'] for c in evidence if c['state'] == 'explicitly_false']))
    world_model = {
        'old_premise': None, 'new_evidence': None,
        'evidence_scope': f"{narrative['scope']} / {note['actor']} / {' / '.join(s['time'] for s in steps)}",
        'acceptance_and_threat': None, 'why_local_explanation_insufficient': None,
        'alternative_hypotheses': [dict(hypothesis='局所的な出来事・伝聞・夢・記憶や語りの誤り',
                                        status='unresolved', basis=note['residual'])],
        'limitation': '世界／人間一般への旧前提・変更・受容の根拠は未特定。F欄の欠測は全般的な陰性の証明ではない。'
    }
    world_model.update(note.get('world_model_evidence', {}))
    if any(r['decision'] == 'fit' and r['layer'] == 'world_model' for r in rows):
        if not all(world_model[k] for k in ('old_premise', 'new_evidence', 'evidence_scope',
                                             'acceptance_and_threat', 'why_local_explanation_insufficient', 'alternative_hypotheses')):
            raise ValueError(f'{work_id}: positive F lacks separated model evidence')
    return dict(record_id=f'{work_id}-V3-R{ordinal:02}', actor=note['actor'],
                world_layer=note['world_layer'], timepoints=[s['time'] for s in steps],
                selection_reason='当事者・時点・世界層を分け、具体的な問題または境界の不足を点検する。全場面網羅の抽出ではない。',
                evidence=selected_evidence,
                anticipated_loss=note['loss'], recognition_basis=note['recognition'],
                problem_state_records=[r for r in rows if r['layer'] == 'problem_state'],
                world_model_records=[r for r in rows if r['layer'] == 'world_model'],
                world_model_evidence=world_model, closure_observed=note['closure_observed'],
                residue=note['residual'], confidence='limited_single_ai_review',
                confidence_limit='本文の新しい独立全編読解ではない。既存本文レビューに基づく時系列を使用し、直接再閲覧の箇所は別の出典記録へ。')


def build(pilot=False):
    manifest = verify_inputs()
    codebook = read('followup/classification/v3-codebook.json')
    narratives = read('site/narratives.json')['works']
    original = {}
    for path in sorted((ROOT / 'groups').glob('*/data/mappings.json')):
        for w in json.loads(path.read_text())['works']:
            original[w['work_id']] = w
    notes = read('research/v3-20261011/review-notes.json')['records']
    rechecks = read('research/v3-20261011/source-rechecks.json')['records']
    by_work = {}
    for note in notes:
        owned_rechecks = {r['recheck_id'] for r in rechecks if r['work_id'] == note['work_id'] and r['outcome'] == 'targeted_body_reread'}
        if any(set(c['recheck_ids']) - owned_rechecks for c in note.get('evidence_corrections', {}).values()):
            raise ValueError('Correction cannot borrow a different work rereading')
        by_work.setdefault(note['work_id'], []).append(note)
    if set(by_work) - set(original):
        raise ValueError('Unknown assignment in authored notes')
    if {r['work_id'] for r in rechecks} - set(original):
        raise ValueError('Unknown assignment in targeted rechecks')
    if len({r['recheck_id'] for r in rechecks}) != len(rechecks):
        raise ValueError('Duplicate targeted recheck ID')
    for r in rechecks:
        if not r['observed_after_at_utc'].endswith('Z') or not datetime.fromisoformat(r['observed_after_at_utc'][:-1] + '+00:00'):
            raise ValueError('Targeted recheck needs UTC observation time')
    counts = Counter(w['status'] for w in narratives)
    if dict(counts) != manifest['narrative_counts']:
        raise ValueError('Inherited 92 / 18 / 21 coverage changed')
    works = []
    for n in narratives:
        work_id = n['work_id']
        old = original[work_id]
        if n['status'] != 'pending' and work_id not in by_work:
            if pilot:
                continue
            raise ValueError(f'{work_id}: authored review missing')
        if n['status'] == 'pending' and work_id in by_work:
            raise ValueError(f'{work_id}: source hold cannot have invented scenes')
        records = [expand(note, n, codebook, i) for i, note in enumerate(by_work.get(work_id, []), 1)]
        v1 = [dict(scene_id=s['scene_id'], type_ids=s['type_ids'], fit=s['fit']) for s in old['scenes']]
        fits = sorted({r['type_id'] for rec in records for r in rec['problem_state_records'] if r['decision'] == 'fit'})
        historical_labels = sorted({t for s in v1 for t in s['type_ids']})
        held = []
        if not records:
            for t in codebook['types']:
                ids = t['common_required_ids'] + [c['id'] for c in t['required_conditions']]
                held.append(dict(type_id=t['id'], layer=t['layer'], decision='pending', required_evidence=[
                    dict(condition_id=key, state='unknown', reason=n['reason'], evidence_ids=[],
                         inspected_evidence_ids=[], evidence_layer='unavailable') for key in ids]))
        works.append(dict(work_id=work_id, title=old['title'], version='v3-development-review-r1',
                          coverage_status='source_hold' if not records else 'selected_scene_review',
                          inherited_narrative_status=n['status'], v1_body_status=old['body_status'],
                          scope=n['scope'], limitations=n['limitations'],
                          source_reviews=n['source_reviews'], investigation=n['investigation'],
                          targeted_rechecks=[r for r in rechecks if r['work_id'] == work_id],
                          records=records, source_hold_judgments=held,
                          hold_reason=n['reason'] if not records else None,
                          v1_historical_scenes=v1,
                          comparison=dict(historical_candidate_type_ids=historical_labels,
                                          v3_supported_problem_type_ids=fits,
                                          historical_labels_not_supported_in_selected_records=sorted(set(historical_labels)-set(fits)),
                                          caution='旧候補の不支持は選定範囲の保留・不成立を含む。削除・退化・成功率の差ではない。'),
                          completion_limit=n['reason'] if not records else '選定場面以外と必須条件が不明な型は保留。原典一致・シリーズ全体・独立再符号化は未完了。'))
    summary = Counter()
    type_counts = {t['id']: Counter() for t in codebook['types']}
    for w in works:
        judgments = w['source_hold_judgments'] + [r for rec in w['records'] for r in rec['problem_state_records'] + rec['world_model_records']]
        for r in judgments:
            type_counts[r['type_id']][r['decision']] += 1
        summary['records'] += len(w['records'])
    summary.update(assigned_entries=len(works), selected_scene_review=sum(bool(w['records']) for w in works),
                   source_hold=sum(not w['records'] for w in works),
                   works_with_supported_selected_problem=sum(bool(w['comparison']['v3_supported_problem_type_ids']) for w in works))
    return dict(schema_version='v3-development-review-1', version='v3-development-review-r1',
                input_base_commit=manifest['base_commit'], input_hashes=manifest['files'],
                codebook_id=manifest['codebook_id'], corpus_role='development',
                method='single_ai_unblinded_existing_evidence_review_with_targeted_rereading',
                independent_human_coding_performed=False, independent_test_performed=False,
                targeted_body_reread_works=len({r['work_id'] for r in rechecks if r['outcome'] == 'targeted_body_reread'}),
                agreement=None, gm_effect=None, player_effect=None, partial_allowed=False,
                narrative_counts=manifest['narrative_counts'], v1_counts=manifest['v1_counts'],
                counts=dict(summary), type_judgment_counts={k:dict(v) for k,v in type_counts.items()},
                count_unit='選定された当事者×時点×型の記録。本文保留作品は一組の欠測記録。独立標本・作品頻度ではない。',
                types=[dict(id=t['id'], name=t['name'], layer=t['layer'],
                            required_conditions=[c for c in codebook['common_required'] if c['id'] in t['common_required_ids']] + t['required_conditions'],
                            closure_design=t['closure_proposal_from_v3']) for t in codebook['types']],
                works=works)


def report(data):
    def cell(value):
        return str(value).replace('|', '\\|').replace('\n', ' ')
    total = Counter()
    for counts in data['type_judgment_counts'].values():
        total.update(counts)
    lines = [
        '# v3 必須条件の全131件・初回点検（r1）', '',
        '全131割当件の欄を揃えた。既存の指定本文92件・限定範囲18件を利用した110件の選定場面点検と、本文・同定が不足する21件の保留である。'
        'これは全場面を網羅した確定分類でも、全131件を新しく本文全編から独立再符号化した結果でもない。', '',
        f"選定場面で一つ以上のA〜E型の必須条件が揃うのは{data['counts']['works_with_supported_selected_problem']}件。"
        f"それ以外の選定場面{data['counts']['selected_scene_review'] - data['counts']['works_with_supported_selected_problem']}件と本文保留21件にも、全26型について条件の欠測・不成立を記録した。未選定の場面に同型がないという陰性証明には使わない。", '',
        f"点検単位×型は{sum(total.values()):,}行（110選定記録と21本文保留の各26型）。根拠あり{total['fit']}行、明示的不成立{total['not_fit']}行、保留{total['pending']}行。"
        'この行数は独立作品数・人間評価者数・適合率ではない。Fの4型はいずれも保留であり、世界モデルの変更が作品に存在しないという結論ではない。', '',
        '## 手続きと入力', '',
        f"入力のmainは `{data['input_base_commit']}`。v1の基準・割当・旧場面・出典・追補・あらすじ・公開データをSHA-256で固定した。現行UIの不変はgit差分でも確認する。"
        '別ディレクトリ・専用ブランチで追加ファイルだけを作成し、TeX作業と現行UI改善を含めない。', '',
        '実際に読んだ基準は [v1 report](../../baseline/v1-26types/report.md)、[v3 report](../../baseline/v3-proposed/report.md)、'
        '[revision notes](../../baseline/v3-proposed/revision-notes.md)、[v3 codebook](../../followup/classification/v3-codebook.md)、'
        '[境界点検](../../followup/classification/v1-boundary-audit.md)、[評価資料](../../followup/evaluation/README.md)。'
        '既存110件のあらすじ・時系列・確認範囲・出典を個別に読み、まず猿夢・八尺様・夢魅・リゾートバイト・チガヤ・山けらし様の6例で必須条件の記録形式と境界を点検した。', '',
        '今回の対象箇所の直接再閲覧は8作品（上記6例と渦人形・謎の人物）。再閲覧の範囲・URL・調査後のUTC時計は '
        '[source-rechecks.json](source-rechecks.json) にあり、以前の本文レビュー日時とは分けた。残り102件の選定場面は既存本文レビューを継承している。'
        '21件の保留にも取得試行または題名検索を行ったが、正式な本文・初出との同定を確定できず、保留を解消していない。', '',
        '単一AIの非盲検の開発用点検であり、元のv1候補を閲覧している。人間による独立符号化、一致度測定、未知test、GM課題、プレイ実験は行っていない。'
        '再確認や機械的展開を第二評価者に数えず、agreement・GM効果・player効果はnullとした。', '',
        '## 条件の運用', '',
        'A〜Eは当事者・時点・具体的損失と、その当事者の予期／進行中の回避・確認・受容の根拠を共通条件にする。'
        'Fは旧前提、新証拠と証拠層、及ぶ範囲、受容と脅威、局所説明では足りない理由、代替仮説を別欄にする。'
        '伝聞・夢・入れ子の物語・推測を現実層の直接事実に変えない。作中の予告を当事者が信じた場合は、信念層の支持と実際の被害確認を分ける。', '',
        '条件はsupported（根拠あり）・explicitly_false（明示的不成立）・unknown（証拠不明）の三状態。'
        'すべてsupportedならfit、一つでもexplicitly_falseならnot_fit、それ以外はpending。欠測を陰性へ置換しない。'
        '補助条件が未確定なのでpartialは付けない。主型・副型にも同じ必須条件を要求し、今回は順位付けをせず、成立型はunrankedとする。'
        '観察された結末とcodebookの閉鎖設計案を別に保存する。', '',
        '## 代表例で確認した境界', '',
        '| 作品 | 今回の判断と限界 |', '| --- | --- |',
        '| 猿夢 | 次の処刑への予期と覚醒の課題はある。順番に行われる処刑を追跡の方向性へ自動拡張しないためA2は保留。器具からの外的加害をD5へ移さない。夢内の警告と単発の発生だけではE1の因果を満たさない。 |',
        '| 八尺様 | 夜の祖父の声、事前に来ないという説明、朝の本人の否定がC1を支持する。この夜間の選定場面では閉じた部屋の境界を越えておらずA3は不成立。翌朝の車への追跡はこの記録の網羅範囲外。 |',
        '| 夢魅 | 保管・毎年の補強・放棄された寺の被害は祖父の説明に根拠がある。ただし祖父自身の管理責任の終了条件は不明。回収した別の玉を住職へ渡す手配を、祖父の既存管理の終了と同一にしない。E5は再閲覧後に保留へ修正。 |',
        '| リゾートバイト | 堂の外周の音と扉・壁への衝突はA4、既知の美咲の機械的な声と誰も来ないという説明はC1を支持する。有限の一晩の対処をE5の継続管理にしない。 |',
        '| チガヤ | 本人としての喪失の予告を受け転居するD4は、予告を受容した信念層の状態として支持。実際に自己が置換された証明ではない。個体の依り代予告をF4の人間一般の成立依存に拡張しない。 |',
        '| 山けらし様 | 背中への外部付着を、D1の身体内部への寄生・感染やD3の意図しない行為に変えない。具体的危険の残余を未分類として保持。 |',
        '| 渦人形 | 再閲覧で、人形の衣服への着火は燭台からの偶発的な延焼と確認した。意図した焼却対処とはしない。理由のない笑い泣きはあるが、その発話からの次の損失を当事者が予期する根拠が不足しD3は保留。 |',
        '| 謎の人物 | 初遭遇の接近と症状からの逃走はA2を支持。症状が瞬時にすべて消えるわけではない。後年の三年間の追跡・話による媒介は語り手の推論でE2の検証にしない。 |', '',
        '## 残る基準の課題', '',
        '- E1: 単発の前後関係を超える因果支持の水準。伝承内の反復、作中専門家の説明、独立した再試行をどの条件で採用するか。今回の一回の発生は保留。',
        '- C4: 関係名だけで重要性を付与せず、心配・救助・保護行動を要求する。見知らぬ対象や語り手の受容がない他害は保留。',
        '- D2: 観察された身体差異と、機能・自己像・不可逆性の当事者による予期を分ける。他人の異形は自己のD2ではない。',
        '- E5: 保管の事実と抑制の有効性・継続の必要性・管理終了の問題を分ける。住職への手配は実行・責任終了の証明ではない。',
        '- F: 個体宿主・局所迷路・一人の専門家の失敗を世界／人間一般へ移す根拠が不足。旧前提と変更の受容を追加で採取する必要がある。',
        '- 全場面抽出、主型・副型の順位、未確認シリーズ範囲、初出原投稿との一致、補助条件とpartialの規則、人間独立評価は後続作業。', '',
        '基準上不足する条件を保留にすれば、選定場面の問題状態・明示的反例・証拠層・閉じ方の暫定点検は進められる。'
        'FやE群の成立数を増やすために基準を緩めない。', '',
        '## 型別の記録行数', '',
        '| 型 | 根拠あり | 明示的不成立 | 保留 |', '| --- | ---: | ---: | ---: |'
    ]
    for t in data['types']:
        counts = data['type_judgment_counts'][t['id']]
        lines.append(f"| {t['id']} {t['name']} | {counts.get('fit', 0)} | {counts.get('not_fit', 0)} | {counts.get('pending', 0)} |")
    lines += ['', '## 全131件の範囲・結果・残余', '',
              '旧候補は全旧場面の候補集合、v3の支持型は選定された当事者・時点だけ。差分は削除・退化・適合率の差ではない。'
              '各必須条件の根拠・不成立・欠測と出典は [assessments.json](assessments.json)。', '',
              '| ID・題名 | 本文範囲 | v1旧候補 | v3支持型（A〜E） | 個別の保留・残余 |', '| --- | --- | --- | --- | --- |']
    names = {'ready': '指定本文', 'scoped': '限定範囲', 'pending': '本文保留'}
    for w in data['works']:
        difference = w['comparison']
        residue = w['hold_reason'] or ' / '.join(r['residue'] for r in w['records'])
        lines.append('| ' + ' | '.join(map(cell, [w['work_id'] + ' ' + w['title'], names[w['inherited_narrative_status']],
                     ', '.join(difference['historical_candidate_type_ids']) or 'なし',
                     ', '.join(difference['v3_supported_problem_type_ids']) or '保留／不成立', residue])) + ' |')
    lines += ['', '## データと閲覧', '',
              '[protocol.md](protocol.md)、[schema.md](schema.md)、[review-notes.json](review-notes.json)（手動の判断入力）、'
              '[inputs.json](inputs.json)（凍結入力）を保存。生成器は判断入力を展開・検査するだけで、v1の型ラベルからv3を推測しない。', '',
              '独立した `docs/v3.html` でv1・v3・比較を切り替える。v1の現行HTML・JS・データ・あらすじには変更を加えない。'
              'データの版・作品所有者を照合し、別作品の根拠や異なる版のJSONを表示しない。mainへのマージ・本番公開は行わない。', '',
              '検証の実行結果は [validation.md](validation.md) を参照。']
    return '\n'.join(lines) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--pilot', action='store_true', help='Validate authored subset without saving a final dataset')
    args = parser.parse_args()
    data = build(args.pilot)
    if args.pilot:
        print(dump(data['counts']).strip())
        return
    payload = dump(data)
    for name, content in [('assessments.json', payload), ('report.md', report(data))]:
        path = RESEARCH / name
        if args.check:
            if path.read_text() != content:
                raise ValueError(f'Generated {name} differs from authored judgments')
        else:
            path.write_text(content)
    print(f"v3 records checked: {data['counts']}")


if __name__ == '__main__':
    main()
