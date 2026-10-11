import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import v3_evidence_extraction as r2
import v3_research as r1


class EvidenceExtractionTests(unittest.TestCase):
    def setUp(self):
        self.data = r2.read('research/v3-20261011-r2/condition-extractions.json')
        self.reviews = r2.read('research/v3-20261011-r2/source-checks.json')
        self.narratives = r2.read('site/narratives.json')
        self.codebook = r2.read('followup/classification/v3-codebook.json')

    def check(self):
        return r2.validate(self.data, self.reviews, self.narratives, self.codebook)

    def test_actual_authored_records_and_frozen_v1_inputs(self):
        counts = self.check()
        self.assertEqual(counts['assigned_entries'], 131)
        self.assertEqual(counts['inherited_narrative_counts'], {'ready': 92, 'scoped': 18, 'pending': 21})
        self.assertEqual(counts['explicitly_inspected_condition_judgments'], counts['selected_records'] * 78)
        self.assertEqual(counts['condition_extraction_complete_works'], len({r['work_id'] for r in self.data['records']}))
        r1.verify_inputs()

    def test_omission_and_duplicate_cannot_be_auto_completed(self):
        saved = copy.deepcopy(self.data)
        self.data['records'][0]['conditions'].pop()
        with self.assertRaisesRegex(ValueError, '78 conditions'):
            self.check()
        self.data = saved
        self.data['records'][0]['conditions'].append(copy.deepcopy(self.data['records'][0]['conditions'][0]))
        with self.assertRaisesRegex(ValueError, '78 conditions'):
            self.check()

    def test_auto_unknown_cannot_claim_explicit_extraction(self):
        self.data['records'][0]['conditions'][0]['inspection'] = 'automatic_unknown_expansion'
        with self.assertRaisesRegex(ValueError, 'Automatic expansion'):
            self.check()

    def test_grouped_authorship_requires_explicit_conditions_and_consistent_expansion(self):
        rec = next(r for r in self.data['records'] if r.get('authorship_format') == 'explicit_condition_groups')
        saved = copy.deepcopy(rec['condition_review_groups'])
        rec['condition_review_groups'][0]['condition_ids'].pop()
        with self.assertRaisesRegex(ValueError, 'explicitly name all 78'):
            self.check()
        rec['condition_review_groups'] = saved
        rec['condition_review_groups'][0]['reason'] += ' altered'
        with self.assertRaisesRegex(ValueError, 'differs from its authored'):
            self.check()

    def test_foreign_evidence_review_and_url_are_rejected(self):
        saved = copy.deepcopy(self.data)
        self.data['records'][0]['conditions'][0]['inspected_evidence_ids'] = ['G03-W17-R2-E-a']
        with self.assertRaisesRegex(ValueError, 'owned inspected evidence'):
            self.check()
        self.data = saved
        self.data['records'][0]['evidence'][0]['source_review_id'] = 'G03-W17-R2-S1'
        with self.assertRaisesRegex(ValueError, 'another work'):
            self.check()

    def test_unknown_has_inspected_scope_without_supporting_evidence(self):
        condition = next(c for c in self.data['records'][0]['conditions'] if c['state'] == 'unknown')
        condition['evidence_ids'] = condition['inspected_evidence_ids'][:1]
        with self.assertRaisesRegex(ValueError, 'Unknown does not'):
            self.check()

    def test_targeted_reread_does_not_count_as_full_body(self):
        source = self.reviews['reviews'][0]
        source['status'] = 'targeted_reread'
        with self.assertRaisesRegex(ValueError, 'Source reading progress'):
            self.check()

    def test_repeated_r1_work_cannot_increase_remaining_102_progress(self):
        self.reviews['fully_rechecked_of_r1_inherited_102'] += 1
        self.reviews['remaining_of_r1_inherited_102'] -= 1
        with self.assertRaisesRegex(ValueError, 'overlap cannot be counted twice'):
            self.check()

    def test_identity_reread_preserves_inherited_scope_and_one_status(self):
        identity = r2.read('research/v3-20261011-r2/identity-rechecks.json')
        r2.validate_identity(identity, self.narratives, self.reviews)
        record = next(w for w in identity['works'] if w['r2_identity_review_status'] == 'specified_published_body_reread_unresolved')
        record['status'] = 'specified_published_body_reread_unresolved'
        with self.assertRaisesRegex(ValueError, 'one status field'):
            r2.validate_identity(identity, self.narratives, self.reviews)
        del record['status']
        record['inherited_scope'] = 'whole series'
        with self.assertRaisesRegex(ValueError, 'alter inherited coverage'):
            r2.validate_identity(identity, self.narratives, self.reviews)

    def test_identity_reread_cannot_borrow_another_work_source(self):
        identity = r2.read('research/v3-20261011-r2/identity-rechecks.json')
        record = next(w for w in identity['works'] if w['r2_identity_review_status'] == 'specified_published_body_reread_unresolved')
        record['source_review_ids'] = ['G03-W17-R2-S1']
        with self.assertRaisesRegex(ValueError, 'own fully read'):
            r2.validate_identity(identity, self.narratives, self.reviews)

    def test_world_model_empty_template_cannot_claim_extraction(self):
        self.data['records'][0]['world_model_evidence']['old_premise'] = None
        with self.assertRaisesRegex(ValueError, 'F needs actual'):
            self.check()

    def test_independence_and_partial_cannot_be_inferred_from_reread(self):
        self.data['independent_human_coding_performed'] = True
        with self.assertRaisesRegex(ValueError, 'not independent'):
            self.check()

    def test_unextracted_and_held_works_cannot_be_counted_complete(self):
        wid = self.data['records'][0]['work_id']
        self.data['records'] = [r for r in self.data['records'] if r['work_id'] != wid]
        progress = self.data['work_progress'][wid]
        progress['completed_records'] = 0
        progress['condition_extraction_status'] = 'unextracted'
        with self.assertRaisesRegex(ValueError, 'Final selected-scope coverage'):
            self.check()
        progress['condition_extraction_status'] = 'selected_records_complete'
        with self.assertRaisesRegex(ValueError, 'Completed extraction requires'):
            self.check()

    def test_final_coverage_has_110_selected_and_21_uninvented_holds(self):
        counts = self.check()
        self.assertEqual(counts['condition_extraction_complete_works'], 110)
        self.assertEqual(counts['fully_rechecked_published_bodies'], 110)
        self.assertEqual(counts['fully_rechecked_of_r1_inherited_102'], 102)
        self.assertEqual(counts['remaining_of_r1_inherited_102'], 0)
        selected = {r['work_id'] for r in self.data['records']}
        held = {w['work_id'] for w in self.narratives['works'] if w['status'] == 'pending'}
        self.assertFalse(selected & held)
        self.assertEqual(len(held), 21)

    def test_final_comparison_rejects_an_omitted_historical_scene(self):
        matches = r2.read('research/v3-20261011-r2/scene-correspondences.json')
        matches['records'].pop()
        with self.assertRaisesRegex(ValueError, 'map every historical scene'):
            r2.results(self.data, self.reviews, self.narratives, self.codebook, matches)

    def test_finite_protection_and_non_threatening_actor_cannot_be_promoted(self):
        def state(wid, cid):
            rec = next(r for r in self.data['records'] if r['work_id'] == wid)
            return next(c['state'] for c in rec['conditions'] if c['condition_id'] == cid)
        for wid in ('G05-W25', 'G05-W06'):
            self.assertEqual(state(wid, 'E5.R2'), 'explicitly_false')
        for wid in ('G04-W08', 'G03-W13'):
            self.assertEqual(state(wid, 'AE.G2'), 'explicitly_false')
            rec = next(r for r in self.data['records'] if r['work_id'] == wid)
            self.assertTrue(all(t['decision'] == 'not_fit' for t in r2.type_records(rec, self.codebook)))
        self.assertEqual(state('G04-W23', 'E2.R2'), 'unknown')

    def test_night_and_vehicle_are_separate_records_not_independent_works(self):
        records = [r for r in self.data['records'] if r['work_id'] == 'G05-W18']
        self.assertEqual(len(records), 2)
        self.assertNotEqual(records[0]['time_scope'], records[1]['time_scope'])
        common = ['AE.G1', 'AE.G2']
        def decision(rec, ids):
            states = [c['state'] for c in rec['conditions'] if c['condition_id'] in ids]
            return 'not_fit' if 'explicitly_false' in states else 'fit' if set(states) == {'supported'} else 'pending'
        self.assertEqual(decision(records[0], common + ['C1.R1', 'C1.R2', 'C1.R3']), 'fit')
        self.assertEqual(decision(records[1], common + ['A2.R1', 'A2.R2']), 'fit')
        self.assertEqual(self.data['work_progress']['G05-W18']['completed_records'], 2)

    def test_comparison_rejects_foreign_record(self):
        matches = r2.read('research/v3-20261011-r2/scene-correspondences.json')
        matches['records'][0]['record_ids'] = ['G03-W17-V3-R2-R01']
        with self.assertRaisesRegex(ValueError, 'different work or record'):
            r2.results(self.data, self.reviews, self.narratives, self.codebook, matches)

    def test_unreviewed_scene_is_distinct_from_pending_and_not_fit(self):
        matches = r2.read('research/v3-20261011-r2/scene-correspondences.json')
        result = r2.results(self.data, self.reviews, self.narratives, self.codebook, matches)
        self.assertEqual(len(result['works']), 131)
        w = next(w for w in result['works'] if w['work_id'] == 'G05-W18')
        later = next(m for m in w['v1_comparisons'] if m['scene_id'] == 'G05-W18-S03')
        self.assertEqual(later['relation'], 'not_reviewed_in_r2')
        self.assertFalse(later['record_ids'])
        self.assertNotIn('decision', later)
        decisions = {t['decision'] for r in w['selected_records'] for t in r['type_records']}
        self.assertEqual(decisions, {'fit', 'not_fit', 'pending'})
        hold = next(w for w in result['works'] if w['inherited_narrative_status'] == 'pending')
        self.assertEqual(hold['progress']['condition_extraction_status'], 'source_hold')
        self.assertFalse(hold['selected_records'])
        self.assertTrue(all(m['relation'] == 'source_hold' and not m['selected_scope_differences'] for m in hold['v1_comparisons']))

    def test_unreviewed_scene_cannot_claim_corresponding_judgment(self):
        matches = r2.read('research/v3-20261011-r2/scene-correspondences.json')
        matches['records'][0]['relation'] = 'not_reviewed_in_r2'
        with self.assertRaisesRegex(ValueError, 'Unreviewed historical scope'):
            r2.results(self.data, self.reviews, self.narratives, self.codebook, matches)


if __name__ == '__main__':
    unittest.main()
