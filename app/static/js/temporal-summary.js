/* Pure calculations over the existing /api/temporal road-hour aggregates. */
(function(root) {
  const rate = group => group && group.observation_count > 0 && group.observed_road_hours > 0
    ? Number(group.vehicle_total) / Number(group.observed_road_hours) : null;
  const metricValue = (group, metric) => {
    if (!group || !(group.observation_count > 0)) return null;
    if (metric === 'total') return Number(group.vehicle_total);
    if (metric === 'observation') return Number(group.vehicle_total) / Number(group.observation_count);
    return rate(group);
  };
  function summarize(data) {
    const weekday = rate(data.groups.find(g => g.day_type === 'weekday'));
    const weekend = rate(data.groups.find(g => g.day_type === 'weekend'));
    const difference = weekday !== null && weekend !== null && weekend > 0 ? (weekday - weekend) / weekend * 100 : null;
    const periods = new Map();
    for (const group of data.groups) for (const p of group.periods) {
      const key = `${p.start}-${p.end}-${p.duration_minutes}`;
      if (!periods.has(key)) periods.set(key, {start:p.start,end:p.end,vehicle_total:0,observed_road_hours:0,observation_count:0});
      const combined = periods.get(key);
      combined.vehicle_total += Number(p.vehicle_total);
      combined.observed_road_hours += Number(p.observed_road_hours);
      combined.observation_count += Number(p.observation_count);
    }
    const valid = [...periods.values()].map(p => ({...p, rate:rate(p)})).filter(p => p.rate !== null);
    const maximum = valid.length ? Math.max(...valid.map(p => p.rate)) : null;
    const busiest = valid.filter(p => Math.abs(p.rate - maximum) <= 1e-9);
    return {weekday, weekend, difference, maximum, busiest};
  }
  const api = {rate, metricValue, summarize};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TemporalSummary = api;
})(typeof window !== 'undefined' ? window : globalThis);
