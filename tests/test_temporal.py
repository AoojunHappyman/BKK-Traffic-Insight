import unittest
from unittest.mock import patch

from app import create_app
from app.temporal import analyze_time


def observation(day='2024-01-05', survey='a', road='r', start='07:00', end='09:00', minutes=120, total=100):
    return dict(survey_date=day, survey_id=survey, road_id=road, start=start, end=end,
                duration_minutes=minutes, vehicle_total=total)


class TemporalTests(unittest.TestCase):
    def test_calendar_boundaries_and_no_public_holiday_assumption(self):
        data = analyze_time([observation(day=day, survey=day) for day in
                             ['2024-01-01', '2024-01-05', '2024-01-06', '2024-01-07', '2024-01-08']])
        self.assertEqual([g['survey_count'] for g in data['groups']], [3, 2])

    def test_rate_uses_total_exposure_not_mean_of_rates(self):
        data = analyze_time([observation(total=200), observation(road='s', start='09:00',
                            end='17:00', minutes=480, total=400)])
        group = data['groups'][0]
        self.assertEqual(group['vehicles_per_road_hour'], 60)
        self.assertEqual(group['observed_road_hours'], 10)
        self.assertEqual(group['survey_count'], 1)
        self.assertEqual(group['date_count'], 1)
        self.assertEqual(group['road_count'], 2)
        self.assertEqual(len(group['periods']), 2)
        self.assertEqual(sum(p['vehicle_total'] for p in group['periods']), 600)

    def test_distinct_intervals_and_missing_versus_observed_zero(self):
        data = analyze_time([observation(start='09:00', end='16:00', minutes=420, total=0),
                             observation(start='09:00', end='17:00', minutes=480)])
        weekday, weekend = data['groups']
        self.assertEqual(len(weekday['periods']), 2)
        self.assertEqual(weekday['periods'][0]['vehicles_per_road_hour'], 0)
        self.assertIsNone(weekend['periods'][0]['vehicles_per_road_hour'])
        self.assertIsNone(analyze_time([])['totals']['vehicles_per_road_hour'])

    def test_api_filters_parameterized_and_all_rows_included(self):
        client = create_app().test_client()
        with patch('app.routes.traffic.query', return_value=[observation()] * 501) as query:
            value = "x' OR 1=1 --"
            response = client.get('/api/temporal', query_string={'intersection_name': value})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['totals']['observation_count'], 501)
            sql, params = query.call_args.args
            self.assertNotIn(value, sql)
            self.assertIn(value, params)
            query.reset_mock()
            for args in ['limit=100', 'offset=0', 'start_date=2024-02-30',
                         'start_date=2025-01-01&end_date=2024-01-01', 'x=1',
                         'survey_id=invalid', 'start_date=2024-01-01&start_date=2024-01-02']:
                self.assertEqual(client.get('/api/temporal?' + args).status_code, 400)
            query.assert_not_called()
