"""Protect the historical evidence while validating new editorial narratives."""
import copy
import json
import hashlib
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
        self.assertEqual(result['counts'], {'ready': 92, 'scoped': 18, 'pending': 21})
        self.assertEqual(result['investigated_count'], 131)
        self.assertTrue(all(row['investigation'] and row['reviewed_at_utc'] for row in result['works']))
        self.assertNotIn('not_rechecked', result['pending_reasons'])
        self.assertNotIn('poc_review_pending', result['pending_reasons'])
        self.assertEqual(self.public, history)
        self.assertEqual(result, self.public['narratives'])
        self.assertTrue(all(row['summary'] is None and not row['threads'] and not row['source_reviews'] for row in result['works'] if row['status'] == 'pending'))
        self.assertEqual(sum(len(t['steps']) for w in result['works'] for t in w['threads']), 452)

    def test_missing_duplicate_or_different_snapshot_is_rejected(self):
        for mutate in [lambda doc: doc['works'].pop(),
                       lambda doc: doc['works'].append(doc['works'][0]),
                       lambda doc: doc.update(research_revision='different')]:
            document = copy.deepcopy(self.manuscript)
            mutate(document)
            with self.assertRaises(AssertionError):
                self.project(document)

    def test_complete_historical_public_projection_matches_the_approved_baseline(self):
        # Baseline from the approved four-story PoC, excluding its separate editorial data.
        history = {k: v for k, v in self.public.items() if k != 'narratives'}
        canonical = json.dumps(history, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
        self.assertEqual(hashlib.sha256(canonical).hexdigest(),
                         '1e79eb8cde89d8ec4865f20ef01400447e2a0b883179434da26d3c8ff2bb691c')

    def test_pending_entries_cannot_publish_invented_events(self):
        document = copy.deepcopy(self.manuscript)
        row = next(w for w in document['works'] if w['status'] == 'pending')
        row['summary'] = {'opening': 'invented', 'development': 'invented', 'ending': 'invented'}
        with self.assertRaises(AssertionError):
            self.project(document)

    def test_newly_identified_candidates_retain_historical_uncertainty(self):
        document = copy.deepcopy(self.manuscript)
        row = next(w for w in document['works'] if w['work_id'] == 'G01-W11')
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

    def test_new_sources_cannot_borrow_a_ledger_id_or_claim_unread_body_confirmation(self):
        for change in ['borrow_id', 'remove_identity', 'remove_confirmation']:
            document = copy.deepcopy(self.manuscript)
            row = next(w for w in document['works'] if w['work_id'] == 'G02-W08')
            review = row['source_reviews'][0]
            if change == 'borrow_id':
                review['source_id'] = 'G01-S021'
            elif change == 'remove_identity':
                review['identity_basis'] = ''
            else:
                row['investigation'] = [a for a in row['investigation'] if a['outcome'] != 'body_confirmed']
            with self.assertRaises(AssertionError):
                self.project(document)

    def test_every_work_needs_a_concrete_individual_investigation(self):
        for change in ['missing', 'no_target', 'bad_timestamp']:
            document = copy.deepcopy(self.manuscript)
            row = next(w for w in document['works'] if w['status'] == 'pending')
            if change == 'missing':
                row['investigation'] = []
            elif change == 'no_target':
                row['investigation'][0].update(url='', query='')
            else:
                row['investigation'][0]['checked_at_utc'] = '2026-10-11'
            with self.assertRaises(AssertionError):
                self.project(document)

    def test_newly_read_fears_do_not_create_historical_classification(self):
        result = self.project(self.manuscript)
        row = next(w for w in result['works'] if w['work_id'] == 'G02-W08')
        fear = next(f for t in row['threads'] for s in t['steps'] for f in s['fears'])
        self.assertEqual(fear['classification_basis'], 'unclassified_new_evidence')
        self.assertEqual(fear['scene_id'], '')
        self.assertEqual(fear['type_ids'], [])
        for field, value in [('scene_id', 'G02-W08-S01'), ('type_ids', ['A2'])]:
            document = copy.deepcopy(self.manuscript)
            row = next(w for w in document['works'] if w['work_id'] == 'G02-W08')
            fear = next(f for t in row['threads'] for s in t['steps'] for f in s['fears'])
            fear[field] = value
            with self.assertRaises(AssertionError):
                self.project(document)

    def test_two_u_teacher_candidates_reference_their_own_body(self):
        row = next(w for w in self.public['narratives']['works'] if w['work_id'] == 'G05-W23')
        self.assertEqual(row['status'], 'scoped')
        self.assertEqual(len(row['threads']), 2)
        for index, thread in enumerate(row['threads'], 1):
            self.assertTrue(all(s['source_review_ids'] == [f'G05-W23-R{index}'] for s in thread['steps']))

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
