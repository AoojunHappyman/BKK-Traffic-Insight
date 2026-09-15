/* Display only API-provided values; never interpolate source labels as HTML. */
const $ = (id) => document.getElementById(id);
const number = new Intl.NumberFormat('en-US');
let chart;
let currentData;
let metric = 'hour';
const decimal = new Intl.NumberFormat('en-US', {maximumFractionDigits: 2});
const signedPercent = value => value === null ? 'N/A' : `${value > 0 ? '+' : ''}${decimal.format(value)}%`;
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
  if (currentData) renderChart(currentData);
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

function renderSummary(data) {
  const s = TemporalSummary.summarize(data);
  const fmt = v => v === null ? 'N/A' : decimal.format(v);
  $('weekday-avg').textContent = fmt(s.weekday);
  $('weekend-avg').textContent = fmt(s.weekend);
  $('day-difference').textContent = signedPercent(s.difference);
  $('difference-note').textContent = s.difference !== null ? 'จันทร์–ศุกร์ เทียบฐานเสาร์–อาทิตย์' :
    s.weekday === null || s.weekend === null ? 'ไม่มีข้อมูลครบสองประเภทวัน' : 'ฐานเสาร์–อาทิตย์เป็นศูนย์ คำนวณ % ไม่ได้';
  const periods = s.busiest.map(p => `${p.start}–${p.end}`).join(' / ');
  $('busiest-period').textContent = periods || 'N/A';
  $('peak-period').textContent = periods || 'N/A';
  $('peak-rate').textContent = s.maximum === null ? 'ไม่มีข้อมูลชั่วโมงสำรวจเพียงพอ' : `${fmt(s.maximum)} คัน / ชั่วโมงสำรวจกลุ่มถนน`;
  $('peak-insight').textContent = !s.busiest.length ? 'ยังระบุช่วงที่มีอัตราสูงสุดไม่ได้' : s.maximum === 0 ? 'ทุกช่วงที่มีข้อมูลมียอดรถเป็นศูนย์ ไม่มีช่วงที่เด่นกว่า' :
    s.busiest.length > 1 ? 'หลายช่วงมีอัตราเฉลี่ยสูงสุดเท่ากัน รวมข้อมูลทั้งสองประเภทวัน' : 'ช่วงนี้มีอัตราเฉลี่ยสูงสุด เมื่อรวมข้อมูลทั้งสองประเภทวัน';
  $('day-insight').textContent = s.difference === null ? $('difference-note').textContent :
    Math.abs(s.difference) < 1 ? 'อัตราเฉลี่ยรวมของจันทร์–ศุกร์และเสาร์–อาทิตย์ใกล้เคียงกัน (ต่างกันน้อยกว่า 1% เมื่อเทียบฐานเสาร์–อาทิตย์)' :
    `อัตราเฉลี่ยรวมของจันทร์–ศุกร์${s.difference > 0 ? 'สูงกว่า' : 'ต่ำกว่า'}เสาร์–อาทิตย์ ${decimal.format(Math.abs(s.difference))}% · เทียบทุกช่วงสำรวจรวมกัน ไม่ใช่เฉพาะช่วงสูงสุด`;
}

function renderChart(data) {
  const labels = {weekday:'จันทร์–ศุกร์',weekend:'เสาร์–อาทิตย์'};
  const metrics = {total:['Total Volume','คัน'],hour:['Average / Hour','คัน / ชั่วโมงสำรวจกลุ่มถนน'],observation:['Average / Observation','คัน / รายการสำรวจ']};
  const [label,unit] = metrics[metric];
  for (const button of document.querySelectorAll('[data-metric]')) button.setAttribute('aria-pressed', String(button.dataset.metric === metric));
  $('time-metric-label').textContent = `${label} · ${unit}`;
  $('metric-method').textContent = ({total:'ยอดรถรวมตามช่วงสำรวจ ยังไม่ปรับจำนวนรายการหรือชั่วโมง',hour:'ยอดรถรวม ÷ ชั่วโมงสำรวจรวมของทุกกลุ่มถนน ปรับความยาวช่วงและจำนวนรายการ',observation:'ยอดรถรวม ÷ จำนวนรายการ (กลุ่มถนน × กลุ่มสำรวจ × ช่วงเวลา) ยังไม่ปรับความยาวช่วง'})[metric] + ' · ยังไม่ได้ควบคุมสถานที่ ช่องทาง หรือฤดูกาล ช่องที่ไม่มีข้อมูลเว้นว่าง ไม่แทนด้วยศูนย์';
  $('time-chart').setAttribute('aria-label', `${label}: จันทร์–ศุกร์เทียบเสาร์–อาทิตย์ · ${unit}`);
  $('time-chart').setAttribute('aria-describedby', 'time-metric-values');
  $('time-metric-values').replaceChildren();
  for (const group of data.groups) for (const p of group.periods) {
    const value = TemporalSummary.metricValue(p,metric), el = document.createElement('span');
    el.textContent = `${p.start}–${p.end} · ${labels[group.day_type]}: ${value === null ? 'N/A (ไม่มีข้อมูล)' : decimal.format(value) + ' ' + unit}`;
    $('time-metric-values').append(el);
  }
  const hasData = data.totals.observation_count > 0;
  $('time-chart').hidden = !hasData || !window.Chart;
  $('chart-empty').hidden = hasData && !!window.Chart;
  $('chart-empty').textContent = hasData ? 'กราฟไม่พร้อมใช้งาน อ่านค่าด้านล่างได้' : 'ไม่พบข้อมูลในตัวกรองนี้';
  if (!hasData || !window.Chart) {if (chart) {chart.destroy();chart=undefined;} return;}
  const colors=palette();
  const chartData = {labels:data.groups[0].periods.map(p=>`${p.start}–${p.end}`),datasets:data.groups.map((group,i)=>({label:labels[group.day_type],data:group.periods.map(p=>TemporalSummary.metricValue(p,metric)),backgroundColor:i?colors.muted:colors.accent,borderRadius:3}))};
  const options = {responsive:true,maintainAspectRatio:false,animation:false,
    plugins:{legend:{labels:{color:colors.text}},tooltip:{backgroundColor:colors.surface,titleColor:colors.text,bodyColor:colors.text,borderColor:colors.line,borderWidth:1,callbacks:{
      label:item=>`${item.dataset.label} · ${label}: ${decimal.format(item.raw)} ${unit}`,
      afterLabel:item=>{const p=data.groups[item.datasetIndex].periods[item.dataIndex];return [`${number.format(p.vehicle_total)} คัน · ${number.format(p.observation_count)} รายการ`, `${number.format(p.survey_count)} กลุ่มสำรวจ · ${number.format(p.date_count)} วัน`, `${decimal.format(p.observed_road_hours)} ชั่วโมงกลุ่มถนนรวม · ${decimal.format(p.duration_minutes/60)} ชม./รายการ`];}
    }}},scales:{x:{ticks:{color:colors.muted},grid:{display:false}},y:{beginAtZero:true,title:{display:true,text:unit,color:colors.muted},ticks:{color:colors.muted,maxTicksLimit:5},grid:{color:colors.line}}}};
  if (chart) {chart.data=chartData;chart.options=options;chart.update('none');}
  else chart=new Chart($('time-chart'),{type:'bar',data:chartData,options});
}
for (const button of document.querySelectorAll('[data-metric]')) button.addEventListener('click',()=>{
  metric=button.dataset.metric; if(currentData) renderChart(currentData);
});

function render(data) {
  currentData = data;
  renderSummary(data);
  const labels = {weekday: 'จันทร์–ศุกร์', weekend: 'เสาร์–อาทิตย์'};
  const fmt = value => value === null ? '—' : number.format(value);
  const cell = (tag, text) => {const el = document.createElement(tag); el.textContent = text; return el;};
  const [weekday, weekend] = data.groups;
  $('sample-note').textContent = `ตัวกรองนี้มีจันทร์–ศุกร์ ${fmt(weekday.survey_count)} กลุ่ม (${fmt(weekday.date_count)} วัน) และเสาร์–อาทิตย์ ${fmt(weekend.survey_count)} กลุ่ม (${fmt(weekend.date_count)} วัน) · ` +
    (!weekday.survey_count || !weekend.survey_count ? 'ข้อมูลไม่ครบทั้งสองประเภทวัน จึงยังเปรียบเทียบระหว่างประเภทวันไม่ได้' : 'ขนาดตัวอย่างและสถานที่อาจต่างกัน ใช้ดูข้อมูลเชิงพรรณนา ยังสรุปผลแทนทุกวันไม่ได้') +
    ((weekend.survey_count > 0 && weekend.survey_count <= 2) ? ' · เสาร์–อาทิตย์มีเพียงไม่เกิน 2 กลุ่ม ตัวอย่างน้อยมาก' : '');
  $('day-cards').replaceChildren();
  $('time-rows').replaceChildren();
  for (const group of data.groups) {
    const card = cell('article', ''); card.className = 'panel';
    card.append(cell('h2', labels[group.day_type]), cell('strong', fmt(group.vehicles_per_road_hour)),
      cell('p', 'คัน / ชั่วโมงสำรวจของกลุ่มถนน'),
      cell('p', `${group.observation_count ? fmt(group.vehicle_total) : '—'} คัน · ${fmt(group.survey_count)} กลุ่มสำรวจ · ${fmt(group.date_count)} วัน`),
      cell('p', `${fmt(group.road_count)} กลุ่มถนน · ${fmt(group.observed_road_hours)} ชั่วโมงกลุ่มถนน`));
    if (!group.observation_count) card.append(cell('p', 'ไม่มีข้อมูลสำรวจในตัวกรองนี้'));
    $('day-cards').append(card);
  }
  // Adjacent rows compare the same original interval without merging unequal windows.
  for (let i = 0; i < weekday.periods.length; i++) {
    for (const group of data.groups) {
      const p = group.periods[i]; const row = cell('tr', '');
      [`${p.start}–${p.end}`, labels[group.day_type], p.observation_count ? fmt(p.vehicle_total) : '—', fmt(p.survey_count), fmt(p.date_count), fmt(p.observation_count), fmt(p.observed_road_hours), fmt(p.vehicles_per_road_hour)].forEach((text, index) => {
        const td = cell('td', text); if (index > 1) td.className = 'numeric'; row.append(td);
      });
      $('time-rows').append(row);
    }
  }
  if (!weekday.periods.length) {const row = cell('tr', ''); const td = cell('td', 'ไม่พบข้อมูลในตัวกรองนี้'); td.colSpan = 8; row.append(td); $('time-rows').append(row);}
  renderChart(data);
  $('status').textContent = `แสดง ${fmt(data.totals.observation_count)} รายการที่ผ่านการตรวจ · อัตราเฉลี่ยถ่วงน้ำหนักด้วยระยะเวลาสำรวจ`;
}

async function load() {
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
    const data = await fetchJSON(`/api/temporal?${params}`, controller.signal);
    if (current !== sequence) return;
    $('results').hidden = false; render(data); $('results').classList.remove('stale');
  } catch (error) {
    if (error.name !== 'AbortError' && current === sequence) {$('status').textContent = error.message; $('status').className = 'error'; $('results').hidden = true;}
  } finally {if (current === sequence) $('results').setAttribute('aria-busy', 'false');}
}

form.addEventListener('submit', (event) => {event.preventDefault(); defaults.locations ? load() : initialize();});
$('reset').addEventListener('click', () => {$('start-date').value = defaults.start_date || ''; $('end-date').value = defaults.end_date || ''; $('location').value = ''; metric = 'hour'; defaults.locations ? load() : initialize();});

async function initialize() {
  try {
    defaults = await fetchJSON('/api/overview/options');
    $('start-date').value = defaults.start_date || '';
    $('end-date').value = defaults.end_date || '';
    $('location').replaceChildren(new Option('ทุกสถานที่', ''));
    defaults.locations.forEach(name => $('location').add(new Option(name, name)));
    const incoming = new URLSearchParams(window.location.search);
    for (const [key, id] of [['start_date', 'start-date'], ['end_date', 'end-date'], ['intersection_name', 'location']]) {
      if (incoming.has(key)) $(id).value = incoming.get(key);
    }
    await load();
  } catch (error) {
    $('status').textContent = error.message; $('status').className = 'error';
    $('results').hidden = true; $('results').setAttribute('aria-busy', 'false');
  }
}
initialize();
