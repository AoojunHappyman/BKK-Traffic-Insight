"""Descriptive rates over observed road-intervals, never inferred hourly counts."""
from datetime import date


def summarize(rows):
    minutes = sum(r['duration_minutes'] for r in rows)
    total = sum(int(r['vehicle_total']) for r in rows)
    return dict(vehicle_total=total, observation_count=len(rows),
                survey_count=len({r['survey_id'] for r in rows}),
                road_count=len({r['road_id'] for r in rows}),
                date_count=len({r['survey_date'] for r in rows}),
                observed_road_hours=minutes / 60,
                vehicles_per_road_hour=round(total * 60 / minutes, 2) if minutes else None)


def analyze_time(rows):
    periods = sorted({(r['start'], r['end'], r['duration_minutes']) for r in rows})
    groups = []
    for key in ('weekday', 'weekend'):
        subset = [r for r in rows if ('weekend' if date.fromisoformat(r['survey_date']).weekday() >= 5
                                     else 'weekday') == key]
        groups.append(dict(day_type=key, **summarize(subset), periods=[
            dict(start=start, end=end, duration_minutes=duration, **summarize([
                r for r in subset if (r['start'], r['end'], r['duration_minutes']) == (start, end, duration)]))
            for start, end, duration in periods]))
    return dict(totals=summarize(rows), groups=groups,
                classification='weekday=Monday-Friday; weekend=Saturday-Sunday; public holidays not classified',
                rate_definition='sum(vehicle_total) / (sum(duration_minutes) / 60); observed road-hours')
