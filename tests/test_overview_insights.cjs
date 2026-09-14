// Exercise evidence copy and empty/tied results without requiring a browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app/static/js/overview.js', 'utf8');
function node() {return {children: [], append(child) {this.children.push(child);}, replaceChildren() {this.children = [];}};}
const nodes = {'insight-cards': node(), 'explore-map': {href: '/map?start_date=2024-01-02'}, 'explore-time': {href: '/temporal?start_date=2024-01-02'}};
const context = vm.createContext({document: {createElement: node}, $: id => nodes[id], number: new Intl.NumberFormat('en-US')});
vm.runInContext(source.slice(source.indexOf('function renderInsights'), source.indexOf('function setExploreLinks')), context);
const data = {totals: {observation_count: 2, vehicle_total: 100}, insight_coverage: {surveys: 2, mapped: 1, weekday: 2, weekend: 0, weekday_dates: 1, weekend_dates: 0}, periods: [
  {start: '07:00', end: '09:00', vehicle_total: 50, observation_count: 1, duration_minutes: 120},
  {start: '09:00', end: '17:00', vehicle_total: 50, observation_count: 1, duration_minutes: 480}
]};
context.renderInsights(data);
assert.equal(nodes['insight-cards'].children.length, 3);
assert.match(nodes['insight-cards'].children[0].children[1].textContent, /50.0%/);
assert.match(nodes['insight-cards'].children[1].children[2].textContent, /เพียงประเภทวันเดียว/);
assert.match(nodes['insight-cards'].children[2].children[0].textContent, /เท่ากัน/);
assert.equal(nodes['insight-cards'].children[0].children[3].href, nodes['explore-map'].href);
data.periods[1].vehicle_total = 0; data.totals.vehicle_total = 50;
context.renderInsights(data);
assert.match(nodes['insight-cards'].children[2].children[1].textContent, /100.0%/);
data.periods[0].vehicle_total = 0; data.totals.vehicle_total = 0;
context.renderInsights(data);
assert.match(nodes['insight-cards'].children[2].children[0].textContent, /ศูนย์/);
data.totals.observation_count = 0;
context.renderInsights(data);
assert.equal(nodes['insight-cards'].children.length, 1);
assert.match(nodes['insight-cards'].children[0].textContent, /ยังสรุปข้อค้นพบไม่ได้/);
console.log('Overview insights: filtered evidence, ties, zero totals, empty results and destination links passed');
