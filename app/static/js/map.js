'use strict';
const $ = id => document.getElementById(id);
const number = value => Number(value).toLocaleString('en-US');
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
};
let map, layer, defaults, controller, sequence = 0;
function syncTheme() {
  const light = document.documentElement.classList.contains('light');
  $('theme-toggle').setAttribute('aria-pressed', String(light));
  $('theme-toggle').setAttribute('aria-label', light ? 'เปลี่ยนเป็นโหมดมืด' : 'เปลี่ยนเป็นโหมดสว่าง');
  document.querySelector('meta[name="theme-color"]').content = light ? '#f4f5ef' : '#111512';
}
$('theme-toggle').addEventListener('click', () => {
  document.documentElement.classList.toggle('light');
  try { localStorage.setItem('bkk-theme', document.documentElement.classList.contains('light') ? 'light' : 'dark'); } catch (_) {}
  syncTheme();
});
syncTheme();
async function fetchJSON(url, signal) {
  const response = await fetch(url, {signal});
  if (!response.ok) throw new Error(response.status === 503 ? 'เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจ MySQL แล้วลองอีกครั้ง' : 'โหลดข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง');
  return response.json();
}
function fitMap() {
  if (layer.getLayers().length) map.fitBounds(layer.getBounds().pad(0.12), {maxZoom: 15, animate: false});
  else map.setView([13.7563, 100.5018], 10);
}
function popup(rows, selected) {
  const root = element('div', '');
  root.append(element('h3', `${number(rows.length)} กลุ่มสำรวจ ณ พิกัดนี้`));
  for (const row of rows) {
    const section = element('section', '', 'popup-survey' + (row.survey_id === selected ? ' selected' : ''));
    section.append(element('h3', row.intersection_name), element('p', `วันสำรวจ ${row.survey_date}`),
      element('strong', `${number(row.vehicle_total)} คัน`), element('p', `${number(row.road_count)} กลุ่มถนน · รวมช่วงที่สำรวจ`),
      element('p', `${row.filename} · ${row.sheet_name}`));
    root.append(section);
  }
  return root;
}
function render(result) {
  layer.clearLayers();
  $('survey-list').replaceChildren();
  $('map-summary').replaceChildren();
  for (const [key, label] of [['mapped', 'กลุ่มบนแผนที่'], ['excluded', 'กลุ่มที่เว้น (ไม่มีพิกัดที่ใช้ได้)'], ['vehicle_total', 'คัน · เฉพาะกลุ่มบนแผนที่']]) {
    const item = element('span', '');
    item.append(element('strong', number(result.coverage[key])), document.createTextNode(label));
    $('map-summary').append(item);
  }
  const groups = new Map();
  for (const row of result.data) {
    const key = `${row.latitude},${row.longitude}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const markers = new Map();
  for (const [key, rows] of groups) {
    const marker = L.marker([rows[0].latitude, rows[0].longitude], {
      icon: L.divIcon({className: 'map-pin', html: rows.length > 1 ? String(rows.length) : '', iconSize: [28, 28], iconAnchor: [14, 14]}),
      title: `${rows[0].intersection_name} · ${rows.length} กลุ่มสำรวจ`,
      alt: `${rows[0].intersection_name} · ${rows.length} กลุ่มสำรวจ`, keyboard: true
    }).bindPopup(() => popup(rows), {maxHeight: 310, maxWidth: 320}).addTo(layer);
    markers.set(key, marker);
  }
  const fragment = document.createDocumentFragment();
  for (const row of result.data) {
    const button = element('button', row.intersection_name, 'survey-item');
    button.type = 'button';
    button.append(element('span', `วันสำรวจ ${row.survey_date}`), element('strong', `${number(row.vehicle_total)} คัน`));
    button.addEventListener('click', () => {
      const key = `${row.latitude},${row.longitude}`;
      const marker = markers.get(key);
      // Put the selected survey first so it is visible even at shared coordinates.
      const rows = groups.get(key);
      marker.setPopupContent(popup([row, ...rows.filter(r => r.survey_id !== row.survey_id)], row.survey_id));
      map.setView(marker.getLatLng(), 16, {animate: false});
      marker.openPopup();
      $('traffic-map').scrollIntoView({block: 'center', behavior: 'instant'});
    });
    fragment.append(button);
  }
  if (!result.data.length) fragment.append(element('p', 'ไม่พบกลุ่มที่มีพิกัดในตัวกรองนี้', 'survey-item'));
  $('survey-list').append(fragment);
  $('map-results').hidden = false;
  map.invalidateSize();
  fitMap();
}
async function load() {
  const current = ++sequence;
  controller?.abort();
  controller = new AbortController();
  $('map-results').hidden = true;
  $('map-results').setAttribute('aria-busy', 'true');
  $('status').className = '';
  const start = $('start-date').value, end = $('end-date').value;
  if (start && end && start > end) {
    $('status').textContent = 'วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด';
    $('status').className = 'error';
    $('map-results').setAttribute('aria-busy', 'false');
    return;
  }
  const params = new URLSearchParams();
  if (start) params.set('start_date', start);
  if (end) params.set('end_date', end);
  if ($('location').value) params.set('intersection_name', $('location').value);
  $('status').textContent = 'กำลังโหลดข้อมูลแผนที่…';
  try {
    const result = await fetchJSON('/api/map?' + params, controller.signal);
    if (current !== sequence) return;
    render(result);
    $('status').textContent = result.coverage.matched ? `พบ ${number(result.coverage.matched)} กลุ่มตามตัวกรอง · แสดงทุกกลุ่มที่มีพิกัด` : 'ไม่พบข้อมูลในตัวกรองนี้';
  } catch (error) {
    if (error.name === 'AbortError' || current !== sequence) return;
    $('status').textContent = error.message;
    $('status').className = 'error';
  } finally {
    if (current === sequence) $('map-results').setAttribute('aria-busy', 'false');
  }
}
$('filters').addEventListener('submit', event => {event.preventDefault(); load();});
$('reset').addEventListener('click', () => {
  $('start-date').value = defaults?.start_date || '';
  $('end-date').value = defaults?.end_date || '';
  $('location').value = '';
  load();
});
async function init() {
  try {
    map = L.map('traffic-map', {scrollWheelZoom: false}).setView([13.7563, 100.5018], 10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).on('tileerror', () => {$('tile-status').textContent = 'โหลดแผนที่พื้นหลังบางส่วนไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วโหลดหน้าใหม่ รายการสำรวจยังใช้งานได้';}).addTo(map);
    layer = L.featureGroup().addTo(map);
    $('fit-map').addEventListener('click', fitMap);
    defaults = await fetchJSON('/api/overview/options');
    $('start-date').value = defaults.start_date || '';
    $('end-date').value = defaults.end_date || '';
    for (const name of defaults.locations) $('location').add(new Option(name, name));
    $('coverage').textContent = `ชุดข้อมูลทั้งหมด ${number(defaults.coverage.surveys)} กลุ่ม · เว้น ${number(defaults.coverage.without_coordinates)} กลุ่มที่ไม่มีพิกัดออกจากแผนที่ โดยยังเก็บข้อมูลไว้ในฐานข้อมูล`;
    await load();
  } catch (_) {
    $('status').textContent = 'เริ่มแผนที่ไม่ได้ กรุณาตรวจการเชื่อมต่อและโหลดหน้าใหม่';
    $('status').className = 'error';
  }
}
init();
