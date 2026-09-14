'use strict';
const $ = id => document.getElementById(id);
const number = value => Number(value).toLocaleString('en-US', {maximumFractionDigits: 1});
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
};
let map, layer, trafficPoints, heat, heatData = prepareHeatData([]), defaults, controller, sequence = 0;
const mobileMap = window.matchMedia('(max-width:650px)');
function trafficIcon(total) {
  const level = trafficLevel(total, heatData.max);
  const rank = TRAFFIC_LEVELS.indexOf(level);
  const size = [10, 13, 16, 20][rank] - (mobileMap.matches ? 2 : 0);
  return L.divIcon({className: `traffic-point level-${rank}`, html: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2]});
}
function updateMapLayers() {
  if (!heat || $('map-results').hidden) return;
  if (!$('show-points').checked) {layer.clearLayers(); map.closePopup();}
  for (const [id, target] of [['show-heat', heat], ['show-points', trafficPoints]]) {
    if ($(id).checked && !map.hasLayer(target)) target.addTo(map);
    if (!$(id).checked && map.hasLayer(target)) map.removeLayer(target);
  }
}
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
  if (heatData.locations.length) map.fitBounds(L.latLngBounds(heatData.locations.map(group => [group.latitude, group.longitude])).pad(0.12), {maxZoom: 15, animate: false});
  else map.setView([13.7563, 100.5018], 10);
}
function selectGroup(group, selected, zoom = false) {
  layer.clearLayers();
  const rows = selected ? [selected, ...group.rows.filter(row => row.survey_id !== selected.survey_id)] : group.rows;
  const marker = L.circleMarker([group.latitude, group.longitude], {pane: 'trafficSelection', radius: 7, color: '#334b60', weight: 2,
    fillColor: '#fff', fillOpacity: 1}).addTo(layer);
  const content = popup(rows, selected?.survey_id);
  content.prepend(element('p', `รวม ณ พิกัดนี้ ${number(group.total)} คัน`));
  const level = trafficLevel(group.total, heatData.max);
  const badge = element('div', '', 'popup-level');
  const dot = element('i', '', 'level-dot'); dot.style.backgroundColor = level.color;
  badge.append(dot, document.createTextNode(`${level.label} · ปริมาณสะสมสัมพัทธ์`));
  content.prepend(badge);
  marker.bindPopup(content, {maxHeight: 310, maxWidth: 320});
  if (zoom) map.setView(marker.getLatLng(), 15, {animate: false});
  marker.openPopup();
}
function popup(rows, selected) {
  const root = element('div', '');
  root.append(element('h3', rows[0].intersection_name), element('p', `${number(rows.length)} กลุ่มสำรวจ ณ พิกัดนี้`));
  const facts = element('dl', '', 'popup-metrics');
  const stats = summarizeMapSurveys(rows);
  for (const [label, value] of [['เฉลี่ยต่อกลุ่มสำรวจ', `${number(stats.average)} คัน`],
    ['วันที่สำรวจไม่ซ้ำ', `${number(stats.dates)} วัน`], ['วันสำรวจล่าสุด ณ พิกัดนี้', stats.latest || '—']]) {
    facts.append(element('dt', label), element('dd', value));
  }
  root.append(facts);
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
  trafficPoints.clearLayers();
  map.closePopup();
  heatData = prepareHeatData(result.data);
  heat.setLatLngs(heatData.points);
  $('heat-scale-note').textContent = heatData.max > 0
    ? `สเกลสัมพัทธ์ในตัวกรองนี้ · ยอดสูงสุดต่อพิกัด ${number(heatData.max)} คัน · จุดใกล้กันมีสีผสมทับกัน`
    : 'ไม่มีปริมาณรถที่เป็นบวกให้แสดงสีในตัวกรองนี้';
  $('survey-list').replaceChildren();
  $('map-summary').replaceChildren();
  const stats = summarizeMapSurveys(result.data);
  for (const [label, value, note] of [
    ['ยอดรถสะสม', stats.surveys ? number(stats.total) : '—', 'คัน · เฉพาะกลุ่มที่มีพิกัดในตัวกรอง'],
    ['เฉลี่ยต่อกลุ่มสำรวจ', stats.average === null ? '—' : number(stats.average), `คัน / กลุ่ม · ${number(stats.surveys)} กลุ่มสำรวจ`],
    ['จุดสำรวจบนแผนที่', number(heatData.locations.length), 'พิกัดไม่ซ้ำ · รวมจุดใน Cluster'],
    ['วันสำรวจล่าสุด', stats.latest || '—', `${number(stats.dates)} วันที่สำรวจไม่ซ้ำในตัวกรอง`]
  ]) {
    const item = element('article', '', 'summary-card');
    item.append(element('span', label), element('strong', value), element('small', note));
    $('map-summary').append(item);
  }
  $('survey-summary').textContent = `เฉลี่ย = ยอดรถรวม ÷ จำนวนกลุ่มสำรวจ ไม่ได้ปรับจำนวนถนนหรือระยะเวลาสำรวจ · เว้น ${number(result.coverage.excluded)} กลุ่มที่ไม่มีพิกัด`;
  $('traffic-levels').replaceChildren();
  TRAFFIC_LEVELS.forEach((level, i) => {
    const row = element('div', '', 'legend-row'), dot = element('i', '', 'level-dot');
    dot.style.backgroundColor = level.color;
    row.append(dot, element('span', level.label), element('small', ['≤25%', '>25–50%', '>50–75%', '>75%'][i]));
    $('traffic-levels').append(row);
  });
  for (const group of heatData.locations) {
    const level = trafficLevel(group.total, heatData.max);
    L.marker([group.latitude, group.longitude], {pane: 'trafficPoints', icon: trafficIcon(group.total),
      opacity: 0.8, title: `${group.rows[0].intersection_name} · ${level.label} · ${number(group.total)} คัน`,
      alt: `${group.rows[0].intersection_name} · ${level.label}`, volume: group.total, keyboard: true, bubblingMouseEvents: false})
      .on('click', () => selectGroup(group)).addTo(trafficPoints);
  }
  const fragment = document.createDocumentFragment();
  for (const row of result.data) {
    const button = element('button', row.intersection_name, 'survey-item');
    button.type = 'button';
    button.append(element('span', `วันสำรวจ ${row.survey_date}`), element('strong', `${number(row.vehicle_total)} คัน`));
    button.addEventListener('click', () => {
      const key = `${row.latitude},${row.longitude}`;
      selectGroup(heatData.groups.get(key), row, true);
      $('traffic-map').scrollIntoView({block: 'center', behavior: 'instant'});
    });
    fragment.append(button);
  }
  if (!result.data.length) fragment.append(element('p', 'ไม่พบกลุ่มที่มีพิกัดในตัวกรองนี้', 'survey-item'));
  $('survey-list').append(fragment);
  $('map-results').hidden = false;
  map.invalidateSize();
  fitMap();
  // Canvas needs the visible map's dimensions before its first draw.
  updateMapLayers();
}
async function load() {
  const current = ++sequence;
  controller?.abort();
  controller = new AbortController();
  if (heat && map.hasLayer(heat)) map.removeLayer(heat);
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
    map = L.map('traffic-map', {scrollWheelZoom: false, maxZoom: 19}).setView([13.7563, 100.5018], 10);
    map.createPane('trafficPoints'); map.getPane('trafficPoints').style.zIndex = 450;
    map.createPane('trafficSelection'); map.getPane('trafficSelection').style.zIndex = 460;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, className: 'minimal-basemap', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).on('tileerror', () => {$('tile-status').textContent = 'โหลดแผนที่พื้นหลังบางส่วนไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วโหลดหน้าใหม่ รายการสำรวจยังใช้งานได้';}).addTo(map);
    layer = L.featureGroup().addTo(map);
    trafficPoints = L.markerClusterGroup({maxClusterRadius: 40, disableClusteringAtZoom: 16,
      showCoverageOnHover: false, animate: false, clusterPane: 'trafficPoints',
      iconCreateFunction: cluster => {
        const maximum = cluster.getAllChildMarkers().reduce((max, marker) => Math.max(max, marker.options.volume), 0);
        const rank = TRAFFIC_LEVELS.indexOf(trafficLevel(maximum, heatData.max));
        const content = element('span', String(cluster.getChildCount()));
        content.setAttribute('aria-label', `${cluster.getChildCount()} พิกัด · คลิกเพื่อขยาย`);
        return L.divIcon({html: content, className: `traffic-cluster level-${rank}`, iconSize: [34,34]});
      }});
    heat = L.safeHeatLayer([], {radius: mobileMap.matches ? 15 : 18, blur: 12, maxZoom: 12, max: 1, minOpacity: 0.02,
      gradient: {0.25: '#22a06b', 0.5: '#e5b522', 0.75: '#ed8936', 1: '#dc4c4c'}});
    const resizePoints = () => {
      trafficPoints.eachLayer(point => point.setIcon(trafficIcon(point.options.volume)));
      heat.setOptions({radius: mobileMap.matches ? 15 : 18});
    };
    mobileMap.addEventListener('change', resizePoints);
    for (const id of ['show-heat', 'show-points']) $(id).addEventListener('change', updateMapLayers);
    map.on('click', event => {
      // Cluster interaction handles navigation; do not open a hidden child at low zoom.
      if (map.hasLayer(trafficPoints)) {layer.clearLayers(); map.closePopup(); return;}
      let nearest, distance = 28;
      for (const group of heatData.locations) {
        const candidate = map.latLngToContainerPoint([group.latitude, group.longitude]).distanceTo(event.containerPoint);
        if (candidate < distance) {distance = candidate; nearest = group;}
      }
      if (nearest) selectGroup(nearest);
      else {layer.clearLayers(); map.closePopup();}
    });
    $('fit-map').addEventListener('click', fitMap);
    defaults = await fetchJSON('/api/overview/options');
    $('start-date').value = defaults.start_date || '';
    $('end-date').value = defaults.end_date || '';
    for (const name of defaults.locations) $('location').add(new Option(name, name));
    const incoming = new URLSearchParams(window.location.search);
    for (const [key, id] of [['start_date', 'start-date'], ['end_date', 'end-date'], ['intersection_name', 'location']]) {
      if (incoming.has(key)) $(id).value = incoming.get(key);
    }
    $('coverage').textContent = `ชุดข้อมูลทั้งหมด ${number(defaults.coverage.surveys)} กลุ่ม · เว้น ${number(defaults.coverage.without_coordinates)} กลุ่มที่ไม่มีพิกัดออกจากแผนที่ โดยยังเก็บข้อมูลไว้ในฐานข้อมูล`;
    await load();
  } catch (_) {
    $('status').textContent = 'เริ่มแผนที่ไม่ได้ กรุณาตรวจการเชื่อมต่อและโหลดหน้าใหม่';
    $('status').className = 'error';
  }
}
init();
