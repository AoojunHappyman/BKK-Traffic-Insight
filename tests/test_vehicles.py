import unittest
from unittest.mock import patch

from app import create_app
from app.vehicles import CATEGORIES, analyze_vehicles


def observation(name='A', start='07:00', end='09:00', minutes=120, survey='s', road='r', counts=(10, 20, 30, 40, 50, 60)):
    return dict(intersection_name=name, start=start, end=end, duration_minutes=minutes,
                survey_id=survey, road_id=road, survey_date='2024-01-02', vehicle_total=sum(counts),
                **dict(zip([key for key, _ in CATEGORIES], counts)))


class VehicleTests(unittest.TestCase):
    def test_categories_reconcile_across_periods_and_locations(self):
        result = analyze_vehicles([observation(), observation(name='B', survey='t', road='u'),
                                   observation(start='09:00', end='17:00', minutes=480)])
        self.assertEqual(result['totals']['vehicle_total'], 630)
        self.assertEqual(sum(c['count'] for c in result['totals']['categories']), 630)
        for grouping in ['periods', 'locations']:
            self.assertEqual(sum(g['vehicle_total'] for g in result[grouping]), 630)
            for i, category in enumerate(result['totals']['categories']):
                self.assertEqual(sum(g['categories'][i]['count'] for g in result[grouping]), category['count'])
        self.assertEqual(result['totals']['survey_count'], 2)
        self.assertEqual(result['totals']['date_count'], 1)
        self.assertEqual(result['totals']['observed_road_hours'], 12)
        self.assertEqual(result['totals']['categories'][0]['rate'], 2.5)

    def test_share_denominator_is_local_group_and_missing_differs_from_zero(self):
        result = analyze_vehicles([observation(counts=(10, 0, 0, 0, 0, 0)),
                                   observation(name='B', counts=(0, 90, 0, 0, 0, 0))])
        self.assertEqual(result['totals']['categories'][0]['share'], 10)
        group_a = next(g for g in result['locations'] if g['intersection_name'] == 'A')
        self.assertEqual(group_a['categories'][0]['share'], 100)
        empty = analyze_vehicles([])['totals']['categories'][0]
        zero = analyze_vehicles([observation(counts=(0,) * 6)])['totals']['categories'][0]
        self.assertIsNone(empty['rate'])
        self.assertEqual(zero['rate'], 0)
        self.assertIsNone(zero['share'])

    def test_unequal_intervals_remain_separate(self):
        result = analyze_vehicles([observation(start='09:00', end='16:00', minutes=420),
                                   observation(start='09:00', end='17:00', minutes=480)])
        self.assertEqual(len(result['periods']), 2)

    def test_api_exact_period_and_bound_parameters_without_truncation(self):
        client = create_app().test_client()
        with patch('app.routes.traffic.query', return_value=[observation()] * 501) as query:
            value = "x' OR 1=1 --"
            response = client.get('/api/vehicles', query_string={'period': '07:00-09:00',
                                  'intersection_name': value, 'start_date': '2024-01-01'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['totals']['observation_count'], 501)
            sql, params = query.call_args.args
            self.assertNotIn(value, sql)
            self.assertIn(value, params)
            self.assertEqual(params[-2:], ['07:00', '09:00'])
            self.assertIn('o.period_start = %s AND o.period_end = %s', sql)
            self.assertNotIn('LIMIT', sql)
            query.reset_mock()
            for args in ['period=24:00-25:00', 'period=09:00-07:00', 'period=07:00-07:00',
                         'period=x', 'period=07:00-09:00&period=09:00-17:00', 'limit=10',
                         'offset=0', 'start_date=2024-02-30', 'unknown=x']:
                self.assertEqual(client.get('/api/vehicles?' + args).status_code, 400, args)
            self.assertEqual(client.get('/api/temporal?period=07:00-09:00').status_code, 400)
            query.assert_not_called()
