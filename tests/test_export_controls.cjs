const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function element(extra = {}) {
  return {value: '', disabled: true, textContent: '', events: {},
    classList: {add() {}, remove() {}},
    addEventListener(event, handler) {this.events[event] = handler;}, ...extra};
}
const buttons = ['csv', 'xlsx'].map(format => element({dataset: {exportFormat: format}}));
const bar = {dataset: {exportView: 'vehicles'}, querySelectorAll: () => buttons};
const fields = Object.fromEntries(['start-date', 'end-date', 'location', 'period', 'filters', 'export-status'].map(id => [id, element()]));
fields.period.value = '07:00-09:00';
let requested, resolveFetch, downloaded = false;
const context = {window: {}, URLSearchParams, AbortController, setTimeout: () => {},
  URL: {createObjectURL: () => 'blob:test', revokeObjectURL() {}},
  fetch(url) {requested = url; return new Promise(resolve => {resolveFetch = resolve;});},
  document: {querySelector: () => bar, getElementById: id => fields[id], body: {append() {}},
    createElement: () => ({click() {downloaded = true;}, remove() {}})}};
vm.runInNewContext(fs.readFileSync('app/static/js/export.js', 'utf8'), context);
const controls = context.window.TrafficExport;
const params = new URLSearchParams({period: '07:00-09:00'});

(async () => {
  controls.ready(params, 3);
  assert.equal(buttons[0].disabled, false);
  fields.location.value = 'เปลี่ยนสถานที่';
  fields.filters.events.change();
  controls.ready(params, 3); // Late response for an older selection.
  assert.equal(buttons[0].disabled, true);
  fields.location.value = '';
  controls.ready(params, 0);
  assert.equal(buttons[0].disabled, true);
  controls.ready(params, 3);
  const canceled = buttons[1].events.click();
  assert.match(requested, /^\/api\/export\/vehicles\.xlsx\?period=07%3A00-09%3A00$/);
  controls.invalidate();
  resolveFetch({ok: true, blob: async () => ({})});
  await canceled;
  assert.equal(downloaded, false);
  assert.equal(buttons[1].disabled, true);
  controls.ready(params, 3);
  const failed = buttons[0].events.click();
  resolveFetch({ok: false});
  await failed;
  assert.equal(buttons[0].disabled, false); // Retry remains available.
  assert.match(fields['export-status'].textContent, /ดาวน์โหลดไม่สำเร็จ/);
  console.log('Export controls: applied filters, stale response, empty result, cancellation and retry passed');
})().catch(error => {console.error(error); process.exitCode = 1;});
