# Overview analytics improvement — 2026-09-15

Implemented in the existing Overview template, JavaScript and Overview-only CSS. MySQL remains the source. No dataset is downloaded again for metric toggles. Existing Chart.js instances update in place; empty selections destroy and later recreate them safely.

## Delivered
- Compact hero, Map/Time navigation, grouped filters and applied selection summary.
- Five KPIs with exact totals, coordinate coverage and an accessible progress bar.
- Three concise evidence cards: coordinates, weekday survey days and volume share (ties/zero/empty handled).
- Total Volume / Average per Observation toggle, exact metric tooltips and text equivalents.
- Dynamic survey hours, schema-defined vehicle categories and observation counts.
- Horizontal top-five ranking with sample counts in tooltips and an expandable original top-ten table.
- Filtered coordinate completeness and missing-coordinate counts, alongside explicitly dataset-wide review counts.
- Shared light/dark theme, keyboard controls and responsive layout.

## Data interpretation
Average per observation divides by the number of records, not their duration. It cannot establish congestion or normalize unequal survey hours. The note links to existing Time analysis for rates per hour. Weekday coverage is distinct days (not mislabeled as groups). Needs review is dataset-wide: the issue table lacks survey dates/location names for quarantined groups; no filtered count is fabricated.

The existing API gained only vehicle_type_count (from existing category definitions; zero for empty selections) and per-location observation_count. Filters and existing response fields remain unchanged.

## Validation
- 30 Python tests passed, including parameterized filters on every Overview aggregate.
- Overview evidence tests passed (ties, zero totals, empty results, destination links).
- Metric tests passed (unequal denominators, true zero vs missing denominator, chart reuse, empty states).
- Live MySQL: period totals and counts reconcile with KPIs; location totals sorted descending; Overview, Map, Time and Vehicles routes return 200.
- Browser: all-data result, location selection, empty date range, reset including metric, metric toggle, detail table and theme switch checked.
- Browser: 1440px desktop, 820px tablet and 390px mobile checked; no page-wide horizontal overflow. Wide detail table scrolls within its container.
- Current analytics-3 assets render without new console errors after restarting the old Flask listener (the earlier cached kpis-2 template had a version mismatch).

Reference live values: 30,651,553 vehicles; 820 groups; 1,569 road groups; 4,707 records; 807/820 coordinate coverage; 13 missing; 9 dataset-wide review groups. These are validation observations, not UI constants.
