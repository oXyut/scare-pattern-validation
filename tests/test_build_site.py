"""Public projection tests retain source meanings and exclude unlisted columns."""
import importlib.util
import json
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('builder', REPO / 'scripts/build_site.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class SiteProjectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(builder.build_data())
        cls.works = {work['work_id']: work for work in cls.data['works']}

    def test_all_work_tracking_rows_retain_named_columns_and_uncertainty(self):
        for group, name, fields in [
            ('group_02', 'target_outcomes', ['target', 'Q', 'D', 'C', 'M']),
            ('group_03', 'problem_tracking', ['scene_id', 'target', 'outcome', 'unresolved', 'transition']),
        ]:
            originals = json.loads((REPO / f'groups/{group}/data/mappings.json').read_text())['works']
            self.assertEqual(len(originals), 26)
            for original in originals:
                with self.subTest(work=original['work_id']):
                    public = self.works[original['work_id']]
                    self.assertEqual(public[name], [{key: row[key] for key in fields} for row in original[name]])
                    if group == 'group_02':
                        self.assertEqual(public['transitions'], [dict(row, closure_audit='') for row in original['transitions']])
        originals = json.loads((REPO / 'groups/group_05/data/mappings.json').read_text())['works']
        self.assertEqual(len(originals), 26)
        for original in originals:
            with self.subTest(work=original['work_id']):
                tracking = original['outcome_tracking']
                expected = {key: tracking[key] for key in ['confirmed_or_reported_outcome', 'unresolved_targets']}
                expected['transitions'] = [dict(row, retained_problem='') for row in tracking['transitions']]
                self.assertEqual(self.works[original['work_id']]['outcome_tracking'], expected)

    def test_work_records_are_not_copied_to_scene_outcomes_or_counted_as_new_evidence(self):
        scenes = [scene for work in self.data['works'] if work['group_id'] in ['group_02', 'group_03', 'group_05'] for scene in work['scenes']]
        self.assertEqual(len(scenes), 149)
        self.assertTrue(all(scene['outcomes'] == '' for scene in scenes))
        self.assertEqual(sum(scene['fit'] == '本文不足' for work in self.data['works'] for scene in work['scenes']), 25)
        for original in json.loads((REPO / 'groups/group_01/data/mappings.json').read_text())['works']:
            for raw, public in zip(original['scenes'], self.works[original['work_id']]['scenes']):
                self.assertEqual(public['outcomes'], raw['actual_outcome'])
                self.assertEqual(public['transitions'], raw['transitions'])

    def test_tracking_allowlist_ignores_private_ids_and_future_unlisted_metadata(self):
        private = {'target_id': 'private', 'subject_id': 'private', 'problem_id': 'private', 'private_note': 'unpublished'}
        fixture = {
            'target_outcomes': [dict(private, target='subject', Q='unknown', D='continued', C='escape', M='limited')],
            'transitions': [dict(private, from_scene='SC1', to_scene='SC2', retained_problem='danger remains')],
            'problem_tracking': [dict(private, scene_id='SC1', target='subject', outcome='escape', unresolved='cause', transition='danger remains')],
            'outcome_tracking': dict(private, confirmed_or_reported_outcome='escape', unresolved_targets='cause', transitions=[]),
        }
        projected = builder.public_work_tracking(fixture)
        self.assertNotIn('private', json.dumps(projected))
        self.assertNotIn('unpublished', json.dumps(projected))
        fixture['target_outcomes'][0]['target'] = {'private_note': 'unpublished'}
        with self.assertRaises(AssertionError):
            builder.public_work_tracking(fixture)


if __name__ == '__main__':
    unittest.main()
