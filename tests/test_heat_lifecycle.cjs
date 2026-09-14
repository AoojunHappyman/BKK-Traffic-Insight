const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
// Use the actual vendored plugin with a minimal Leaflet lifecycle/RAF harness.
function Base() {}
Base.extend = function(methods) {
  const Parent = this;
  function Child(...args) {if (this.initialize) this.initialize(...args);}
  Child.prototype = Object.create(Parent.prototype);
  Object.assign(Child.prototype, methods); Child.extend = Parent.extend;
  return Child;
};
let frameId = 0;
const scheduled = new Map();
const L = {Layer: Base, setOptions(target, options) {target.options = {...target.options, ...options};},
  Util: {requestAnimFrame(fn, target) {scheduled.set(++frameId, () => fn.call(target)); return frameId;},
    cancelAnimFrame(id) {scheduled.delete(id);}}};
const context = vm.createContext({L, window: {}});
vm.runInContext(fs.readFileSync('app/static/vendor/leaflet-heat/leaflet-heat.js','utf8'), context);
const original = L.heatLayer([], {});
original._heat = {}; original._map = null;
assert.throws(() => original.setLatLngs([[13,100,1]]), /_animating/);
vm.runInContext(fs.readFileSync('app/static/js/leaflet-heat-lifecycle.js','utf8'), context);
const safe = L.safeHeatLayer([], {});
safe._heat = {radius() {}, gradient() {}, max() {}};
safe._map = null;
assert.doesNotThrow(() => safe.setLatLngs([[13,100,1]]));
assert.doesNotThrow(() => safe.setOptions({radius:15}));
assert.equal(scheduled.size, 0);
let removed = 0;
const map = {_animating:false, getPanes:()=>({overlayPane:{removeChild(){removed++;}}}), off(){}, options:{}};
safe._map = map;
safe.redraw(); assert.equal(scheduled.size, 1);
safe.onRemove(map); safe._map = null;
assert.equal(scheduled.size, 0); assert.equal(removed, 1);
assert.doesNotThrow(() => safe._redraw());
assert.doesNotThrow(() => safe.setLatLngs([]));
safe._map = map; safe.redraw(); assert.equal(scheduled.size, 1);
console.log('Reproduced original null-map crash; detached data/options updates, RAF cancellation and reattachment passed');
