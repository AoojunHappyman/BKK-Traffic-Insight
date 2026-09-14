import unittest
from unittest.mock import patch

from app import create_app


class APITests(unittest.TestCase):
    def setUp(self):
        self.client = create_app().test_client()

    def test_overview_filters_apply_to_every_aggregate(self):
        responses = [[{'observation_count': 0}], [], [], [{'surveys': 0, 'mapped': 0}]]
        with patch('app.routes.traffic.query', side_effect=responses) as query:
            response = self.client.get('/api/overview', query_string={
                'start_date': '2024-01-01', 'end_date': '2024-12-31',
                'intersection_name': "x' OR 1=1 --"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['totals']['vehicle_type_count'], 0)
        self.assertEqual(query.call_count, 4)
        for call in query.call_args_list:
            sql, params = call.args
            self.assertIn('s.survey_date >= %s', sql)
            self.assertIn('s.survey_date <= %s', sql)
            self.assertIn('s.intersection_name = %s', sql)
            self.assertEqual(params, ['2024-01-01', '2024-12-31', "x' OR 1=1 --"])
        self.assertIn('COUNT(*) AS observation_count', query.call_args_list[2].args[0])

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

    def test_map_keeps_all_surveys_at_shared_coordinates(self):
        rows = [dict(survey_id=str(i), latitude=13.7, longitude=100.5, vehicle_total=i)
                for i in range(1, 808)]
        rows += [dict(latitude=None, longitude=None, vehicle_total=100)] * 13
        with patch('app.routes.traffic.query', return_value=rows):
            result = self.client.get('/api/map').get_json()
        self.assertEqual(len(result['data']), 807)
        self.assertEqual(result['coverage'], dict(matched=820, mapped=807, excluded=13,
                                                 vehicle_total=sum(range(1, 808))))

    def test_map_empty_and_invalid_coordinates(self):
        for rows, excluded in [([], 0), ([dict(latitude=91, longitude=100, vehicle_total=5),
                                         dict(latitude=13, longitude=None, vehicle_total=5)], 2)]:
            with patch('app.routes.traffic.query', return_value=rows):
                result = self.client.get('/api/map').get_json()
            self.assertEqual(result['data'], [])
            self.assertEqual(result['coverage']['excluded'], excluded)
            self.assertEqual(result['coverage']['vehicle_total'], 0)

    def test_map_filters_and_no_silent_pagination(self):
        with patch('app.routes.traffic.query', return_value=[]) as query:
            value = "x' OR 1=1 --"
            self.assertEqual(self.client.get('/api/map', query_string={
                'intersection_name': value, 'start_date': '2024-01-01'}).status_code, 200)
            sql, params = query.call_args.args
            self.assertNotIn(value, sql)
            self.assertIn(value, params)
            self.assertNotIn('LIMIT', sql)
            query.reset_mock()
            for args in ['limit=100', 'offset=0', 'start_date=2024-02-30',
                         'start_date=2025-01-01&end_date=2024-01-01', 'unknown=x']:
                self.assertEqual(self.client.get('/api/map?' + args).status_code, 400)
            query.assert_not_called()
