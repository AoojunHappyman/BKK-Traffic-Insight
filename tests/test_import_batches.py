import unittest
from unittest.mock import MagicMock, patch

from pipeline.import_mysql import import_bundle


class ImportBatchTests(unittest.TestCase):
    def run_import(self, records, stored=(), write_error=None):
        connection = MagicMock()
        connection.__enter__.return_value = connection
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.fetchone.return_value = {'acquired': 1}
        responses = [[{'Field': 'survey_id'}, {'Field': 'name'}]]
        responses += [list(stored)] + [[] for _ in range((len(records) - 1) // 500)]
        cursor.fetchall.side_effect = responses
        cursor.executemany.side_effect = write_error
        bundle = {'sources': [], 'surveys': records, 'observations': []}
        with patch('pipeline.import_mysql.connect', return_value=connection), \
                patch('pipeline.import_mysql.TABLES', [('surveys', 'survey', 'survey_id')]):
            try:
                result = import_bundle(bundle)
            except Exception as error:
                result = error
        return result, connection, cursor

    def test_new_rows_are_batched_and_committed_once(self):
        rows = [{'survey_id': str(i), 'name': 'สถานที่'} for i in range(501)]
        result, connection, cursor = self.run_import(rows)
        self.assertEqual(result['survey'], {'inserted': 501, 'unchanged': 0})
        self.assertEqual([len(c.args[1]) for c in cursor.executemany.call_args_list], [500, 1])
        written = [row for call in cursor.executemany.call_args_list for row in call.args[1]]
        self.assertEqual(written, [(r['survey_id'], r['name']) for r in rows])
        connection.commit.assert_called_once()
        connection.rollback.assert_not_called()

    def test_repeat_import_and_conflict_preserve_existing_data(self):
        row = {'survey_id': 'same', 'name': 'original'}
        result, connection, cursor = self.run_import([row], [row])
        self.assertEqual(result['survey'], {'inserted': 0, 'unchanged': 1})
        cursor.executemany.assert_not_called()
        result, connection, cursor = self.run_import([dict(row, name='changed')], [row])
        self.assertIsInstance(result, ValueError)
        cursor.executemany.assert_not_called()
        connection.rollback.assert_called_once()
        connection.commit.assert_not_called()

    def test_batch_error_rolls_back_and_releases_import_lock(self):
        result, connection, cursor = self.run_import(
            [{'survey_id': 'new', 'name': 'new'}], write_error=RuntimeError('write failed'))
        self.assertIsInstance(result, RuntimeError)
        connection.rollback.assert_called_once()
        connection.commit.assert_not_called()
        self.assertIn('RELEASE_LOCK', cursor.execute.call_args.args[0])


if __name__ == '__main__':
    unittest.main()
