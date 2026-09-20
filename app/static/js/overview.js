/* Display only API-provided values; never interpolate source labels as HTML. */
const $ = (id) => document.getElementById(id);
const number = new Intl.NumberFormat('en-US');
let chart;
let locationChart;
let currentData;
let metric = 'total';
const average = (p) => Number(p.observation_count) > 0 ? Number(p.vehicle_total) / Number(p.observation_count) : null;
const decimal = new Intl.NumberFormat('en-US', {maximumFractionDigits: 2});
let controller;
let sequence = 0;
let defaults = {};
const form = $('filters');
const dateLabel = (iso) => iso ? iso.split('-').reverse().join('/') : '—';
if (window.Chart) {
  Chart.defaults.font.family = 'Arial, "Noto Sans Thai", sans-serif';
  Chart.defaults.font.size = 13;
}
if (document.fonts) document.fonts.ready.then(() => {for (const c of [chart, locationChart]) if (c) c.update('none');});

function palette() {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(['accent', 'muted', 'line', 'surface', 'text'].map((key) => [key, style.getPropertyValue(`--${key}`).trim()]));
}

function syncTheme() {
  const light = document.documentElement.classList.contains('light');
  $('theme-toggle').setAttribute('aria-pressed', String(light));
  $('theme-toggle').setAttribute('aria-label', light ? 'เปลี่ยนเป็นโหมดมืด' : 'เปลี่ยนเป็นโหมดสว่าง');
  document.querySelector('meta[name="theme-color"]').content = light ? '#f4f5ef' : '#111512';
  if (currentData) {renderTime(currentData); renderRanking(currentData); OverviewTrend.refresh();}
}
$('theme-toggle').addEventListener('click', () => {
  document.documentElement.classList.toggle('light');
  try { localStorage.setItem('bkk-theme', document.documentElement.classList.contains('light') ? 'light' : 'dark'); } catch (_) {}
  syncTheme();
});
syncTheme();

async function fetchJSON(url, signal) {
  const response = await fetch(url, {signal, headers: {Accept: 'application/json'}});
  if (!response.ok) throw new Error(response.status === 400 ? 'โปรดตรวจสอบวันที่และตัวกรองที่เลือก' : 'เชื่อมต่อข้อมูลไม่ได้ กรุณาตรวจสอบ MySQL แล้วลองอีกครั้ง');
  return response.json();
}

function renderInsights(data) {
  const root = $('insight-cards'); root.replaceChildren();
  const add = (title, value, evidence, limitation, href, label) => {
    const card = document.createElement('article'); card.className = 'insight-card';
    for (const [tag, text, className] of [['h3', title, ''], ['strong', value, 'insight-number'], ['p', evidence, 'evidence'], ['p', limitation, 'insight-note']]) {
      const node = document.createElement(tag); node.textContent = text; node.className = className; card.append(node);
    }
    const link = document.createElement('a'); link.href = href; link.textContent = label; card.append(link); root.append(card);
  };
  if (!data.totals.observation_count) {
    const empty = document.createElement('p'); empty.className = 'insight-empty';
    empty.textContent = 'ไม่มีข้อมูลในตัวกรองนี้ จึงยังสรุปข้อค้นพบไม่ได้ ลองขยายช่วงวันที่หรือเลือกทุกสถานที่'; root.append(empty); return;
  }
  const c = data.insight_coverage;
  const mapLink = $('explore-map').href, timeLink = $('explore-time').href;
  const percent = c.surveys ? (100 * c.mapped / c.surveys).toFixed(1) : '—';
  add('DATA WITH COORDINATES', `${number.format(c.mapped)} / ${number.format(c.surveys)}`,
    `${percent}% ของกลุ่มสำรวจมีพิกัด`, `อีก ${number.format(c.surveys - c.mapped)} กลุ่มไม่มีพิกัด ยังรวมในยอด Overview`, mapLink, 'ดูบน Map →');
  add('WEEKDAY COVERAGE', `${number.format(c.weekday_dates)} วัน`,
    `จันทร์–ศุกร์ ${number.format(c.weekday)} กลุ่ม · เสาร์–อาทิตย์ ${number.format(c.weekend)} กลุ่ม / ${number.format(c.weekend_dates)} วัน`,
    (!c.weekday || !c.weekend ? 'มีข้อมูลเพียงประเภทวันเดียว' : 'ตัวอย่างแต่ละประเภทวันไม่สมดุล') + ' · ยังไม่แยกวันหยุดราชการ', timeLink, 'ดู Time analysis →');
  const highest = Math.max(0, ...data.periods.map(p => Number(p.vehicle_total)));
  if (highest > 0) {
    const leaders = data.periods.filter(p => Number(p.vehicle_total) === highest);
    add(leaders.map(p => `${p.start}–${p.end}`).join(' / '), `${(highest * 100 / Number(data.totals.vehicle_total)).toFixed(1)}%`,
      leaders.length > 1 ? 'แต่ละช่วงมียอดรถรวมสูงสุดเท่ากัน' : 'ของยอดรถที่สำรวจอยู่ในช่วงนี้',
      `${number.format(highest)} คัน${leaders.length > 1 ? ' ต่อช่วง' : ''} · เป็นสัดส่วนยอดรวม ไม่ใช่ข้อสรุปชั่วโมงเร่งด่วน`, timeLink, 'เปรียบเทียบใน Time analysis →');
  } else {
    add('OBSERVED VOLUME', '0 คัน', `${number.format(data.totals.observation_count)} รายการที่สำรวจมียอดเป็นศูนย์`,
      'ไม่ได้หมายความว่าสถานที่หรือช่วงที่ไม่มีข้อมูลไม่มีรถ', timeLink, 'ดู Time analysis →');
  }
}

function chartOptions(colors, horizontal = false) {
  return {responsive: true, maintainAspectRatio: false, animation: false, indexAxis: horizontal ? 'y' : 'x',
    plugins: {legend: {display: false}, tooltip: {backgroundColor: colors.surface, titleColor: colors.text, bodyColor: colors.text, borderColor: colors.line, borderWidth: 1}},
    scales: {x: {beginAtZero: horizontal, grid: {display: horizontal, color: colors.line}, border: {display: false}, ticks: {color: colors.muted, maxTicksLimit: 5}},
      y: {beginAtZero: !horizontal, grid: {display: !horizontal, color: colors.line}, border: {display: false}, ticks: {color: colors.muted, maxTicksLimit: 5}}}};
}

function renderTime(data) {
  const isAverage = metric === 'average';
  const label = isAverage ? 'Average / Observation' : 'Total Volume';
  const unit = isAverage ? 'คัน / รายการ' : 'คัน';
  $('metric-total').setAttribute('aria-pressed', String(!isAverage));
  $('metric-average').setAttribute('aria-pressed', String(isAverage));
  $('metric-label').textContent = `${label} · ${unit}`;
  $('period-chart').setAttribute('aria-label', `${label} ตามช่วงสำรวจ · ${unit}`);
  const values = data.periods.map(p => isAverage ? average(p) : Number(p.vehicle_total));
  $('period-values').replaceChildren();
  data.periods.forEach((p, i) => {
    const value = document.createElement('span');
    value.textContent = `${p.start}–${p.end} · ${values[i] === null ? 'คำนวณไม่ได้' : decimal.format(values[i]) + ' ' + unit} · ${number.format(p.observation_count)} รายการ · ${decimal.format(Number(p.duration_minutes) / 60)} ชม./รายการ`;
    $('period-values').append(value);
  });
  const available = values.some(v => v !== null);
  $('chart-empty').hidden = available && Boolean(window.Chart);
  $('period-chart').hidden = !available || !window.Chart;
  $('chart-empty').textContent = !available ? 'ไม่มีรายการเพียงพอสำหรับตัวชี้วัดนี้' : 'กราฟไม่พร้อมใช้งาน ดูค่าจริงด้านล่างได้';
  if (!available || !window.Chart) {if (chart) {chart.destroy(); chart = undefined;} return;}
  const colors = palette(), options = chartOptions(colors);
  options.scales.y.title = {display: true, text: unit, color: colors.muted};
  options.scales.y.ticks.callback = v => new Intl.NumberFormat('en-US', {notation: 'compact'}).format(v);
  options.plugins.tooltip.callbacks = {label: item => `${label}: ${decimal.format(item.raw)} ${unit}`,
    afterLabel: item => {const p = data.periods[item.dataIndex]; return [`Total Volume: ${number.format(p.vehicle_total)} คัน`, `Observations: ${number.format(p.observation_count)} รายการ`, `Average / Observation: ${average(p) === null ? '—' : decimal.format(average(p)) + ' คัน/รายการ'}`, `${Number(p.duration_minutes) / 60} ชั่วโมงต่อรายการ`];}};
  const highest = Math.max(...values.filter(v => v !== null));
  const chartData = {labels: data.periods.map(p => `${p.start}–${p.end}`), datasets: [{label, data: values, backgroundColor: values.map(v => v === highest ? colors.accent : colors.muted), borderRadius: 4, maxBarThickness: 64}]};
  if (chart) {chart.data = chartData; chart.options = options; chart.update('none');}
  else chart = new Chart($('period-chart'), {type: 'bar', data: chartData, options});
}

function renderRanking(data) {
  const rows = [...data.locations].sort((a,b) => Number(b.vehicle_total) - Number(a.vehicle_total)).slice(0,5);
  $('ranking-values').replaceChildren();
  rows.forEach(row => {const li = document.createElement('li'); li.textContent = `${row.intersection_name}: ${number.format(row.vehicle_total)} คัน · ${number.format(row.survey_count)} กลุ่ม · ${number.format(row.observation_count)} รายการ`; $('ranking-values').append(li);});
  $('location-chart').hidden = !rows.length || !window.Chart;
  $('location-chart-empty').hidden = rows.length > 0 && Boolean(window.Chart);
  $('location-chart-empty').textContent = rows.length ? 'กราฟไม่พร้อมใช้งาน เปิดตารางอันดับแบบละเอียดด้านล่าง' : 'ไม่พบสถานที่ในตัวกรองนี้';
  if (!rows.length || !window.Chart) {if (locationChart) {locationChart.destroy(); locationChart = undefined;} return;}
  const colors = palette(), options = chartOptions(colors, true);
  options.scales.x.title = {display: true, text: 'ยอดรถรวม (คัน)', color: colors.muted};
  options.scales.x.ticks.callback = v => new Intl.NumberFormat('en-US', {notation: 'compact'}).format(v);
  options.scales.y.ticks.callback = function(value) {const name = this.getLabelForValue(value); return name.length > 22 ? name.slice(0,22) + '…' : name;};
  options.plugins.tooltip.callbacks = {label: item => `${number.format(item.raw)} คัน`, afterLabel: item => `${number.format(rows[item.dataIndex].survey_count)} กลุ่มสำรวจ · ${number.format(rows[item.dataIndex].observation_count)} รายการ`};
  const chartData = {labels: rows.map(r => r.intersection_name), datasets: [{data: rows.map(r => Number(r.vehicle_total)), backgroundColor: rows.map(r => Number(r.vehicle_total) === Number(rows[0].vehicle_total) ? colors.accent : colors.muted), borderRadius: 4, maxBarThickness: 25}]};
  if (locationChart) {locationChart.data = chartData; locationChart.options = options; locationChart.update('none');}
  else locationChart = new Chart($('location-chart'), {type: 'bar', data: chartData, options});
}

for (const [id, mode] of [['metric-total', 'total'], ['metric-average', 'average']]) $(id).addEventListener('click', () => {
  metric = mode; if (currentData) renderTime(currentData);
});

function setExploreLinks(params) {
  for (const [id, path] of [['explore-map', '/map'], ['explore-time', '/temporal']]) $(id).href = path + (params ? '?' + params : '');
  $('explore-context').textContent = params ? 'เปิดดูต่อด้วยตัวกรองเดียวกัน' : 'สำรวจข้อมูลผ่าน Map และ Time analysis';
  $('rate-link').href = $('explore-time').href;
}

function render(data) {
  currentData = data;
  renderInsights(data);
  const totals = data.totals;
  for (const [id, key] of [['vehicle-total', 'vehicle_total'], ['survey-count', 'survey_count'], ['road-count', 'road_count'], ['observation-count', 'observation_count']]) $(id).textContent = number.format(totals[key]);
  const vehicles = Number(totals.vehicle_total);
  $('vehicle-total').textContent = vehicles >= 1000000 ? `${(vehicles / 1000000).toFixed(2)}M` : number.format(vehicles);
  $('vehicle-exact').textContent = `${number.format(vehicles)} คัน · เฉพาะช่วงที่สำรวจ`;
  const geo = data.insight_coverage;
  $('geo-coverage').textContent = geo.surveys ? `${(100 * geo.mapped / geo.surveys).toFixed(1)}%` : '—';
  $('geo-coverage-detail').textContent = geo.surveys
    ? `${number.format(geo.mapped)} / ${number.format(geo.surveys)} กลุ่มมีพิกัด · ขาด ${number.format(geo.surveys - geo.mapped)} กลุ่ม`
    : 'ไม่มีข้อมูลในตัวกรองนี้';
  $('date-range').textContent = totals.first_survey ? `${dateLabel(totals.first_survey)} — ${dateLabel(totals.last_survey)}` : 'ไม่พบวันสำรวจ';
  $('selection-location').textContent = $('location').value || 'ทุกสถานที่';
  $('geo-progress').hidden = !geo.surveys;
  $('geo-progress').value = geo.surveys ? 100 * geo.mapped / geo.surveys : 0;
  $('geo-progress').setAttribute('aria-valuetext', $('geo-coverage-detail').textContent);
  $('quality-geo').textContent = $('geo-coverage').textContent;
  $('quality-geo-detail').textContent = `${number.format(geo.mapped)} / ${number.format(geo.surveys)} กลุ่มมีพิกัด`;
  $('quality-missing').textContent = `${number.format(geo.surveys - geo.mapped)} กลุ่ม`;
  $('quality-review').textContent = `${number.format(defaults.quarantined_surveys)} กลุ่ม`;
  $('note-types').textContent = `${number.format(totals.vehicle_type_count)} ประเภท`;
  $('note-records').textContent = number.format(totals.observation_count);
  $('survey-hours').textContent = data.periods.length ? `${data.periods.map(p => p.start).sort()[0]} — ${data.periods.map(p => p.end).sort().at(-1)}` : '—';
  renderTime(data);
  renderRanking(data);
  OverviewTrend.update(data.monthly || []);
  $('location-rows').replaceChildren();
  data.locations.forEach((location, index) => {
    const row = document.createElement('tr');
    const rankCell = document.createElement('td');
    const rank = document.createElement('span');
    rank.className = `rank${index < 3 ? ' top' : ''}`;
    rank.textContent = String(index + 1).padStart(2, '0');
    rankCell.append(rank); row.append(rankCell);
    [location.intersection_name, number.format(location.vehicle_total), number.format(location.survey_count), number.format(location.observation_count), `${dateLabel(location.first_survey)} – ${dateLabel(location.last_survey)}`].forEach((value, i) => {
      const cell = document.createElement('td'); cell.textContent = value;
      if (i === 1 || i === 2 || i === 3) cell.className = `numeric${i === 1 ? ' table-number' : ''}`;
      row.append(cell);
    });
    $('location-rows').append(row);
  });
  if (!data.locations.length) {const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 6; cell.textContent = 'ไม่พบข้อมูล ลองขยายช่วงวันที่หรือเลือกทุกสถานที่'; row.append(cell); $('location-rows').append(row);}
  $('status').textContent = totals.observation_count ? `แสดง ${number.format(totals.observation_count)} รายการที่ผ่านการตรวจข้อมูล` : 'ไม่พบข้อมูลในตัวกรองนี้';
}

async function load() {
  TrafficExport.invalidate();
  setExploreLinks('');
  if (controller) controller.abort();
  const current = ++sequence;
  const start = $('start-date').value, end = $('end-date').value;
  if (start && end && start > end) {$('status').textContent = 'วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด'; $('status').className = 'error'; $('results').hidden = true; $('results').setAttribute('aria-busy', 'false'); return;}
  controller = new AbortController();
  const params = new URLSearchParams();
  if (start) params.set('start_date', start);
  if (end) params.set('end_date', end);
  if ($('location').value) params.set('intersection_name', $('location').value);
  $('results').setAttribute('aria-busy', 'true'); $('results').classList.add('stale');
  $('status').className = ''; $('status').textContent = 'กำลังโหลดข้อมูล…';
  try {
    const data = await fetchJSON(`/api/overview?${params}`, controller.signal);
    if (current !== sequence) return;
    // Include empty date values so an unbounded selection stays unbounded on arrival.
    const linkParams = new URLSearchParams({start_date: start, end_date: end, intersection_name: params.get('intersection_name') || ''});
    setExploreLinks(linkParams.toString());
    $('results').hidden = false; render(data); $('results').classList.remove('stale');
    TrafficExport.ready(params, data.totals.observation_count);
  } catch (error) {
    if (error.name !== 'AbortError' && current === sequence) {$('status').textContent = error.message; $('status').className = 'error'; $('results').hidden = true;}
  } finally {if (current === sequence) $('results').setAttribute('aria-busy', 'false');}
}

form.addEventListener('submit', (event) => {event.preventDefault(); defaults.locations ? load() : initialize();});
$('reset').addEventListener('click', () => {$('start-date').value = defaults.start_date || ''; $('end-date').value = defaults.end_date || ''; $('location').value = ''; metric = 'total'; OverviewTrend.reset(); defaults.locations ? load() : initialize();});

async function initialize() {
  try {
    defaults = await fetchJSON('/api/overview/options');
    $('start-date').value = defaults.start_date || ''; $('end-date').value = defaults.end_date || '';
    defaults.locations.forEach((name) => {const option = document.createElement('option'); option.value = name; option.textContent = name; $('location').append(option);});
    $('coverage').textContent = `ทั้งชุดข้อมูลแยกไว้ตรวจต่อ ${number.format(defaults.quarantined_surveys)} กลุ่มสำรวจ ไม่รวมในยอดที่แสดง และมีกลุ่มที่ผ่านแต่ไม่มีพิกัดใช้งานได้ ${number.format(defaults.coverage.without_coordinates || 0)} กลุ่ม`;
    await load();
  } catch (error) {$('status').textContent = error.message; $('status').className = 'error'; $('results').hidden = true; $('results').setAttribute('aria-busy', 'false'); $('coverage').textContent = 'ยังโหลดข้อมูลความครอบคลุมไม่ได้';}
}
initialize();
