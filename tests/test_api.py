import unittest
from unittest.mock import patch

from app import create_app


class APITests(unittest.TestCase):
    def setUp(self):
        self.client = create_app().test_client()

    def test_invalid_filters_rejected_before_database_access(self):
        with patch('app.routes.traffic.connect') as database:
            for query in ['limit=501', 'offset=-1', 'start_date=2024-02-30',
                          'start_date=2025-01-01&end_date=2024-01-01', 'hour=7',
                          'limit=1&limit=2', 'survey_id=invalid']:
                with self.subTest(query=query):
                    self.assertEqual(self.client.get('/api/traffic?' + query).status_code, 400)
            database.assert_not_called()

    def test_missing_database_has_no_secret_or_traceback(self):
        with patch('app.connect', side_effect=ValueError('sensitive connection details')):
            response = self.client.get('/api/health')
            self.assertEqual(response.status_code, 503)
            self.assertNotIn('sensitive', response.get_data(as_text=True))

    def test_filter_values_are_passed_as_parameters(self):
        with patch('app.routes.traffic.query', return_value=[]) as query:
            value = "x' OR 1=1 --"
            response = self.client.get('/api/traffic', query_string={'intersection_name': value})
            self.assertEqual(response.status_code, 200)
            sql, params = query.call_args.args
            self.assertNotIn(value, sql)
            self.assertIn(value, params)
