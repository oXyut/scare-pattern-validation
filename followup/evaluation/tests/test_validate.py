"""Artificial in-memory records test constraints; these are not research data."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('evaluation_validator', ROOT / 'validate.py')
V = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(V)


def template(name):
    return json.loads((ROOT / 'templates' / f'{name}.json').read_text())


def evidence(cid, state='met'):
    return dict(condition_id=cid, state=state, basis='observed',
                locator='synthetic-position', summary='人工の検査用根拠')


def annotation():
    data = template('annotation')
    data['record_status'] = 'recorded'
    for key in ('annotation_id', 'study_id', 'packet_id', 'work_id', 'series_cluster_id',
                'scene_id', 'version_scope', 'rater_id', 'codebook_ref'):
        data[key] = f'synthetic-{key}'
    for key in ('packet_sha256', 'codebook_sha256'):
        data[key] = 'a' * 64
    data.update(rater_is_human=True, independently_submitted=True,
                blindness_breach=False, sealed_at='2000-01-01T00:00:00Z', agreement_unit_kind='primary')
    for j in data['type_judgments']:
        cid = f'{j["type_id"]}-synthetic-required'
        data['codebook_conditions'].append(dict(type_id=j['type_id'], required_ids=[cid],
                                               auxiliary_ids=[], auxiliary_fixed=False))
        j['required_evidence'] = [evidence(cid, 'unknown')]
    return data


def candidate():
    data = template('corpus-candidate')
    data.update(record_status='recorded', candidate_id='synthetic-candidate', study_id='synthetic-study',
                set_kind='frequency', title='人工候補', source_url='https://example.com/synthetic',
                version='synthetic-version', scope='synthetic-scope', body_status='verified',
                series_cluster_id='synthetic-series', sampling_frame_ref='synthetic-frame',
                selection_order=1, selection_probability=.5, selected_after_freeze=True,
                freeze_ref='synthetic-freeze', decision='include', decision_reason='人工の検査用理由',
                reviewer_id='synthetic-reviewer')
    for item in data['exclusion_checks']:
        item.update(result='clear', comparison_ref='synthetic-check', evidence_summary='人工の照合根拠')
    return data


class RecordValidationTests(unittest.TestCase):
    def assert_invalid(self, data, text, **kwargs):
        errors = V.validate_record(data, **kwargs)
        self.assertTrue(any(text in e for e in errors), errors)

    def test_all_templates_are_unmeasured_and_valid(self):
        for path in (ROOT / 'templates').glob('*.json'):
            with self.subTest(path=path.name):
                self.assertEqual([], V.validate_record(json.loads(path.read_text()), template=True))

    def test_template_cannot_contain_results(self):
        data = template('experience-observation')
        data['metrics'][0].update(value=0, scale_min=0, scale_max=3,
                                  question_ref='synthetic-question', higher_means='more')
        self.assert_invalid(data, 'template: value must be null', template=True)

    def test_unfinished_plan_not_ready(self):
        data = template('study-plan')
        data.update(record_status='recorded', study_id='synthetic-study', stage='frozen')
        self.assert_invalid(data, 'ready: G1 not passed', ready=True)
        self.assert_invalid(data, 'decisions unresolved', ready=True)

    def test_complete_synthetic_plan_can_pass_structural_readiness(self):
        data = template('study-plan')
        data.update(record_status='recorded', study_id='synthetic-study', stage='frozen',
                    frozen_commit='b' * 40, frozen_at='2000-01-01T00:00:00Z')
        for key in ('participation_conditions', 'consent_and_withdrawal', 'retention_and_access',
                    'sampling_frame_and_seed', 'segmentation_plan'):
            data[key] = '人工の事前固定条件'
        for key in ('codebook', 'scene_rules', 'analysis_plan', 'gm_rubric',
                    'experience_instruments', 'selection_rules'):
            data['fixed_artifacts'].append(dict(artifact_id=key, commit='b' * 40,
                                                sha256='a' * 64, purpose='人工検査'))
        for gate in data['gates']:
            gate.update(decision='passed', evidence_ref='synthetic-evidence')
        for i, role in enumerate(('vocabulary', 'corpus_manager', 'coder_1', 'coder_2',
                                  'coder_3', 'adjudicator', 'analyst', 'gm_scorer_1', 'gm_scorer_2')):
            data['role_assignments'].append(dict(role_id=role, person_id=f'synthetic-person-{i}',
                                                human=True, development_involvement=False,
                                                conflict_and_overlap='人工検査、兼務なし'))
        for study in data['studies']:
            for key in ('planned_unit', 'planned_n_basis', 'assumptions', 'primary_metric',
                        'analysis_method', 'success_rule', 'fail_rule', 'hold_rule',
                        'missing_policy', 'multiplicity'):
                study[key] = '人工の固定計画'
            study.update(planned_n=1, decisions_agreed=True, unsettled_items=[])
        self.assertEqual([], V.validate_record(data, ready=True))
        data['role_assignments'][3]['person_id'] = data['role_assignments'][2]['person_id']
        self.assert_invalid(data, 'three distinct independent human coders required', ready=True)

    def test_unknown_codebook_rule_cannot_produce_fit(self):
        data = annotation()
        data['codebook_conditions'] = []
        j = data['type_judgments'][0]
        j.update(decision='fit', role='main', required_evidence=[evidence('invented')])
        data['scene_status'] = 'classified'
        self.assert_invalid(data, 'fixed required condition IDs needed')

    def test_unknown_required_condition_not_positive(self):
        data = annotation()
        data['type_judgments'][0].update(decision='fit', role='main')
        data['scene_status'] = 'classified'
        self.assert_invalid(data, 'all required conditions must be met')

    def test_synthetic_fit_requires_located_evidence(self):
        data = annotation()
        data['scene_status'] = 'classified'
        j = data['type_judgments'][0]
        j.update(decision='fit', role='main')
        j['required_evidence'][0]['state'] = 'met'
        self.assertEqual([], V.validate_record(data))
        j['required_evidence'][0]['locator'] = None
        self.assert_invalid(data, 'decided condition needs located evidence')

    def test_missing_condition_is_not_explicit_negative(self):
        data = annotation()
        data['type_judgments'][0]['decision'] = 'not_fit'
        self.assert_invalid(data, 'not_fit needs explicit required-condition contradiction')

    def test_partial_fit_requires_fixed_auxiliary_rules(self):
        data = annotation()
        data['scene_status'] = 'classified'
        j = data['type_judgments'][0]
        j.update(decision='partial_fit', role='main')
        j['required_evidence'][0]['state'] = 'met'
        self.assert_invalid(data, 'partial_fit requires fixed auxiliary mismatch')
        rule = data['codebook_conditions'][0]
        rule.update(auxiliary_ids=['synthetic-aux'], auxiliary_fixed=True)
        j['auxiliary_evidence'] = [evidence('synthetic-aux', 'contradicted')]
        self.assertEqual([], V.validate_record(data))

    def test_f_layer_needs_extra_evidence(self):
        data = annotation()
        data['scene_status'] = 'classified'
        j = next(j for j in data['type_judgments'] if j['type_id'] == 'F2')
        j.update(decision='fit', role='main')
        j['required_evidence'][0]['state'] = 'met'
        self.assert_invalid(data, 'F must stay in world-model layer')
        self.assert_invalid(data, 'six world-model evidence fields required')

    def test_all_labels_need_unique_rows(self):
        data = annotation()
        data['type_judgments'][-1] = copy.deepcopy(data['type_judgments'][0])
        self.assert_invalid(data, 'type_judgments: missing or duplicate IDs')

    def test_development_match_cannot_enter_test(self):
        data = candidate()
        self.assertEqual([], V.validate_record(data))
        data['exclusion_checks'][0]['result'] = 'match'
        self.assert_invalid(data, 'matched development material must be excluded')

    def test_unresolved_alias_must_be_held(self):
        data = candidate()
        data['exclusion_checks'][3]['result'] = 'unresolved'
        self.assert_invalid(data, 'all exclusion checks need clear evidence')
        data['decision'] = 'hold'
        self.assertEqual([], V.validate_record(data))

    def test_challenge_not_frequency(self):
        data = candidate()
        data['challenge_stratum'] = 'F2'
        self.assert_invalid(data, 'frequency: challenge fields must be null')

    def test_adjudication_cannot_precede_agreement_analysis(self):
        data = template('adjudication')
        data.update(record_status='recorded', adjudication_id='synthetic-adjudication',
                    study_id='synthetic-study', scene_id='synthetic-scene',
                    pre_agreement_snapshot_ref='synthetic-snapshot', pre_agreement_snapshot_sha256='a' * 64,
                    pre_agreement_saved_at='2000-01-02T00:00:00Z', adjudicated_at='2000-01-01T00:00:00Z',
                    adjudicator_id='synthetic-adjudicator', evidence_summary='人工検査',
                    outcome='unresolved', final_decision='pending', unresolved_reason='人工検査')
        data['original_records'] = [dict(artifact_id=f'synthetic-original-{i}', commit=None,
                                         sha256='a' * 64, purpose='人工検査') for i in range(2)]
        self.assert_invalid(data, 'agreement analysis must precede adjudication')
        data['adjudicated_at'] = '2000-01-03T00:00:00Z'
        self.assertEqual([], V.validate_record(data))

    def test_agreement_cannot_use_adjudicated_labels(self):
        data = template('decision-report')
        data.update(record_status='recorded', report_id='synthetic-report', study_id='synthetic-study',
                    executed=True, study_kind='coding_frequency', metric_purpose='agreement',
                    hypothesis='人工検査', analysis_version='synthetic-analysis', unit='series',
                    metric='alpha', missing_and_deviations='人工検査', decision='hold',
                    decision_reason='人工検査', agreement_stage='post_adjudication')
        data['input_records'] = [dict(artifact_id='synthetic-input', commit=None, sha256='a' * 64, purpose='人工検査')]
        data['denominators'] = [dict(name='synthetic-assigned', count=1, missing_reason=None)]
        self.assert_invalid(data, 'agreement must use pre-agreement records')

    def test_unexecuted_report_cannot_contain_empirical_claim(self):
        data = template('decision-report')
        data['decision'] = 'support'
        self.assert_invalid(data, 'unexecuted report: decision must be null', template=True)

    def test_rubric_zero_is_observed_not_missing(self):
        data = template('gm-evaluation')
        data['criteria'][0]['score'] = 0
        self.assert_invalid(data, 'scored item needs located evidence', template=True)

    def test_unknown_keyword_and_unknown_field_fail_closed(self):
        schema = json.loads((ROOT / 'schema.json').read_text())
        schema['$defs']['evidence']['format'] = 'new-keyword'
        with self.assertRaisesRegex(ValueError, 'unsupported schema keyword'):
            V.validate_record(template('annotation'), template=True, schema=schema)
        data = template('annotation')
        data['session_id'] = 'synthetic-unwanted-field'
        self.assert_invalid(data, 'unexpected field', template=True)

    def test_invalid_numeric_and_boolean_types_rejected(self):
        data = template('experience-observation')
        data['metrics'][0]['value'] = float('nan')
        self.assert_invalid(data, 'invalid type', template=True)
        data = template('gm-evaluation')
        data['criteria'][0]['score'] = True
        self.assert_invalid(data, 'invalid type', template=True)


if __name__ == '__main__':
    unittest.main()
