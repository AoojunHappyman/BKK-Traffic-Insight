/* Sum survey volumes at exact source coordinates; zero volume emits no heat. */
function prepareHeatData(rows) {
  const groups = new Map();
  for (const row of rows) {
    const {latitude, longitude} = row;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    const key = `${latitude},${longitude}`;
    if (!groups.has(key)) groups.set(key, {latitude, longitude, total: 0, rows: []});
    const group = groups.get(key);
    group.rows.push(row);
    group.total += Math.max(0, Number(row.vehicle_total) || 0);
  }
  const locations = [...groups.values()];
  const max = locations.reduce((value, group) => Math.max(value, group.total), 0);
  return {groups, max, locations, points: locations.filter(group => group.total > 0)
    .map(group => [group.latitude, group.longitude, group.total / max])};
}
const TRAFFIC_LEVELS = [
  {label: 'Low', color: '#22a06b'}, {label: 'Moderate', color: '#e5b522'},
  {label: 'Heavy', color: '#ed8936'}, {label: 'Very Heavy', color: '#dc4c4c'}
];
function trafficLevel(total, max) {
  const ratio = max > 0 ? total / max : 0;
  return TRAFFIC_LEVELS[ratio <= 0.25 ? 0 : ratio <= 0.5 ? 1 : ratio <= 0.75 ? 2 : 3];
}
function summarizeMapSurveys(rows) {
  const dates = rows.map(row => row.survey_date).filter(Boolean).sort();
  const total = rows.reduce((sum, row) => sum + Number(row.vehicle_total), 0);
  return {total, average: rows.length ? total / rows.length : null,
    surveys: rows.length, dates: new Set(dates).size, latest: dates.at(-1) || null};
}
if (typeof module !== 'undefined') module.exports = {prepareHeatData, trafficLevel, TRAFFIC_LEVELS, summarizeMapSurveys};
