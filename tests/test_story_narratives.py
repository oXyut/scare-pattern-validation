"""Protect the historical evidence while validating new editorial narratives."""
import copy
import json
import unittest
from pathlib import Path

from scripts.story_narratives import public_narratives

ROOT = Path(__file__).resolve().parents[1]


class NarrativeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.public = json.loads((ROOT / 'docs/data.json').read_text())
        cls.manuscript = json.loads((ROOT / 'site/narratives.json').read_text())

    def project(self, manuscript):
        return public_narratives(manuscript, self.public['works'], self.public['sources'], self.public['source_revision'])

    def test_all_entries_have_an_explicit_state_and_history_is_unchanged(self):
        history = copy.deepcopy(self.public)
        result = self.project(self.manuscript)
        self.assertEqual(len(result['works']), 131)
        self.assertEqual(result['counts'], {'ready': 4, 'pending': 127})
        self.assertEqual(result['pending_reasons'], {'not_rechecked': 58, 'identity_or_scope_pending': 12, 'body_unavailable': 25, 'poc_review_pending': 32})
        self.assertEqual(self.public, history)
        self.assertEqual(result, self.public['narratives'])
        self.assertEqual(result['withheld_draft_count'], 32)
        self.assertTrue(all(row['summary'] is None and not row['threads'] and not row['source_reviews'] for row in result['works'] if row['work_id'] not in result['review_work_ids']))

    def test_missing_duplicate_or_different_snapshot_is_rejected(self):
        for mutate in [lambda doc: doc['works'].pop(),
                       lambda doc: doc['works'].append(doc['works'][0]),
                       lambda doc: doc.update(research_revision='different')]:
            document = copy.deepcopy(self.manuscript)
            mutate(document)
            with self.assertRaises(AssertionError):
                self.project(document)

    def test_pending_entries_cannot_publish_invented_events(self):
        document = copy.deepcopy(self.manuscript)
        row = next(w for w in document['works'] if w['status'] == 'pending')
        row['summary'] = {'opening': 'invented', 'development': 'invented', 'ending': 'invented'}
        with self.assertRaises(AssertionError):
            self.project(document)

    def test_unidentified_and_series_entries_cannot_be_upgraded_to_full_confirmation(self):
        document = copy.deepcopy(self.manuscript)
        row = next(w for w in document['works'] if w['status'] == 'scoped')
        row['status'] = 'ready'
        with self.assertRaises(AssertionError):
            self.project(document)
        document = copy.deepcopy(self.manuscript)
        row = next(w for w in document['works'] if 'body_unavailable' in w['reason_codes'])
        row.update(status='ready', reason_codes=[], reason='')
        with self.assertRaises(AssertionError):
            self.project(document)

    def test_source_ownership_url_and_utc_are_required(self):
        for field, value in [('source_id', 'G02-S019'), ('url', 'https://example.com/other'), ('accessed_at_utc', '2026-10-10')]:
            document = copy.deepcopy(self.manuscript)
            document['works'][0]['source_reviews'][0][field] = value
            with self.assertRaises(AssertionError):
                self.project(document)

    def test_scene_ownership_and_original_type_candidates_are_required(self):
        for field, value in [('scene_id', 'G02-W11-S01'), ('type_ids', ['F3'])]:
            document = copy.deepcopy(self.manuscript)
            fear = next(s['fears'][0] for s in document['works'][0]['threads'][0]['steps'] if s['fears'])
            fear[field] = value
            with self.assertRaises((AssertionError, KeyError)):
                self.project(document)

    def test_only_permitted_fields_are_published(self):
        document = copy.deepcopy(self.manuscript)
        for row in document['works']:
            row['private_note'] = 'unpublished'
            for review in row['source_reviews']:
                review['private_note'] = 'unpublished'
        self.assertNotIn('unpublished', json.dumps(self.project(document)))


if __name__ == '__main__':
    unittest.main()
