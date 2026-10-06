"""Check public supplement boundaries and the unmeasured codebook handoff."""
import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


builder = module('followup_builder', 'scripts/build_site.py')
evaluation = module('evaluation_records', 'followup/evaluation/validate.py')


class FollowupTests(unittest.TestCase):
    def test_complete_selected_inventory_is_separate_from_historical_counts(self):
        data = json.loads(builder.build_data())
        supplement = data['followup']
        selected = {w['work_id']: w for w in data['works'] if w['body_status'] != 'verified'}
        self.assertEqual(set(selected), {w['work_id'] for w in supplement['works']})
        self.assertEqual(supplement['counts'], {'entries': 39, 'confirmed': 0, 'partial': 15, 'unresolved': 24})
        self.assertEqual(data['counts']['body_status_counts'], {'verified': 92, 'partial': 14, 'unverified': 25})
        changed = next(w for w in supplement['works'] if w['work_id'] == 'G03-W03')
        self.assertEqual(changed['old_status'], 'unverified')
        self.assertEqual(changed['followup_status'], 'partial')
        self.assertEqual(selected['G03-W03']['body_status'], 'unverified')
        self.assertEqual(selected['G03-W03']['scenes'][0]['fit'], '本文不足')
        self.assertNotEqual(data['source_revision'], supplement['source_revision'])

    def test_observation_allowlist_and_failure_meaning(self):
        document = json.loads((ROOT / 'followup/sources/group_03-05.json').read_text())
        raw = next(o for w in document['works'] for o in w['source_observations'] if o['retrieval_status'] == 'failed')
        raw['unlisted_private_note'] = 'do-not-publish'
        row = builder.public_followup_observation(raw)
        self.assertNotIn('do-not-publish', json.dumps(row))
        self.assertFalse(row['body_read'])
        self.assertIsNone(row['accessed_at_utc'])
        self.assertTrue(row['attempted_at_utc'])
        raw['body_reviewed'] = True
        with self.assertRaises(AssertionError):
            builder.public_followup_observation(raw)
        raw['body_reviewed'] = False
        raw['url'] = 'https://example.org@untrusted.example/path'
        with self.assertRaises(AssertionError):
            builder.public_followup_observation(raw)

    def test_snapshot_rejects_unpinned_followup_bytes(self):
        call = builder.subprocess.check_output

        def read(args, **kwargs):
            if args[-1].endswith(':followup/sources/group_01-02.json'):
                return b'changed bytes'
            return call(args, **kwargs)

        with patch.object(builder.subprocess, 'check_output', side_effect=read):
            with self.assertRaisesRegex(AssertionError, 'Followup snapshot changed'):
                builder.build_data()

    def test_real_condition_ids_fit_the_unmeasured_evaluation_template(self):
        book = json.loads((ROOT / 'followup/classification/v3-codebook.json').read_text())
        record = json.loads((ROOT / 'followup/evaluation/templates/annotation.json').read_text())
        self.assertFalse(book['evaluation_freeze_complete'])
        conditions = []
        for item in book['types']:
            required = item['common_required_ids'] + [c['id'] for c in item['required_conditions']]
            self.assertEqual(len(required), len(set(required)))
            self.assertFalse(item['partial_allowed'])
            self.assertIsNone(item['auxiliary_conditions'])
            conditions.append({'type_id': item['id'], 'required_ids': required,
                               'auxiliary_ids': [], 'auxiliary_fixed': False})
        record['codebook_conditions'] = conditions
        self.assertEqual(len(conditions), 26)
        self.assertEqual(evaluation.validate_record(record, template=True), [])
        self.assertTrue(all(j['decision'] == 'pending' for j in record['type_judgments']))


if __name__ == '__main__':
    unittest.main()
