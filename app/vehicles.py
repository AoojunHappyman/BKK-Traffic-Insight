"""Vehicle mix using the six mutually exclusive categories in source reports."""
from collections import defaultdict

from app.temporal import summarize

CATEGORIES = (
    ('passenger_car', 'รถยนต์นั่ง'), ('van_pickup', 'รถตู้ / ปิคอัพ'),
    ('large_bus', 'รถเมล์ใหญ่'), ('small_bus', 'รถเมล์เล็ก'),
    ('truck', 'รถบรรทุก'), ('three_wheeler', 'รถสามล้อ'),
)


def vehicle_summary(rows):
    totals = summarize(rows)
    counts = {key: sum(int(row[key]) for row in rows) for key, _ in CATEGORIES}
    minutes = sum(row['duration_minutes'] for row in rows)
    return dict(**totals, categories=[dict(
        key=key, label=label, count=counts[key],
        share=round(counts[key] * 100 / totals['vehicle_total'], 2) if totals['vehicle_total'] else None,
        rate=round(counts[key] * 60 / minutes, 2) if minutes else None,
    ) for key, label in CATEGORIES])


def analyze_vehicles(rows):
    periods, locations = defaultdict(list), defaultdict(list)
    for row in rows:
        periods[(row['start'], row['end'], row['duration_minutes'])].append(row)
        locations[row['intersection_name']].append(row)
    return dict(
        totals=vehicle_summary(rows),
        periods=[dict(start=start, end=end, duration_minutes=duration, **vehicle_summary(group))
                 for (start, end, duration), group in sorted(periods.items())],
        locations=sorted([dict(intersection_name=name, **vehicle_summary(group))
                          for name, group in locations.items()],
                         key=lambda group: (-group['vehicle_total'], group['intersection_name'])),
    )
