#!/usr/bin/env python3
"""Validate evaluation records without fetching, writing, or estimating results."""
import argparse
from datetime import datetime
import json
import math
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent
TYPE_IDS = {f'{a}{i}' for a, n in [('A', 4), ('B', 4), ('C', 4),
                                         ('D', 5), ('E', 5), ('F', 4)]
            for i in range(1, n + 1)}
CHECK_IDS = {'development_131', 'kotori_bako', 'legacy_examples', 'alias',
             'derivative', 'series', 'prior_exposure'}
STUDY_IDS = {'coding_frequency', 'coding_challenge', 'gm_support', 'player_experience'}
RUBRIC_IDS = {'required_information', 'action_effect', 'q_d_separation',
              'scope', 'preserved_outcomes'}
METRIC_IDS = {'danger_recognition', 'anticipated_loss', 'perceived_actions',
              'agency', 'fear', 'uncanniness', 'disgust', 'surprise', 'grief',
              'achievement', 'acceptance'}
KEYWORDS = {'$schema', '$id', '$defs', '$ref', 'title', 'oneOf', 'anyOf', 'type',
            'properties', 'required', 'additionalProperties', 'items', 'minItems',
            'maxItems', 'uniqueItems', 'minimum', 'maximum', 'minLength', 'pattern',
            'enum', 'const'}


def schema_keywords(schema):
    """Fail closed if the checked-in schema adds an unsupported keyword."""
    for key, value in schema.items():
        if key not in KEYWORDS:
            raise ValueError(f'unsupported schema keyword: {key}')
        if key in {'properties', '$defs'}:
            for child in value.values():
                schema_keywords(child)
        elif key in {'oneOf', 'anyOf'}:
            for child in value:
                schema_keywords(child)
        elif key == 'items':
            schema_keywords(value)


def schema_errors(value, schema, document, path='$'):
    errors = []
    if '$ref' in schema:
        return schema_errors(value, document['$defs'][schema['$ref'].split('/')[-1]],
                             document, path)
    for key in ('anyOf', 'oneOf'):
        if key in schema:
            successes = sum(not schema_errors(value, child, document, path)
                            for child in schema[key])
            if not (successes == 1 if key == 'oneOf' else successes >= 1):
                errors.append(f'{path}: {key} mismatch')
    if 'const' in schema and value != schema['const']:
        errors.append(f'{path}: constant mismatch')
    if 'enum' in schema and value not in schema['enum']:
        errors.append(f'{path}: invalid enum')
    types = schema.get('type', [])
    types = [types] if isinstance(types, str) else types
    matches = {'null': value is None, 'object': isinstance(value, dict),
               'array': isinstance(value, list), 'string': isinstance(value, str),
               'boolean': type(value) is bool, 'integer': type(value) is int,
               'number': type(value) in (int, float) and math.isfinite(value)}
    if types and not any(matches.get(t, False) for t in types):
        return errors + [f'{path}: invalid type']
    if isinstance(value, dict):
        properties = schema.get('properties', {})
        for key in schema.get('required', []):
            if key not in value:
                errors.append(f'{path}.{key}: required')
        for key, item in value.items():
            if key in properties:
                errors += schema_errors(item, properties[key], document, f'{path}.{key}')
            elif schema.get('additionalProperties') is False:
                errors.append(f'{path}.{key}: unexpected field')
    if isinstance(value, list):
        if len(value) < schema.get('minItems', 0) or len(value) > schema.get('maxItems', math.inf):
            errors.append(f'{path}: invalid item count')
        if schema.get('uniqueItems') and len({json.dumps(x, sort_keys=True) for x in value}) != len(value):
            errors.append(f'{path}: duplicate items')
        if 'items' in schema:
            for i, item in enumerate(value):
                errors += schema_errors(item, schema['items'], document, f'{path}[{i}]')
    if isinstance(value, str):
        if len(value.strip()) < schema.get('minLength', 0):
            errors.append(f'{path}: empty string; use null for missing data')
        if 'pattern' in schema and not re.search(schema['pattern'], value):
            errors.append(f'{path}: pattern mismatch')
    if type(value) in (int, float):
        if not math.isfinite(value) or value < schema.get('minimum', -math.inf) or value > schema.get('maximum', math.inf):
            errors.append(f'{path}: invalid number')
    return errors


def validate_record(data, *, template=False, ready=False, schema=None):
    schema = schema or json.loads((ROOT / 'schema.json').read_text())
    schema_keywords(schema)
    kind = data.get('record_kind') if isinstance(data, dict) else None
    selected = schema['$defs'].get(kind) if isinstance(kind, str) else None
    if selected is None or 'record_kind' not in selected.get('properties', {}):
        return ['$: unknown or missing record_kind']
    errors = schema_errors(data, selected, schema)
    if errors:
        return errors

    def require(condition, message):
        if not condition:
            errors.append(message)

    def nonempty(value):
        return isinstance(value, str) and bool(value.strip())

    def ids(rows, key, expected, name):
        values = [row[key] for row in rows]
        require(len(values) == len(set(values)) and set(values) == expected,
                f'{name}: missing or duplicate IDs')

    def inspect(value, path='$'):
        if isinstance(value, dict):
            for key, child in value.items():
                child_path = f'{path}.{key}'
                if child is not None and (key.endswith('_at') or key == 'source_accessed_at'):
                    try:
                        timestamp = datetime.fromisoformat(child.replace('Z', '+00:00'))
                        require(timestamp.utcoffset() is not None, f'{child_path}: timezone required')
                    except (TypeError, ValueError, AttributeError):
                        errors.append(f'{child_path}: invalid ISO timestamp')
                inspect(child, child_path)
        elif isinstance(value, list):
            for i, child in enumerate(value):
                inspect(child, f'{path}[{i}]')
        elif isinstance(value, str):
            require(not re.search(r'/(?:Users|private|tmp|home)/|file://|[A-Z]:\\', value),
                    f'{path}: local path must not be published')
            require(not re.search(r'(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,})', value),
                    f'{path}: possible credential')

    inspect(data)
    if template:
        require(data['record_status'] == 'template', 'template: wrong record_status')
        observed = {'score', 'value', 'estimate', 'ci_low', 'ci_high', 'actual_independent_n',
                    'sealed_at', 'source_accessed_at', 'frozen_at', 'adjudicated_at',
                    'pre_agreement_saved_at', 'active_minutes', 'elapsed_minutes', 'burden_value'}

        def unmeasured(value):
            if isinstance(value, dict):
                for key, child in value.items():
                    if key in observed:
                        require(child is None, f'template: {key} must be null')
                    if key == 'executed':
                        require(child is False, 'template: executed must be false')
                    unmeasured(child)
            elif isinstance(value, list):
                for child in value:
                    unmeasured(child)

        unmeasured(data)
    else:
        require(data['record_status'] == 'recorded', 'record: record_status must be recorded')
        id_fields = {'study_plan': 'study_id', 'corpus_candidate': 'candidate_id',
                     'annotation': 'annotation_id', 'adjudication': 'adjudication_id',
                     'gm_evaluation': 'evaluation_id', 'experience_observation': 'observation_id',
                     'decision_report': 'report_id'}
        require(nonempty(data[id_fields[data['record_kind']]]), 'record: primary ID required')
        require(nonempty(data['study_id']), 'record: study_id required')

    kind = data['record_kind']
    if kind == 'study_plan':
        ids(data['gates'], 'gate_id', {'G0', 'G1', 'G2', 'G3'}, 'gates')
        ids(data['studies'], 'study_kind', STUDY_IDS, 'studies')
        if ready or data['stage'] == 'frozen':
            require(not template and data['stage'] == 'frozen', 'ready: recorded frozen plan required')
            for key in ('frozen_commit', 'frozen_at', 'participation_conditions',
                        'consent_and_withdrawal', 'retention_and_access',
                        'sampling_frame_and_seed', 'segmentation_plan'):
                require(nonempty(data[key]), f'ready: {key} required')
            needed = {'codebook', 'scene_rules', 'analysis_plan', 'gm_rubric',
                      'experience_instruments', 'selection_rules'}
            artifact_ids = [a['artifact_id'] for a in data['fixed_artifacts']]
            require(needed <= set(artifact_ids) and len(artifact_ids) == len(set(artifact_ids)),
                    'ready: fixed artifacts missing or duplicated')
            for artifact in data['fixed_artifacts']:
                require(all(nonempty(artifact[k]) for k in ('commit', 'sha256', 'purpose')),
                        'ready: artifact hashes/commit/purpose required')
            for gate in data['gates']:
                require(gate['decision'] == 'passed' and nonempty(gate['evidence_ref']),
                        f'ready: {gate["gate_id"]} not passed')
            roles = {r['role_id']: r for r in data['role_assignments']}
            require(len(roles) == len(data['role_assignments']), 'ready: duplicate role IDs')
            role_ids = {'vocabulary', 'corpus_manager', 'coder_1', 'coder_2', 'coder_3',
                        'adjudicator', 'analyst', 'gm_scorer_1', 'gm_scorer_2'}
            require(role_ids <= set(roles), 'ready: role assignments missing')
            for role in data['role_assignments']:
                require(nonempty(role['person_id']) and role['human'] is not None
                        and role['development_involvement'] is not None
                        and nonempty(role['conflict_and_overlap']), 'ready: role details required')
            coders = [roles[x] for x in ('coder_1', 'coder_2', 'coder_3') if x in roles]
            require(len(coders) == 3 and len({c['person_id'] for c in coders}) == 3
                    and all(c['human'] is True and c['development_involvement'] is False for c in coders),
                    'ready: three distinct independent human coders required')
            for study in data['studies']:
                require(study['planned_n'] is not None and study['planned_n'] > 0,
                        f'ready: {study["study_kind"]} N required')
                for key in ('planned_unit', 'planned_n_basis', 'assumptions', 'primary_metric',
                            'analysis_method', 'success_rule', 'fail_rule', 'hold_rule',
                            'missing_policy', 'multiplicity'):
                    require(nonempty(study[key]), f'ready: {study["study_kind"]}.{key} required')
                require(study['decisions_agreed'] and not study['unsettled_items'],
                        f'ready: {study["study_kind"]} decisions unresolved')
    elif ready:
        errors.append('ready: only study_plan can be checked')

    if kind == 'corpus_candidate':
        ids(data['exclusion_checks'], 'check_id', CHECK_IDS, 'exclusion_checks')
        if data['set_kind'] == 'frequency':
            require(data['challenge_stratum'] is None and data['challenge_intent'] is None,
                    'frequency: challenge fields must be null')
        if data['set_kind'] == 'challenge':
            require(data['challenge_stratum'] is not None and data['challenge_intent'] is not None,
                    'challenge: stratum and intent required')
        matches = any(c['result'] == 'match' for c in data['exclusion_checks'])
        require(not matches or data['decision'] == 'exclude', 'matched development material must be excluded')
        if data['decision'] == 'include':
            require(data['body_status'] == 'verified' and data['selected_after_freeze'] is True,
                    'include: verified material selected after freeze required')
            for key in ('set_kind', 'title', 'source_url', 'version', 'scope', 'series_cluster_id',
                        'sampling_frame_ref', 'freeze_ref', 'decision_reason', 'reviewer_id'):
                require(nonempty(data[key]), f'include: {key} required')
            require(isinstance(data['source_url'], str) and data['source_url'].startswith(('https://', 'http://')),
                    'include: source URL required')
            require(data['selection_order'] is not None, 'include: selection order required')
            if data['set_kind'] == 'frequency':
                require(data['selection_probability'] is not None and data['selection_probability'] > 0,
                        'include: positive selection probability required for frequency sample')
            for check in data['exclusion_checks']:
                require(check['result'] == 'clear' and nonempty(check['comparison_ref'])
                        and nonempty(check['evidence_summary']), 'include: all exclusion checks need clear evidence')
        if not template:
            require(nonempty(data['decision_reason']), 'candidate: decision reason required')
        require(data['source_accessed_at'] is not None or nonempty(data['access_time_missing_reason']),
                'candidate: unknown access time needs reason')

    if kind == 'annotation':
        ids(data['type_judgments'], 'type_id', TYPE_IDS, 'type_judgments')
        conditions = {c['type_id']: c for c in data['codebook_conditions']}
        if not template:
            ids(data['codebook_conditions'], 'type_id', TYPE_IDS, 'codebook_conditions')
            for key in ('packet_id', 'packet_sha256', 'work_id', 'series_cluster_id', 'scene_id',
                        'version_scope', 'rater_id', 'codebook_ref', 'codebook_sha256', 'sealed_at',
                        'agreement_unit_kind'):
                require(nonempty(data[key]), f'annotation: {key} required')
            require(data['rater_is_human'] is True and data['independently_submitted'] is True,
                    'annotation: independently submitted human record required')
            require(data['blindness_breach'] is not None, 'annotation: blindness status required')
        if data['blindness_breach'] is True:
            require(nonempty(data['breach_reason']), 'annotation: breach reason required')
        for judgment in data['type_judgments']:
            tid, decision = judgment['type_id'], judgment['decision']
            if template:
                require(decision == 'pending', 'template: type judgments must be pending')
            required = judgment['required_evidence']
            auxiliary = judgment['auxiliary_evidence']
            rule = conditions.get(tid)
            if not template or decision != 'pending':
                require(rule is not None and bool(rule['required_ids']), f'{tid}: fixed required condition IDs needed')
                if rule:
                    ids(required, 'condition_id', set(rule['required_ids']), f'{tid}.required_evidence')
                    ids(auxiliary, 'condition_id', set(rule['auxiliary_ids']), f'{tid}.auxiliary_evidence')
                    require(len(rule['required_ids']) == len(set(rule['required_ids'])), f'{tid}: duplicate conditions')
                    require(not set(rule['required_ids']) & set(rule['auxiliary_ids']), f'{tid}: condition IDs overlap')
            for evidence in required + auxiliary:
                if evidence['state'] in {'met', 'contradicted'}:
                    require(nonempty(evidence['locator']) and nonempty(evidence['summary'])
                            and evidence['basis'] != 'unavailable', f'{tid}: decided condition needs located evidence')
            if decision in {'fit', 'partial_fit'}:
                require(bool(required) and all(e['state'] == 'met' for e in required),
                        f'{tid}: all required conditions must be met')
                require(judgment['role'] is not None and judgment['role'] != 'candidate',
                        f'{tid}: positive/partial label cannot use candidate role')
                if auxiliary:
                    require(rule is not None and rule['auxiliary_fixed'], f'{tid}: auxiliary rules not fixed')
                if decision == 'fit':
                    require(all(e['state'] == 'met' for e in auxiliary), f'{tid}: auxiliary inconsistency prevents fit')
                else:
                    require(rule is not None and rule['auxiliary_fixed'] and bool(auxiliary)
                            and any(e['state'] == 'contradicted' for e in auxiliary)
                            and not any(e['state'] == 'unknown' for e in auxiliary),
                            f'{tid}: partial_fit requires fixed auxiliary mismatch')
                if tid.startswith('F'):
                    world = judgment['world_model_evidence']
                    require(world is not None and all(nonempty(v) for v in world.values()),
                            f'{tid}: six world-model evidence fields required')
            if decision == 'not_fit':
                require(any(e['state'] == 'contradicted' for e in required),
                        f'{tid}: not_fit needs explicit required-condition contradiction')
                require(judgment['role'] is None, f'{tid}: not_fit cannot be main/secondary')
            if decision == 'pending':
                require(nonempty(judgment['pending_reason']), f'{tid}: pending reason required')
            if tid.startswith('F'):
                require(judgment['role'] in {None, 'world_model'}, f'{tid}: F must stay in world-model layer')
            else:
                require(judgment['role'] != 'world_model', f'{tid}: A-E must stay in problem-state layer')
        positives = any(j['decision'] in {'fit', 'partial_fit'} for j in data['type_judgments'])
        require(not positives or data['scene_status'] == 'classified', 'annotation: classified scene required for labels')
        if data['scene_status'] in {'out_of_domain', 'unclassified_problem', 'insufficient_material'}:
            require(nonempty(data['residue']), 'annotation: residual status needs explanation')

    if kind == 'adjudication' and not template:
        require(len(data['original_records']) >= 2, 'adjudication: at least two original records required')
        require(len({a['artifact_id'] for a in data['original_records']}) == len(data['original_records']),
                'adjudication: duplicate originals')
        for artifact in data['original_records']:
            require(nonempty(artifact['sha256']), 'adjudication: original hashes required')
        for key in ('pre_agreement_snapshot_ref', 'pre_agreement_snapshot_sha256',
                    'pre_agreement_saved_at', 'adjudicated_at', 'adjudicator_id', 'evidence_summary'):
            require(nonempty(data[key]), f'adjudication: {key} required')
        if data['pre_agreement_saved_at'] and data['adjudicated_at']:
            try:
                before = datetime.fromisoformat(data['pre_agreement_saved_at'].replace('Z', '+00:00'))
                after = datetime.fromisoformat(data['adjudicated_at'].replace('Z', '+00:00'))
                require(before < after, 'adjudication: agreement analysis must precede adjudication')
            except (TypeError, ValueError):
                errors.append('adjudication: timestamp ordering unavailable')
        if data['outcome'] == 'unresolved':
            require(data['final_decision'] == 'pending' and nonempty(data['unresolved_reason']),
                    'adjudication: unresolved must remain pending with reason')
        elif data['outcome'] == 'resolved':
            require(data['final_decision'] is not None and data['final_decision'] != 'pending',
                    'adjudication: resolved requires decided label')
        else:
            errors.append('adjudication: outcome required')

    if kind == 'gm_evaluation':
        ids(data['criteria'], 'criterion_id', RUBRIC_IDS, 'criteria')
        if not template:
            for key in ('design_id', 'design_sha256', 'gm_id', 'task_id', 'rater_id', 'rubric_ref',
                        'interruptions_and_time_scope'):
                require(nonempty(data[key]), f'GM: {key} required')
            require(data['condition_blinded'] is not None, 'GM: blinding status required')
        for score in data['criteria']:
            if score['score'] is None:
                require(nonempty(score['missing_reason']), 'rubric: missing score needs reason')
            else:
                require(nonempty(score['locator']) and nonempty(score['evidence_summary']),
                        'rubric: scored item needs located evidence')
        if data['active_minutes'] is not None and data['elapsed_minutes'] is not None:
            require(data['active_minutes'] <= data['elapsed_minutes'], 'GM: active time exceeds elapsed time')
        if data['burden_value'] is None:
            require(nonempty(data['burden_missing_reason']) or template, 'GM: missing burden needs reason')

    if kind == 'experience_observation':
        ids(data['metrics'], 'metric_id', METRIC_IDS, 'metrics')
        if not template:
            for key in ('table_id', 'gm_id', 'participant_id', 'scene_id', 'condition_id',
                        'experiment_factor', 'timepoint', 'measurement_plan_ref'):
                require(nonempty(data[key]), f'experience: {key} required')
        for metric in data['metrics']:
            if metric['value'] is None:
                require(nonempty(metric['missing_reason']), 'experience: missing value needs reason')
            else:
                require(nonempty(metric['question_ref']) and nonempty(metric['higher_means']),
                        'experience: fixed question and scale direction required')
                low, high = metric['scale_min'], metric['scale_max']
                require(low is not None and high is not None and low < high
                        and low <= metric['value'] <= high, 'experience: value outside defined scale')
        if data['completion_status'] in {'stopped', 'withdrawn'}:
            require(nonempty(data['missing_or_stop_reason']), 'experience: stop/withdrawal reason required')

    if kind == 'decision_report':
        require(data['ci_low'] is None or data['ci_high'] is None or data['ci_low'] <= data['ci_high'],
                'report: CI bounds reversed')
        if not data['executed']:
            for key in ('estimate', 'ci_low', 'ci_high', 'actual_independent_n', 'decision'):
                require(data[key] is None, f'unexecuted report: {key} must be null')
            require(all(d['count'] is None for d in data['denominators']), 'unexecuted report: observed counts forbidden')
        else:
            for key in ('study_kind', 'metric_purpose', 'hypothesis', 'analysis_version', 'unit',
                        'metric', 'missing_and_deviations', 'decision', 'decision_reason'):
                require(nonempty(data[key]), f'report: {key} required')
            require(bool(data['input_records']) and bool(data['denominators']), 'report: inputs and denominators required')
            require(all(a['sha256'] is not None for a in data['input_records']), 'report: input hashes required')
            if data['metric_purpose'] == 'agreement':
                require(data['agreement_stage'] == 'pre_agreement', 'report: agreement must use pre-agreement records')
            if data['decision'] in {'support', 'fail'}:
                require(data['actual_independent_n'] is not None and data['estimate'] is not None
                        and data['ci_low'] is not None and data['ci_high'] is not None,
                        'report: support/fail requires independent N, estimate and interval')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--record', type=Path, help='check a recorded record, including a reasoned hold')
    group.add_argument('--ready', type=Path, help='check a frozen study plan for required readiness fields')
    args = parser.parse_args()
    paths = [args.record or args.ready] if args.record or args.ready else sorted((ROOT / 'templates').glob('*.json'))
    failed = False
    for path in paths:
        try:
            data = json.loads(path.read_text())
            errors = validate_record(data, template=not (args.record or args.ready), ready=bool(args.ready))
        except (OSError, ValueError, KeyError) as error:
            errors = [f'unreadable/invalid record or schema: {error}']
        for error in errors:
            print(f'{path.name}: {error}', file=sys.stderr)
        failed |= bool(errors)
    if not failed:
        print(f'{len(paths)} record(s) structurally valid; no study result or empirical support established.')
    return int(failed)


if __name__ == '__main__':
    sys.exit(main())
