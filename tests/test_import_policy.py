import json
from pathlib import Path
import tempfile
import unittest

from pipeline.import_mysql import read_bundle


class ImportPolicyTests(unittest.TestCase):
    def test_older_export_cannot_reintroduce_2022(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            tables = {name: [] for name in ['sources', 'surveys', 'roads', 'observations', 'issues']}
            tables['surveys'] = [{'survey_id': 'synthetic', 'survey_date': '2022-07-01', 'report_month': '2022-07-01'}]
            tables['summary'] = {'surveys_accepted': 1, 'observations_accepted': 0}
            for name, value in tables.items():
                (root / f'{name}.json').write_text(json.dumps(value), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, '2022 is excluded'):
                read_bundle(root)
