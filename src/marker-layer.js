const {clone} = require("underscore-plus");
const {Emitter} = require('event-kit');
const Point = require("./point");
const Range = require("./range");
const Marker = require("./marker");
const {superstring} = require('superstring');
let MarkerIndex = null;
superstring.then((r) => { return MarkerIndex = r.MarkerIndex; });
const {intersectSet} = require("./set-helpers");
const SerializationVersion = 2;

// Public: *Experimental:* A container for a related set of markers.

// This API is experimental and subject to change on any release.
module.exports = class MarkerLayer {
  static deserialize(delegate, state) {
    var store;
    store = new MarkerLayer(delegate, 0);
    store.deserialize(state);
    return store;
  }

  static deserializeSnapshot(snapshot) {
    var layerId, markerId, markerSnapshot, markerSnapshots, result;
    result = {};
    for (layerId in snapshot) {
      markerSnapshots = snapshot[layerId];
      result[layerId] = {};
      for (markerId in markerSnapshots) {
        markerSnapshot = markerSnapshots[markerId];
        result[layerId][markerId] = clone(markerSnapshot);
        result[layerId][markerId].range = Range.fromObject(markerSnapshot.range);
      }
    }
    return result;
  }

  /*
  Section: Lifecycle
  */
  constructor(delegate1, id3, options) {
    var ref, ref1, ref2;
    this.delegate = delegate1;
    this.id = id3;
    this.maintainHistory = (ref = options != null ? options.maintainHistory : void 0) != null ? ref : false;
    this.destroyInvalidatedMarkers = (ref1 = options != null ? options.destroyInvalidatedMarkers : void 0) != null ? ref1 : false;
    this.role = options != null ? options.role : void 0;
    if (this.role === "selections") {
      this.delegate.registerSelectionsMarkerLayer(this);
    }
    this.persistent = (ref2 = options != null ? options.persistent : void 0) != null ? ref2 : false;
    this.emitter = new Emitter();
    this.index = new MarkerIndex();
    this.markersById = {};
    this.markersWithChangeListeners = new Set();
    this.markersWithDestroyListeners = new Set();
    this.displayMarkerLayers = new Set();
    this.destroyed = false;
    this.emitCreateMarkerEvents = false;
  }

  // Public: Create a copy of this layer with markers in the same state and
  // locations.
  copy() {
    var copy, marker, markerId, ref, snapshot;
    copy = this.delegate.addMarkerLayer({maintainHistory: this.maintainHistory, role: this.role});
    ref = this.markersById;
    for (markerId in ref) {
      marker = ref[markerId];
      snapshot = marker.getSnapshot(null);
      copy.createMarker(marker.getRange(), marker.getSnapshot());
    }
    return copy;
  }

  // Public: Destroy this layer.
  destroy() {
    if (this.destroyed) {
      return;
    }
    this.clear();
    this.delegate.markerLayerDestroyed(this);
    this.displayMarkerLayers.forEach(function(displayMarkerLayer) {
      return displayMarkerLayer.destroy();
    });
    this.displayMarkerLayers.clear();
    this.destroyed = true;
    this.emitter.emit('did-destroy');
    return this.emitter.clear();
  }

  // Public: Remove all markers from this layer.
  clear() {
    this.markersWithDestroyListeners.forEach(function(marker) {
      return marker.destroy();
    });
    this.markersWithDestroyListeners.clear();
    this.markersById = {};
    this.index = new MarkerIndex();
    this.displayMarkerLayers.forEach(function(layer) {
      return layer.didClearBufferMarkerLayer();
    });
    return this.delegate.markersUpdated(this);
  }

  // Public: Determine whether this layer has been destroyed.
  isDestroyed() {
    return this.destroyed;
  }

  isAlive() {
    return !this.destroyed;
  }

  /*
  Section: Querying
  */
  // Public: Get an existing marker by its id.

  // Returns a {Marker}.
  getMarker(id) {
    return this.markersById[id];
  }

  // Public: Get all existing markers on the marker layer.

  // Returns an {Array} of {Marker}s.
  getMarkers() {
    var id, marker, ref, results;
    ref = this.markersById;
    results = [];
    for (id in ref) {
      marker = ref[id];
      results.push(marker);
    }
    return results;
  }

  // Public: Get the number of markers in the marker layer.

  // Returns a {Number}.
  getMarkerCount() {
    return Object.keys(this.markersById).length;
  }

  // Public: Find markers in the layer conforming to the given parameters.

  // See the documentation for {TextBuffer::findMarkers}.
  findMarkers(params) {
    var end, i, key, len, markerIds, position, ref, result, start, value;
    markerIds = null;
    ref = Object.keys(params);
    for (i = 0, len = ref.length; i < len; i++) {
      key = ref[i];
      value = params[key];
      switch (key) {
        case 'startPosition':
          markerIds = filterSet(markerIds, this.index.findStartingAt(Point.fromObject(value)));
          break;
        case 'endPosition':
          markerIds = filterSet(markerIds, this.index.findEndingAt(Point.fromObject(value)));
          break;
        case 'startsInRange':
          ({start, end} = Range.fromObject(value));
          markerIds = filterSet(markerIds, this.index.findStartingIn(start, end));
          break;
        case 'endsInRange':
          ({start, end} = Range.fromObject(value));
          markerIds = filterSet(markerIds, this.index.findEndingIn(start, end));
          break;
        case 'containsPoint':
        case 'containsPosition':
          position = Point.fromObject(value);
          markerIds = filterSet(markerIds, this.index.findContaining(position, position));
          break;
        case 'containsRange':
          ({start, end} = Range.fromObject(value));
          markerIds = filterSet(markerIds, this.index.findContaining(start, end));
          break;
        case 'intersectsRange':
          ({start, end} = Range.fromObject(value));
          markerIds = filterSet(markerIds, this.index.findIntersecting(start, end));
          break;
        case 'startRow':
          markerIds = filterSet(markerIds, this.index.findStartingIn(Point(value, 0), Point(value, 2e308)));
          break;
        case 'endRow':
          markerIds = filterSet(markerIds, this.index.findEndingIn(Point(value, 0), Point(value, 2e308)));
          break;
        case 'intersectsRow':
          markerIds = filterSet(markerIds, this.index.findIntersecting(Point(value, 0), Point(value, 2e308)));
          break;
        case 'intersectsRowRange':
          markerIds = filterSet(markerIds, this.index.findIntersecting(Point(value[0], 0), Point(value[1], 2e308)));
          break;
        case 'containedInRange':
          ({start, end} = Range.fromObject(value));
          markerIds = filterSet(markerIds, this.index.findContainedIn(start, end));
          break;
        default:
          continue;
      }
      delete params[key];
    }
    if (markerIds == null) {
      markerIds = new Set(Object.keys(this.markersById));
    }
    result = [];
    markerIds.forEach((markerId) => {
      var marker;
      marker = this.markersById[markerId];
      if (!marker.matchesParams(params)) {
        return;
      }
      return result.push(marker);
    });
    return result.sort(function(a, b) {
      return a.compare(b);
    });
  }

  // Public: Get the role of the marker layer e.g. `atom.selection`.

  // Returns a {String}.
  getRole() {
    return this.role;
  }

  /*
  Section: Marker creation
  */
  // Public: Create a marker with the given range.

  // * `range` A {Range} or range-compatible {Array}
  // * `options` A hash of key-value pairs to associate with the marker. There
  //   are also reserved property names that have marker-specific meaning.
  //   * `reversed` (optional) {Boolean} Creates the marker in a reversed
  //     orientation. (default: false)
  //   * `invalidate` (optional) {String} Determines the rules by which changes
  //     to the buffer *invalidate* the marker. (default: 'overlap') It can be
  //     any of the following strategies, in order of fragility:
  //     * __never__: The marker is never marked as invalid. This is a good choice for
  //       markers representing selections in an editor.
  //     * __surround__: The marker is invalidated by changes that completely surround it.
  //     * __overlap__: The marker is invalidated by changes that surround the
  //       start or end of the marker. This is the default.
  //     * __inside__: The marker is invalidated by changes that extend into the
  //       inside of the marker. Changes that end at the marker's start or
  //       start at the marker's end do not invalidate the marker.
  //     * __touch__: The marker is invalidated by a change that touches the marked
  //       region in any way, including changes that end at the marker's
  //       start or start at the marker's end. This is the most fragile strategy.
  //   * `exclusive` {Boolean} indicating whether insertions at the start or end
  //     of the marked range should be interpreted as happening *outside* the
  //     marker. Defaults to `false`, except when using the `inside`
  //     invalidation strategy or when when the marker has no tail, in which
  //     case it defaults to true. Explicitly assigning this option overrides
  //     behavior in all circumstances.

  // Returns a {Marker}.
  markRange(range, options = {}) {
    return this.createMarker(this.delegate.clipRange(range), Marker.extractParams(options));
  }

  // Public: Create a marker at with its head at the given position with no tail.

  // * `position` {Point} or point-compatible {Array}
  // * `options` (optional) An {Object} with the following keys:
  //   * `invalidate` (optional) {String} Determines the rules by which changes
  //     to the buffer *invalidate* the marker. (default: 'overlap') It can be
  //     any of the following strategies, in order of fragility:
  //     * __never__: The marker is never marked as invalid. This is a good choice for
  //       markers representing selections in an editor.
  //     * __surround__: The marker is invalidated by changes that completely surround it.
  //     * __overlap__: The marker is invalidated by changes that surround the
  //       start or end of the marker. This is the default.
  //     * __inside__: The marker is invalidated by changes that extend into the
  //       inside of the marker. Changes that end at the marker's start or
  //       start at the marker's end do not invalidate the marker.
  //     * __touch__: The marker is invalidated by a change that touches the marked
  //       region in any way, including changes that end at the marker's
  //       start or start at the marker's end. This is the most fragile strategy.
  //   * `exclusive` {Boolean} indicating whether insertions at the start or end
  //     of the marked range should be interpreted as happening *outside* the
  //     marker. Defaults to `false`, except when using the `inside`
  //     invalidation strategy or when when the marker has no tail, in which
  //     case it defaults to true. Explicitly assigning this option overrides
  //     behavior in all circumstances.

  // Returns a {Marker}.
  markPosition(position, options = {}) {
    position = this.delegate.clipPosition(position);
    options = Marker.extractParams(options);
    options.tailed = false;
    return this.createMarker(this.delegate.clipRange(new Range(position, position)), options);
  }

  /*
  Section: Event subscription
  */
  // Public: Subscribe to be notified asynchronously whenever markers are
  // created, updated, or destroyed on this layer. *Prefer this method for
  // optimal performance when interacting with layers that could contain large
  // numbers of markers.*

  // * `callback` A {Function} that will be called with no arguments when changes
  //   occur on this layer.

  // Subscribers are notified once, asynchronously when any number of changes
  // occur in a given tick of the event loop. You should re-query the layer
  // to determine the state of markers in which you're interested in. It may
  // be counter-intuitive, but this is much more efficient than subscribing to
  // events on individual markers, which are expensive to deliver.

  // Returns a {Disposable}.
  onDidUpdate(callback) {
    return this.emitter.on('did-update', callback);
  }

  // Public: Subscribe to be notified synchronously whenever markers are created
  // on this layer. *Avoid this method for optimal performance when interacting
  // with layers that could contain large numbers of markers.*

  // * `callback` A {Function} that will be called with a {Marker} whenever a
  //   new marker is created.

  // You should prefer {::onDidUpdate} when synchronous notifications aren't
  // absolutely necessary.

  // Returns a {Disposable}.
  onDidCreateMarker(callback) {
    this.emitCreateMarkerEvents = true;
    return this.emitter.on('did-create-marker', callback);
  }

  // Public: Subscribe to be notified synchronously when this layer is destroyed.

  // Returns a {Disposable}.
  onDidDestroy(callback) {
    return this.emitter.on('did-destroy', callback);
  }

  /*
  Section: Private - TextBuffer interface
  */
  splice(start, oldExtent, newExtent) {
    var invalidated;
    invalidated = this.index.splice(start, oldExtent, newExtent);
    return invalidated.touch.forEach((id) => {
      var marker, ref;
      marker = this.markersById[id];
      if ((ref = invalidated[marker.getInvalidationStrategy()]) != null ? ref.has(id) : void 0) {
        if (this.destroyInvalidatedMarkers) {
          return marker.destroy();
        } else {
          return marker.valid = false;
        }
      }
    });
  }

  restoreFromSnapshot(snapshots, alwaysCreate) {
    var existingMarkerIds, i, id, j, len, len1, marker, newMarker, range, results, snapshot, snapshotIds;
    if (snapshots == null) {
      return;
    }
    snapshotIds = Object.keys(snapshots);
    existingMarkerIds = Object.keys(this.markersById);
    for (i = 0, len = snapshotIds.length; i < len; i++) {
      id = snapshotIds[i];
      snapshot = snapshots[id];
      if (alwaysCreate) {
        this.createMarker(snapshot.range, snapshot, true);
        continue;
      }
      if (marker = this.markersById[id]) {
        marker.update(marker.getRange(), snapshot, true, true);
      } else {
        ({marker} = snapshot);
        if (marker) {
          this.markersById[marker.id] = marker;
          ({range} = snapshot);
          this.index.insert(marker.id, range.start, range.end);
          marker.update(marker.getRange(), snapshot, true, true);
          if (this.emitCreateMarkerEvents) {
            this.emitter.emit('did-create-marker', marker);
          }
        } else {
          newMarker = this.createMarker(snapshot.range, snapshot, true);
        }
      }
    }
    results = [];
    for (j = 0, len1 = existingMarkerIds.length; j < len1; j++) {
      id = existingMarkerIds[j];
      if ((marker = this.markersById[id]) && (snapshots[id] == null)) {
        results.push(marker.destroy(true));
      } else {
        results.push(void 0);
      }
    }
    return results;
  }

  createSnapshot() {
    var i, id, len, marker, ranges, ref, result;
    result = {};
    ranges = this.index.dump();
    ref = Object.keys(this.markersById);
    for (i = 0, len = ref.length; i < len; i++) {
      id = ref[i];
      marker = this.markersById[id];
      result[id] = marker.getSnapshot(Range.fromObject(ranges[id]));
    }
    return result;
  }

  emitChangeEvents(snapshot) {
    return this.markersWithChangeListeners.forEach(function(marker) {
      var ref;
      if (!marker.isDestroyed()) { // event handlers could destroy markers
        return marker.emitChangeEvent(snapshot != null ? (ref = snapshot[marker.id]) != null ? ref.range : void 0 : void 0, true, false);
      }
    });
  }

  serialize() {
    var i, id, len, marker, markersById, ranges, ref, snapshot;
    ranges = this.index.dump();
    markersById = {};
    ref = Object.keys(this.markersById);
    for (i = 0, len = ref.length; i < len; i++) {
      id = ref[i];
      marker = this.markersById[id];
      snapshot = marker.getSnapshot(Range.fromObject(ranges[id]), false);
      markersById[id] = snapshot;
    }
    return {
      id: this.id,
      maintainHistory: this.maintainHistory,
      role: this.role,
      persistent: this.persistent,
      markersById,
      version: SerializationVersion
    };
  }

  deserialize(state) {
    var id, markerState, range, ref;
    if (state.version !== SerializationVersion) {
      return;
    }
    this.id = state.id;
    this.maintainHistory = state.maintainHistory;
    this.role = state.role;
    if (this.role === "selections") {
      this.delegate.registerSelectionsMarkerLayer(this);
    }
    this.persistent = state.persistent;
    ref = state.markersById;
    for (id in ref) {
      markerState = ref[id];
      range = Range.fromObject(markerState.range);
      delete markerState.range;
      this.addMarker(id, range, markerState);
    }
  }

  /*
  Section: Private - Marker interface
  */
  markerUpdated() {
    return this.delegate.markersUpdated(this);
  }

  destroyMarker(marker, suppressMarkerLayerUpdateEvents = false) {
    if (this.markersById.hasOwnProperty(marker.id)) {
      delete this.markersById[marker.id];
      this.index.remove(marker.id);
      this.markersWithChangeListeners.delete(marker);
      this.markersWithDestroyListeners.delete(marker);
      this.displayMarkerLayers.forEach(function(displayMarkerLayer) {
        return displayMarkerLayer.destroyMarker(marker.id);
      });
      if (!suppressMarkerLayerUpdateEvents) {
        return this.delegate.markersUpdated(this);
      }
    }
  }

  hasMarker(id) {
    return !this.destroyed && this.index.has(id);
  }

  getMarkerRange(id) {
    return Range.fromObject(this.index.getRange(id));
  }

  getMarkerStartPosition(id) {
    return Point.fromObject(this.index.getStart(id));
  }

  getMarkerEndPosition(id) {
    return Point.fromObject(this.index.getEnd(id));
  }

  compareMarkers(id1, id2) {
    return this.index.compare(id1, id2);
  }

  setMarkerRange(id, range) {
    var end, start;
    ({start, end} = Range.fromObject(range));
    start = this.delegate.clipPosition(start);
    end = this.delegate.clipPosition(end);
    this.index.remove(id);
    return this.index.insert(id, start, end);
  }

  setMarkerIsExclusive(id, exclusive) {
    return this.index.setExclusive(id, exclusive);
  }

  createMarker(range, params, suppressMarkerLayerUpdateEvents = false) {
    var id, marker, ref;
    id = this.delegate.getNextMarkerId();
    marker = this.addMarker(id, range, params);
    this.delegate.markerCreated(this, marker);
    if (!suppressMarkerLayerUpdateEvents) {
      this.delegate.markersUpdated(this);
    }
    marker.trackDestruction = (ref = this.trackDestructionInOnDidCreateMarkerCallbacks) != null ? ref : false;
    if (this.emitCreateMarkerEvents) {
      this.emitter.emit('did-create-marker', marker);
    }
    marker.trackDestruction = false;
    return marker;
  }

  /*
  Section: Internal
  */
  addMarker(id, range, params) {
    range = Range.fromObject(range);
    Point.assertValid(range.start);
    Point.assertValid(range.end);
    this.index.insert(id, range.start, range.end);
    return this.markersById[id] = new Marker(id, this, range, params);
  }

  emitUpdateEvent() {
    return this.emitter.emit('did-update');
  }

};

const filterSet = function(set1, set2) {
  if (set1) {
    intersectSet(set1, set2);
    return set1;
  } else {
    return set2;
  }
};
