"""Evidence must not silently turn a cache, blank or fractional count into a fact."""
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

from pipeline.audit_quarantine import audit, cell_evidence


def sheet(value, cell_type='n'):
    cell = SimpleNamespace(coordinate='E5', value=value, data_type=cell_type, number_format='0')
    return SimpleNamespace(cell=lambda row, column: cell)


class QuarantineAuditTests(unittest.TestCase):
    def test_matching_external_cache_is_not_upstream_verification(self):
        snapshots = {'1': {'saved_cells': {'Analysis!B97': {'type': 'n', 'value': '12'}}}}
        evidence = cell_evidence(sheet('=[1]Analysis!$B$97', 'f'), sheet(12), 5, 5, snapshots)
        self.assertEqual(evidence['count_status'], 'formula')
        self.assertEqual(evidence['cached_value'], 12)
        self.assertEqual(evidence['external_reference']['saved_external_cell']['value'], '12')
        self.assertFalse(evidence['external_reference']['upstream_verified'])

    def test_fraction_is_preserved_even_when_number_format_displays_integer(self):
        evidence = cell_evidence(sheet(568.7), sheet(568.7), 5, 5, {})
        self.assertEqual(evidence['value'], 568.7)
        self.assertEqual(evidence['count_status'], 'invalid_literal')

    def test_blank_and_zero_remain_distinct(self):
        blank = cell_evidence(sheet(None), sheet(None), 5, 5, {})
        zero = cell_evidence(sheet(0), sheet(0), 5, 5, {})
        self.assertEqual(blank['count_status'], 'missing')
        self.assertIsNone(blank['value'])
        self.assertEqual(zero['count_status'], 'valid_literal')

    def test_changed_source_cannot_reuse_old_audit_identity(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            baseline = root / 'baseline'
            baseline.mkdir()
            (root / 'source.xlsx').write_bytes(b'Changed source fixture')
            tables = {
                'sources': [{'source_id': 'id', 'filename': 'source.xlsx', 'sha256': 'old-hash'}],
                'all_surveys': [{'source_id': 'id', 'quality_status': 'quarantined'}],
                'rejected_rows': [], 'issues': [],
            }
            for name, rows in tables.items():
                (baseline / f'{name}.json').write_text(json.dumps(rows), encoding='utf-8')
            # Output must be outside the input root, as it is for the real dataset.
            with tempfile.TemporaryDirectory() as destination:
                output = Path(destination) / 'audit'
                with self.assertRaisesRegex(ValueError, 'Source revision differs'):
                    audit(root, baseline, output)
                self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
