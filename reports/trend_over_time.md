# Trend Over Time — validation

Implemented in the existing Overview; no schema or data source changes.

- `/api/overview.monthly` aggregates `survey.survey_date` by year/month, sums `traffic_observation.vehicle_total`, and counts distinct survey IDs, distinct location names and observation records using the same parameterized filters as other aggregates.
- One response supplies Overview and Trend. Metric/view switches and tooltips perform no new requests. Chart.js instances update in place.
- Monthly view fills calendar gaps between the first and last observed months with null. Year-over-Year aligns January–December for each observed year. Neither view interpolates missing months.
- Peak/lowest use only observed months, preserve observed zeros, and list ties. Latest YoY uses the same month of the previous year within the selection; missing or zero bases give N/A.
- Location counts are distinct source names, not verified geographic identities. Partial-month date filters produce partial-month totals. Coverage accompanies the chart in tooltips, a scrollable table, and the latest comparison note.
- Existing pending-coordinate map changes remain separate: observations from those groups are still included in Overview/Trend.

Validation: 31 Python tests; trend calculation tests (gaps, zeros, ties, missing/zero YoY base, year rollover); existing Overview JS tests. Live MySQL monthly totals, survey counts and observation counts reconcile with Overview for all data, a location/date filter and an empty filter. Browser checked Monthly/YoY, Bang Na selection, empty dates, reset, and mobile layout without horizontal page overflow. June 2026 correctly remains a gap in the current data.
