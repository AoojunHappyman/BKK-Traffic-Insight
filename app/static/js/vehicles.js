'use strict';
const $ = id => document.getElementById(id);
const fmt = value => value === null ? '—' : Number(value).toLocaleString('en-US', {maximumFractionDigits: 2});
const el = (tag, text) => {const node = document.createElement(tag); node.textContent = text; return node;};
let defaults, data, controller, sequence = 0;
let charts = [];
const units = {count: 'คัน', share: '%', rate: 'คัน / ชั่วโมงกลุ่มถนน'};
function colors() {
  return document.documentElement.classList.contains('light')
    ? ['#496c15', '#246b96', '#8a4c96', '#a76012', '#af394b', '#33796c']
    : ['#d7f78b', '#80c8ef', '#c5a1e0', '#efbe7b', '#ef99a5', '#7ed7bf'];
}
function syncTheme() {
  const light = document.documentElement.classList.contains('light');
  $('theme-toggle').setAttribute('aria-pressed', String(light));
  $('theme-toggle').setAttribute('aria-label', light ? 'เปลี่ยนเป็นโหมดมืด' : 'เปลี่ยนเป็นโหมดสว่าง');
  document.querySelector('meta[name="theme-color"]').content = light ? '#f4f5ef' : '#111512';
  if (data) render();
}
$('theme-toggle').addEventListener('click', () => {
  document.documentElement.classList.toggle('light');
  try {localStorage.setItem('bkk-theme', document.documentElement.classList.contains('light') ? 'light' : 'dark');} catch (_) {}
  syncTheme();
});
syncTheme();
if (window.Chart) {
  Chart.defaults.font.family = 'Arial, "Noto Sans Thai", sans-serif';
  Chart.defaults.font.size = 13;
}
document.fonts?.ready.then(() => charts.forEach(chart => chart.update('none')));
function comparisonTable(id, groups, name, metric) {
  const table = $(id), head = el('thead', ''), header = el('tr', ''), body = el('tbody', '');
  [name, ...data.totals.categories.map(c => `${c.label} (${units[metric]})`), 'กลุ่มสำรวจ', 'วันที่ไม่ซ้ำ', 'รายการช่วงเวลา', 'ชั่วโมงกลุ่มถนน'].forEach(text => {
    const th = el('th', text); th.scope = 'col'; header.append(th);
  });
  head.append(header);
  for (const group of groups) {
    const row = el('tr', '');
    const title = group.intersection_name ?? `${group.start}–${group.end}`;
    [title, ...group.categories.map(c => fmt(c[metric])), fmt(group.survey_count), fmt(group.date_count), fmt(group.observation_count), fmt(group.observed_road_hours)].forEach((text, index) => {
      const td = el('td', text); if (index) td.className = 'numeric'; row.append(td);
    });
    body.append(row);
  }
  if (!groups.length) {const row = el('tr', ''); const td = el('td', 'ไม่พบข้อมูลในตัวกรองนี้'); td.colSpan = 11; row.append(td); body.append(row);}
  table.replaceChildren(head, body);
}
function render() {
  const metric = $('metric').value, totals = data.totals, palette = colors();
  const hasData = totals.observation_count > 0;
  $('coverage').textContent = `${hasData ? fmt(totals.vehicle_total) : '—'} คัน · ${fmt(totals.survey_count)} กลุ่มสำรวจ · ${fmt(totals.date_count)} วัน · ${fmt(totals.observation_count)} รายการ · ${fmt(totals.observed_road_hours)} ชั่วโมงกลุ่มถนน`;
  $('metric-note').textContent = {
    count: 'จำนวนรถรวมตามช่วงที่สำรวจ ยอดสูงอาจเกิดจากสำรวจมากครั้งหรือใช้เวลานานกว่า',
    share: 'เทียบสัดส่วนรถทั้ง 6 ประเภท ภายในแต่ละช่วงหรือสถานที่ ไม่ใช่สัดส่วนของทั้งเมือง',
    rate: 'ยอดรถ ÷ ชั่วโมงสำรวจรวมของกลุ่มถนน ปรับระยะเวลา แต่ยังไม่ได้ควบคุมความต่างของสถานที่'
  }[metric];
  $('category-rows').replaceChildren();
  totals.categories.forEach((category, index) => {
    const row = el('tr', ''), name = el('td', ''), swatch = el('span', '');
    swatch.className = 'swatch'; swatch.style.backgroundColor = palette[index];
    name.append(swatch, document.createTextNode(category.label)); row.append(name);
    [hasData ? fmt(category.count) : '—', fmt(category.share), fmt(category.rate)].forEach(text => {const td = el('td', text); td.className = 'numeric'; row.append(td);});
    $('category-rows').append(row);
  });
  comparisonTable('period-table', data.periods, 'ช่วงสำรวจ', metric);
  comparisonTable('location-table', data.locations, 'สถานที่', metric);
  $('location-note').textContent = `แสดงครบ ${fmt(data.locations.length)} ชื่อตามตัวกรอง เรียงตามยอดรถรวมทั้ง 6 ประเภทจากมากไปน้อย · หน่วยค่าประเภทรถ: ${units[metric]}`;
  charts.forEach(chart => chart.destroy()); charts = [];
  const drawable = hasData && window.Chart;
  for (const id of ['mix-chart', 'period-chart']) $(id).hidden = !drawable;
  $('chart-message').textContent = !hasData ? 'ไม่พบข้อมูล ลองขยายช่วงวันที่หรือเลือกทุกสถานที่' : !window.Chart ? 'กราฟไม่พร้อมใช้งาน อ่านข้อมูลทั้งหมดจากตารางได้' : metric === 'share' && !totals.vehicle_total ? 'ยอดรถรวมเป็นศูนย์ จึงไม่คำนวณสัดส่วน' : '';
  if (!drawable) return;
  const style = getComputedStyle(document.documentElement);
  const text = style.getPropertyValue('--text').trim(), line = style.getPropertyValue('--line').trim();
  function options(stacked) {
    return {responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {legend: {display: stacked, labels: {color: text, boxWidth: 10}}, tooltip: {callbacks: {label: item => `${item.dataset.label || item.label}: ${fmt(item.raw)} ${units[metric]}`}}},
      scales: {x: {stacked, ticks: {color: text}, grid: {display: false}}, y: {stacked, beginAtZero: true, max: metric === 'share' ? 100 : undefined, title: {display: true, text: units[metric], color: text}, ticks: {color: text}, grid: {color: line}}}};
  }
  charts.push(new Chart($('mix-chart'), {type: 'bar', data: {
    labels: totals.categories.map(c => c.label), datasets: [{data: totals.categories.map(c => c[metric]), backgroundColor: palette, borderRadius: 3}]
  }, options: options(false)}));
  charts.push(new Chart($('period-chart'), {type: 'bar', data: {
    labels: data.periods.map(p => `${p.start}–${p.end}`), datasets: totals.categories.map((category, i) => ({label: category.label, data: data.periods.map(p => p.categories[i][metric]), backgroundColor: palette[i]}))
  }, options: options(true)}));
}
async function fetchJSON(url, signal) {
  const response = await fetch(url, {signal, headers: {Accept: 'application/json'}});
  if (!response.ok) throw new Error(response.status === 400 ? 'กรุณาตรวจสอบวันที่และช่วงสำรวจ' : 'โหลดข้อมูลไม่ได้ กรุณาตรวจ MySQL แล้วลองอีกครั้ง');
  return response.json();
}
async function load() {
  controller?.abort(); const current = ++sequence; controller = new AbortController();
  $('results').hidden = true; $('results').setAttribute('aria-busy', 'true'); data = undefined;
  $('status').className = ''; $('status').textContent = 'กำลังโหลดข้อมูลประเภทรถ…';
  try {
    const start = $('start-date').value, end = $('end-date').value;
    if (start && end && start > end) throw new Error('วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด');
    const params = new URLSearchParams();
    for (const [key, value] of [['start_date', start], ['end_date', end], ['intersection_name', $('location').value], ['period', $('period').value]]) if (value) params.set(key, value);
    const result = await fetchJSON('/api/vehicles?' + params, controller.signal);
    if (current !== sequence) return;
    data = result; $('results').hidden = false; render();
    $('status').textContent = result.totals.observation_count ? 'แสดงข้อมูลที่ผ่านการตรวจครบตามตัวกรอง' : 'ไม่พบข้อมูลในตัวกรองนี้';
  } catch (error) {
    if (error.name !== 'AbortError' && current === sequence) {$('status').textContent = error.message; $('status').className = 'error'; $('results').hidden = true;}
  } finally {if (current === sequence) $('results').setAttribute('aria-busy', 'false');}
}
async function initialize() {
  $('filters').querySelectorAll('button').forEach(button => button.disabled = true);
  try {
    const [options, periods] = await Promise.all([fetchJSON('/api/overview/options'), fetchJSON('/api/vehicles/options')]);
    defaults = options;
    $('start-date').value = options.start_date || ''; $('end-date').value = options.end_date || '';
    $('location').replaceChildren(new Option('ทุกสถานที่', ''));
    options.locations.forEach(name => $('location').add(new Option(name, name)));
    $('period').replaceChildren(new Option('ทุกช่วงสำรวจ', ''));
    periods.periods.forEach(p => $('period').add(new Option(`${p.start}–${p.end}`, `${p.start}-${p.end}`)));
    await load();
  } catch (error) {defaults = undefined; $('status').textContent = error.message; $('status').className = 'error';}
  finally {$('filters').querySelectorAll('button').forEach(button => button.disabled = false);}
}
$('filters').addEventListener('submit', event => {event.preventDefault(); defaults ? load() : initialize();});
$('reset').addEventListener('click', () => {
  $('start-date').value = defaults?.start_date || ''; $('end-date').value = defaults?.end_date || '';
  $('location').value = ''; $('period').value = ''; defaults ? load() : initialize();
});
$('metric').addEventListener('change', () => {if (data) render();});
initialize();
