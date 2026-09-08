"""Synthetic CSV fixtures, never represented as Bangkok traffic observations."""

import json
from pathlib import Path
import tempfile
import unittest

from pipeline.profile import fingerprint, inspect_file, main


class ProfileTests(unittest.TestCase):
    def test_csv_preserves_literals_and_source(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'mock.csv'
            source.write_text('name,count\nNA,0\nNA,0\nNULL,\n', encoding='utf-8')
            before = fingerprint(source)
            sheet = inspect_file(source)['sheets'][0]
            self.assertEqual(sheet['preview'][1]['cells'], {'A': 'NA', 'B': '0'})
            self.assertEqual(sheet['duplicate_nonempty_rows_after_first'], 1)
            self.assertEqual(sheet['columns'][1]['blank_cells'], 1)
            self.assertEqual(fingerprint(source), before)

    def test_corrupt_workbook_reports_error_and_continues(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'broken.xlsx').write_bytes(b'not an Excel workbook')
            (root / 'mock.csv').write_text('a,b\n1,2\n', encoding='utf-8')
            output = root / 'report.json'
            self.assertEqual(main([str(root), '--output', str(output)]), 1)
            result = json.loads(output.read_text(encoding='utf-8'))
            self.assertEqual(len(result['errors']), 1)
            self.assertEqual(len(result['files']), 1)


if __name__ == '__main__':
    unittest.main()
