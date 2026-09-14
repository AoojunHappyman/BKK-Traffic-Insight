/* Display only API-provided values; never interpolate source labels as HTML. */
const $ = (id) => document.getElementById(id);
const number = new Intl.NumberFormat('en-US');
let chart;
let controller;
let sequence = 0;
let defaults = {};
const form = $('filters');
const dateLabel = (iso) => iso ? iso.split('-').reverse().join('/') : '—';
if (window.Chart) {
  Chart.defaults.font.family = 'Arial, "Noto Sans Thai", sans-serif';
  Chart.defaults.font.size = 13;
}
if (document.fonts) document.fonts.ready.then(() => {if (chart) chart.update('none');});

function palette() {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(['accent', 'muted', 'line', 'surface', 'text'].map((key) => [key, style.getPropertyValue(`--${key}`).trim()]));
}

function syncTheme() {
  const light = document.documentElement.classList.contains('light');
  $('theme-toggle').setAttribute('aria-pressed', String(light));
  $('theme-toggle').setAttribute('aria-label', light ? 'เปลี่ยนเป็นโหมดมืด' : 'เปลี่ยนเป็นโหมดสว่าง');
  document.querySelector('meta[name="theme-color"]').content = light ? '#f4f5ef' : '#111512';
  if (chart) {
    const colors = palette();
    chart.data.datasets[0].backgroundColor = colors.accent;
    chart.data.datasets[0].hoverBackgroundColor = colors.accent;
    for (const axis of ['x', 'y']) chart.options.scales[axis].ticks.color = colors.muted;
    chart.options.scales.y.grid.color = colors.line;
    Object.assign(chart.options.plugins.tooltip, {backgroundColor: colors.surface, titleColor: colors.text, bodyColor: colors.text, borderColor: colors.line});
    chart.update('none');
  }
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
  const add = (title, evidence, limitation, href, label) => {
    const card = document.createElement('article'); card.className = 'insight-card';
    for (const [tag, text, className] of [['h3', title, ''], ['p', evidence, 'evidence'], ['p', limitation, '']]) {
      const node = document.createElement(tag); node.textContent = text; node.className = className; card.append(node);
    }
    const link = document.createElement('a'); link.href = href; link.textContent = label; card.append(link); root.append(card);
  };
  if (!data.totals.observation_count) {
    const empty = document.createElement('p'); empty.className = 'insight-empty';
    empty.textContent = 'ไม่มีข้อมูลในตัวกรองนี้ จึงยังสรุปข้อค้นพบไม่ได้ ลองขยายช่วงวันที่หรือเลือกทุกสถานที่'; root.append(empty); return;
  }
  const coverage = data.insight_coverage;
  const mapLink = $('explore-map').href, timeLink = $('explore-time').href;
  const percent = coverage.surveys ? (100 * coverage.mapped / coverage.surveys).toFixed(1) : '0';
  add('ข้อมูลที่เปิดดูบนแผนที่ได้',
    `${number.format(coverage.mapped)} จาก ${number.format(coverage.surveys)} กลุ่มสำรวจมีพิกัด (${percent}%) · อีก ${number.format(coverage.surveys - coverage.mapped)} กลุ่มไม่มีพิกัด`,
    'แผนที่เว้นกลุ่มที่ไม่มีพิกัด แต่ยอดรวมบน Overview ยังรวมกลุ่มเหล่านี้ จำนวนกลุ่มไม่ใช่จำนวนสถานที่ไม่ซ้ำ', mapLink, 'ดูหลักฐานบน Map →');
  add('ขนาดตัวอย่างของแต่ละประเภทวัน',
    `จันทร์–ศุกร์ ${number.format(coverage.weekday)} กลุ่ม / ${number.format(coverage.weekday_dates)} วัน · เสาร์–อาทิตย์ ${number.format(coverage.weekend)} กลุ่ม / ${number.format(coverage.weekend_dates)} วัน`,
    !coverage.weekday || !coverage.weekend ? 'มีข้อมูลเพียงประเภทวันเดียว จึงยังเปรียบเทียบระหว่างประเภทวันไม่ได้ วันหยุดราชการยังไม่ได้แยกออกจากจันทร์–ศุกร์' : 'จำนวนและสถานที่สำรวจอาจไม่สมดุล ยังสรุปผลแทนทุกวันไม่ได้ วันหยุดราชการยังไม่ได้แยกออกจากจันทร์–ศุกร์', timeLink, 'ตรวจตัวอย่างใน Time analysis →');
  const peak = Math.max(...data.periods.map(p => Number(p.vehicle_total)));
  if (peak > 0) {
    const leaders = data.periods.filter(p => Number(p.vehicle_total) === peak);
    const p = leaders[0];
    add(leaders.length > 1 ? 'หลายช่วงมียอดรถรวมสูงสุดเท่ากัน' : `ช่วง ${p.start}–${p.end} มียอดรถรวมสูงสุด`,
      leaders.length > 1 ? `${leaders.map(p => `${p.start}–${p.end}`).join(', ')} · ช่วงละ ${number.format(peak)} คัน` : `${number.format(peak)} จาก ${number.format(data.totals.vehicle_total)} คัน (${(peak * 100 / data.totals.vehicle_total).toFixed(1)}%) · ${number.format(p.observation_count)} รายการ · ${p.duration_minutes / 60} ชั่วโมงต่อรายการ`,
      'เป็นยอดรวมเฉพาะช่วงที่พบในตัวกรอง ระยะเวลาและจำนวนรายการต่างกัน จึงยังระบุชั่วโมงเร่งด่วนหรือความแออัดไม่ได้', timeLink, 'เปรียบเทียบอัตราใน Time analysis →');
  } else {
    add('รายการที่สำรวจมียอดรถรวมเป็นศูนย์', `${number.format(data.totals.observation_count)} รายการที่ผ่านการตรวจ รวม 0 คัน`,
      'สรุปเฉพาะรายการที่มี ไม่ได้หมายความว่าช่วงหรือสถานที่ที่ไม่มีข้อมูลไม่มีรถ', timeLink, 'ดูรายละเอียดช่วงสำรวจ →');
  }
}

function setExploreLinks(params) {
  for (const [id, path] of [['explore-map', '/map'], ['explore-time', '/temporal']]) $(id).href = path + (params ? '?' + params : '');
  $('explore-context').textContent = params ? 'ลิงก์ Map และ Time analysis ใช้วันที่และสถานที่จากผลลัพธ์ที่แสดงล่าสุด' : 'เลือกดูข้อมูลทั้งหมดผ่าน Map หรือ Time analysis';
}

function render(data) {
  renderInsights(data);
  const totals = data.totals;
  for (const [id, key] of [['vehicle-total', 'vehicle_total'], ['survey-count', 'survey_count'], ['road-count', 'road_count'], ['observation-count', 'observation_count']]) $(id).textContent = number.format(totals[key]);
  $('date-range').textContent = totals.first_survey ? `${dateLabel(totals.first_survey)} — ${dateLabel(totals.last_survey)}` : 'ไม่พบวันสำรวจ';
  $('period-values').replaceChildren();
  data.periods.forEach((p) => {
    const value = document.createElement('span');
    value.textContent = `${p.start}–${p.end} · ${number.format(p.vehicle_total)} คัน / ${number.format(p.observation_count)} รายการ`;
    $('period-values').append(value);
  });
  if (chart) {chart.destroy(); chart = undefined;}
  $('chart-empty').textContent = 'ไม่พบข้อมูลในตัวกรองนี้';
  $('chart-empty').hidden = data.periods.length > 0;
  $('period-chart').hidden = !data.periods.length;
  if (data.periods.length && window.Chart) {
    const colors = palette();
    chart = new Chart($('period-chart'), {
      type: 'bar',
      data: {labels: data.periods.map((p) => `${p.start}–${p.end}`), datasets: [{data: data.periods.map((p) => p.vehicle_total), backgroundColor: colors.accent, hoverBackgroundColor: colors.accent, borderRadius: 3, maxBarThickness: 66}]},
      options: {responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {legend: {display: false}, tooltip: {backgroundColor: colors.surface, titleColor: colors.text, bodyColor: colors.text, borderColor: colors.line, borderWidth: 1, callbacks: {label: (item) => `${number.format(item.raw)} คัน`, afterLabel: (item) => `${number.format(data.periods[item.dataIndex].observation_count)} รายการ · ${data.periods[item.dataIndex].duration_minutes / 60} ชม./รายการ`}}},
        scales: {x: {grid: {display: false}, border: {display: false}, ticks: {color: colors.muted, font: {size: 12, family: 'Consolas, monospace'}}}, y: {beginAtZero: true, border: {display: false}, grid: {color: colors.line}, ticks: {color: colors.muted, maxTicksLimit: 5, callback: (v) => v >= 1000000 ? `${v / 1000000}M` : number.format(v)}}}}
    });
  } else if (data.periods.length) {
    $('period-chart').hidden = true;
    $('chart-empty').hidden = false;
    $('chart-empty').textContent = 'กราฟไม่พร้อมใช้งาน ดูตัวเลขตามช่วงเวลาด้านล่างได้';
  }
  $('location-rows').replaceChildren();
  data.locations.forEach((location, index) => {
    const row = document.createElement('tr');
    const rankCell = document.createElement('td');
    const rank = document.createElement('span');
    rank.className = `rank${index < 3 ? ' top' : ''}`;
    rank.textContent = String(index + 1).padStart(2, '0');
    rankCell.append(rank); row.append(rankCell);
    [location.intersection_name, number.format(location.vehicle_total), number.format(location.survey_count), `${dateLabel(location.first_survey)} – ${dateLabel(location.last_survey)}`].forEach((value, i) => {
      const cell = document.createElement('td'); cell.textContent = value;
      if (i === 1 || i === 2) cell.className = `numeric${i === 1 ? ' table-number' : ''}`;
      row.append(cell);
    });
    $('location-rows').append(row);
  });
  if (!data.locations.length) {const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 5; cell.textContent = 'ไม่พบข้อมูล ลองขยายช่วงวันที่หรือเลือกทุกสถานที่'; row.append(cell); $('location-rows').append(row);}
  $('status').textContent = totals.observation_count ? `แสดง ${number.format(totals.observation_count)} รายการที่ผ่านการตรวจข้อมูล` : 'ไม่พบข้อมูลในตัวกรองนี้';
}

async function load() {
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
  } catch (error) {
    if (error.name !== 'AbortError' && current === sequence) {$('status').textContent = error.message; $('status').className = 'error'; $('results').hidden = true;}
  } finally {if (current === sequence) $('results').setAttribute('aria-busy', 'false');}
}

form.addEventListener('submit', (event) => {event.preventDefault(); defaults.locations ? load() : initialize();});
$('reset').addEventListener('click', () => {$('start-date').value = defaults.start_date || ''; $('end-date').value = defaults.end_date || ''; $('location').value = ''; defaults.locations ? load() : initialize();});

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
