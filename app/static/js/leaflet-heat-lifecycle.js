/* Leaflet.heat 0.2.0 assumes an initialized layer is still attached to a map.
 * Filters and layer controls detach it; updates while detached must defer drawing.
 * Keep this compatibility fix separate from the vendored plugin.
 */
L.SafeHeatLayer = L.HeatLayer.extend({
  redraw() {
    if (!this._map) return this;
    return L.HeatLayer.prototype.redraw.call(this);
  },
  _redraw() {
    if (!this._map) {this._frame = null; return;}
    return L.HeatLayer.prototype._redraw.call(this);
  },
  onRemove(map) {
    L.Util.cancelAnimFrame(this._frame);
    this._frame = null;
    return L.HeatLayer.prototype.onRemove.call(this, map);
  }
});
L.safeHeatLayer = (points, options) => new L.SafeHeatLayer(points, options);
