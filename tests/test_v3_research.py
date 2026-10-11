import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import v3_research as v3
import build_v3_site as site


class V3ResearchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = v3.build()
        cls.works = {w['work_id']: w for w in cls.data['works']}

    def test_all_assignments_preserve_scope_and_source_holds(self):
        original = {w['work_id']: w for w in v3.read('site/narratives.json')['works']}
        self.assertEqual(set(original), set(self.works))
        self.assertEqual(self.data['narrative_counts'], {'ready': 92, 'scoped': 18, 'pending': 21})
        for wid, old in original.items():
            w = self.works[wid]
            self.assertEqual(w['inherited_narrative_status'], old['status'])
            self.assertEqual(w['scope'], old['scope'])
            self.assertEqual(w['source_reviews'], old['source_reviews'])
            if old['status'] == 'pending':
                self.assertFalse(w['records'])
                self.assertEqual(w['hold_reason'], old['reason'])
                self.assertEqual(len(w['source_hold_judgments']), 26)
                for r in w['source_hold_judgments']:
                    self.assertEqual(r['decision'], 'pending')
                    self.assertTrue(all(c['state'] == 'unknown' and not c['evidence_ids'] for c in r['required_evidence']))
            else:
                self.assertTrue(w['records'])
                self.assertFalse(w['source_hold_judgments'])

    def test_required_conditions_evidence_ownership_and_layers(self):
        definitions = {t['id']: t for t in self.data['types']}
        narrative = {w['work_id']: w for w in v3.read('site/narratives.json')['works']}
        for wid, w in self.works.items():
            available = {s['step_id'] for t in narrative[wid]['threads'] for s in t['steps']}
            review_ids = {s['review_id'] for s in w['source_reviews']}
            for rec in w['records']:
                self.assertEqual(len(rec['problem_state_records']), 22)
                self.assertEqual(len(rec['world_model_records']), 4)
                selected = {e['step_id'] for e in rec['evidence']}
                self.assertLessEqual(selected, available)
                for e in rec['evidence']:
                    self.assertLessEqual(set(e['source_review_ids']), review_ids)
                    if 'inherited_event' in e:
                        self.assertLessEqual(set(e['correction_source_recheck_ids']), {r['recheck_id'] for r in w['targeted_rechecks']})
                        self.assertTrue(e['correction_reason'])
                rows = rec['problem_state_records'] + rec['world_model_records']
                self.assertEqual({r['type_id'] for r in rows}, set(definitions))
                for r in rows:
                    self.assertEqual(r['layer'], definitions[r['type_id']]['layer'])
                    expected = [c['id'] for c in definitions[r['type_id']]['required_conditions']]
                    self.assertEqual([c['condition_id'] for c in r['required_evidence']], expected)
                    self.assertEqual(r['decision'], v3.decision(r['required_evidence']))
                    for c in r['required_evidence']:
                        self.assertTrue(c['reason'].strip())
                        self.assertLessEqual(set(c['evidence_ids']), selected)
                    if r['decision'] == 'fit':
                        self.assertTrue(rec['anticipated_loss'])
                        self.assertTrue(rec['recognition_basis'])
                        self.assertTrue(all(c['state'] == 'supported' for c in r['required_evidence']))
                self.assertEqual(set(rec['world_model_evidence']), {'old_premise', 'new_evidence', 'evidence_scope', 'acceptance_and_threat', 'why_local_explanation_insufficient', 'alternative_hypotheses', 'limitation'})

    def test_false_condition_blocks_fit_without_turning_unknown_into_false(self):
        supported = {'state': 'supported'}
        unknown = {'state': 'unknown'}
        false = {'state': 'explicitly_false'}
        self.assertEqual(v3.decision([supported, supported]), 'fit')
        self.assertEqual(v3.decision([supported, unknown]), 'pending')
        self.assertEqual(v3.decision([unknown, false]), 'not_fit')
        with self.assertRaises(ValueError):
            v3.decision([{'state': 'partial'}])

    def test_positive_f_cannot_be_created_without_model_evidence(self):
        note = v3.read('research/v3-20261011/review-notes.json')['records'][0]
        note = json.loads(json.dumps(note))
        codebook = v3.read('followup/classification/v3-codebook.json')
        narrative = next(w for w in v3.read('site/narratives.json')['works'] if w['work_id'] == note['work_id'])
        f1 = next(t for t in codebook['types'] if t['id'] == 'F1')
        for cid in f1['common_required_ids'] + [c['id'] for c in f1['required_conditions']]:
            note['conditions'][cid] = ['supported', 'Synthetic positive with missing model evidence']
        with self.assertRaisesRegex(ValueError, 'positive F lacks'):
            v3.expand(note, narrative, codebook, 1)

    def test_pilot_boundary_cases_do_not_copy_old_type_ids(self):
        def row(wid, tid):
            r = self.works[wid]['records'][0]
            return next(x for x in r['problem_state_records'] + r['world_model_records'] if x['type_id'] == tid)
        self.assertEqual(row('G02-W11', 'A2')['decision'], 'pending')  # ordered execution is not pursuit
        self.assertEqual(row('G02-W11', 'D5')['decision'], 'not_fit')  # external tools
        self.assertEqual(row('G05-W18', 'C1')['decision'], 'fit')
        self.assertEqual(row('G05-W18', 'A3')['decision'], 'not_fit')  # no crossing into the closed room
        self.assertEqual(row('G05-W24', 'E5')['decision'], 'pending')  # transfer/exit condition missing
        self.assertEqual(row('G03-W23', 'D1')['decision'], 'not_fit')  # external attachment
        self.assertEqual(row('G02-W15', 'D4')['decision'], 'fit')  # warning accepted in belief layer
        self.assertEqual(row('G02-W15', 'F4')['decision'], 'pending')  # no general human dependency
        self.assertIn('偶発', self.works['G04-W03']['records'][0]['closure_observed'])
        correction = self.works['G04-W03']['records'][0]['evidence'][0]
        self.assertIn('偶発', correction['event'])
        self.assertNotEqual(correction['event'], correction['inherited_event'])

    def test_no_independence_partial_or_effect_claims(self):
        self.assertFalse(self.data['partial_allowed'])
        self.assertFalse(self.data['independent_human_coding_performed'])
        self.assertFalse(self.data['independent_test_performed'])
        self.assertEqual(self.data['corpus_role'], 'development')
        for key in ('agreement', 'gm_effect', 'player_effect'):
            self.assertIsNone(self.data[key])
        self.assertEqual(self.data['targeted_body_reread_works'], 8)
        held = {w['work_id'] for w in self.works.values() if w['coverage_status'] == 'source_hold'}
        rechecked = {r['work_id'] for w in self.works.values() for r in w['targeted_rechecks']}
        self.assertLessEqual(held, rechecked)
        self.assertTrue(all(r['decision'] == 'pending' for w in self.works.values()
                            for rec in w['records'] for r in rec['world_model_records']))

    def test_frozen_inputs_and_separate_deterministic_outputs(self):
        v3.verify_inputs()
        self.assertEqual(json.loads((ROOT / 'research/v3-20261011/assessments.json').read_text()), self.data)
        files = site.outputs()
        self.assertEqual(len(json.loads(files['docs/v3/works.json'])['works']), 131)
        self.assertTrue(set(files).isdisjoint(v3.verify_inputs()['files']))
        for name, content in files.items():
            self.assertEqual((ROOT / name).read_text(), content)


if __name__ == '__main__':
    unittest.main()
