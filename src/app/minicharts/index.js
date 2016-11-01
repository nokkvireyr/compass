var AmpersandView = require('ampersand-view');
var _ = require('lodash');
var raf = require('raf');
var app = require('ampersand-app');
var VizView = require('./viz');
var UniqueMinichartView = require('./unique');
var DocumentRootMinichartView = require('./document-root');
var ArrayRootMinichartView = require('./array-root');
var vizFns = require('./d3fns');
var QueryBuilderMixin = require('./querybuilder');
var Collection = require('ampersand-collection');
var metrics = require('mongodb-js-metrics')();
var navigator = window.navigator;

var minichartTemplate = require('./minichart.jade');

// var debug = require('debug')('mongodb-compass:minicharts:index');

var ArrayCollection = Collection.extend({
  model: Array
});

/**
 * a wrapper around VizView to set common default values
 */
module.exports = AmpersandView.extend(QueryBuilderMixin, {
  modelType: 'MinichartView',
  template: minichartTemplate,
  session: {
    subview: 'state',
    viewOptions: 'object',
    selectedValues: {
      type: 'array',
      default: function() {
        return [];
      }
    }
  },
  initialize: function(opts) {
    // setting some defaults for minicharts
    this.viewOptions = _.defaults(opts, {
      width: 440,
      height: 100,
      renderMode: 'svg',
      className: 'minichart',
      debounceRender: false,
      vizFn: vizFns[opts.model.getId().toLowerCase()] || null
    });
    this.listenTo(app.volatileQueryOptions, 'change:query', this.handleVolatileQueryChange);
  },
  _mangleGeoCoordinates: function(values) {
    // now check value bounds
    var lons = values.filter(function(val, idx) {
      return idx % 2 === 0;
    });
    var lats = values.filter(function(val, idx) {
      return idx % 2 === 1;
    });
    if (_.min(lons) >= -180 && _.max(lons) <= 180 && _.min(lats) >= -90 && _.max(lats) <= 90) {
      return new ArrayCollection(_.zip(lons, lats));
    }
    return false;
  },
  /* eslint complexity: 0 */
  _geoCoordinateTransform: function() {
    var coords;
    if (this.model.name === 'Coordinates') {
      // been here before, don't need to do it again
      return true;
    }
    var fields = this.model.fields;
    if (this.model.name === 'Document') {
      if (fields.length !== 2
        || !fields.get('type')
        || !fields.get('coordinates')
        || fields.get('type').type !== 'String'
        || fields.get('type').types.get('String').unique !== 1
        || fields.get('type').types.get('String').values.at(0).value !== 'Point'
        || fields.get('coordinates').types.get('Array').count
        !== fields.get('coordinates').count
        || fields.get('coordinates').types.get('Array').average_length !== 2
        || fields.get('coordinates').types.get('Array').types.get('Number') === undefined
      ) {
        return false;
      }
      coords = this._mangleGeoCoordinates(
        this.model.fields.get('coordinates').types.get('Array')
          .types.get('Number').values.serialize());
      if (!coords) {
        return false;
      }
      // we have a GeoJSON document: {type: "Point", coordinates: [lng, lat]}
      this.model.values = coords;
      this.model.fields.reset();
      this.model.name = 'Coordinates';
      return true;
    } else if (this.model.name === 'Array') {
      var lengths = this.model.lengths;
      if (_.min(lengths) !== 2 || _.max(lengths) !== 2) {
        return false;
      }
      // make sure the array only contains numbers, otherwise not coords
      if (this.model.types.length !== 1
        || this.model.types.at(0).name !== 'Number') {
        return false;
      }
      coords = this._mangleGeoCoordinates(
        this.model.types.get('Number').values.serialize());
      if (!coords) {
        return false;
      }
      // we have a legacy coordinate pair: [lng, lat]
      this.model.values = coords;
      this.model.types.reset();
      this.model.name = 'Coordinates';
      return true;
    }
    return false;
  },
  render: function() {
    this.renderWithTemplate(this);
    this._geoCoordinateTransform();

    if (this.model.name === 'Coordinates') {
      metrics.track('Geo Data', 'detected');
      // check if we can load google maps or if we need to fall back to
      // a simpler coordinate chart
      if (app.isFeatureEnabled('enableMaps')
        && navigator.onLine) {
        this.viewOptions.renderMode = 'html';
        this.viewOptions.height = 300;
        this.viewOptions.vizFn = vizFns.geo;
        this.subview = new VizView(this.viewOptions);
      } else {
        // we have coordinates but cannot load google maps (offline, invalid
        // key, etc.). Fall back to simplified coordinate chart.
        this.viewOptions.renderMode = 'svg';
        this.viewOptions.height = 300;
        this.viewOptions.vizFn = vizFns.coordinates;
        this.subview = new VizView(this.viewOptions);
      }
    } else if (['String', 'Number'].indexOf(this.model.name) !== -1
      && !this.model.has_duplicates) {
      // unique values get a div-based UniqueMinichart
      this.viewOptions.renderMode = 'html';
      this.viewOptions.vizFn = null;
      this.viewOptions.className = 'minichart unique';
      this.subview = new UniqueMinichartView(this.viewOptions);
    } else if (this.model.name === 'Document') {
      this.viewOptions.height = 55;
      this.subview = new DocumentRootMinichartView(this.viewOptions);
    } else if (this.model.name === 'Array') {
      this.viewOptions.height = 55;
      this.subview = new ArrayRootMinichartView(this.viewOptions);
    } else {
      // otherwise, create a svg-based VizView for d3
      this.subview = new VizView(this.viewOptions);
    }

    if (app.isFeatureEnabled('queryBuilder')) {
      this.listenTo(this.subview, 'querybuilder', this.handleQueryBuilderEvent);
    }
    raf(function() {
      this.renderSubview(this.subview, this.queryByHook('minichart'));
    }.bind(this));
  }
});