'use strict';

/*
 * Time-series preparation from CTUF (CaseTimeUnitFeature) records.
 *
 * CTUF contract (from WBS 5.1):
 *   feature_id, type='CTUF', run_id, unit_id, time_bucket (ISO Monday),
 *   crime_head_id, case_count, avg_gravity, lat_bin, lon_bin, computed_at
 *
 * This module prepares weekly time series for each (unit_id, crime_head_id)
 * pair: chronological sorting, duplicate-week aggregation, missing-week
 * zero-filling, and temporal train/validation splitting.
 */

function getMonday(d) {
  if (d == null) return null;
  var date = new Date(d);
  if (isNaN(date.getTime())) return null;
  var day = date.getDay();
  var diff = day === 0 ? 6 : day - 1;
  var monday = new Date(date);
  monday.setDate(date.getDate() - diff);
  return monday.toISOString().split('T')[0];
}

function addWeeks(dateStr, weeks) {
  if (dateStr == null) return null;
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().split('T')[0];
}

function weeksBetween(a, b) {
  var da = new Date(a);
  var db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return 0;
  return Math.round((db - da) / (7 * 86400000));
}

var MIN_HISTORY_WEEKS = 3;

function setMinHistoryWeeks(n) {
  MIN_HISTORY_WEEKS = n;
}

/*
 * Load CTUF records from NoSQL and group by (unit_id, crime_head_id).
 */
async function loadCTUFRecords(appInstance) {
  var { NoSQLEnum, NoSQLMarshall } = require('zcatalyst-sdk-node/lib/no-sql');
  var { NoSQLOperator } = NoSQLEnum;
  var noSql = appInstance.nosql();
  var table = await noSql.getTable('CaseTimeUnitFeature');
  var allDocs = [];
  var startKey = null;
  var hasMore = true;

  while (hasMore) {
    var queryParams = {
      key_condition: {
        attribute: 'type',
        operator: NoSQLOperator.EQUALS,
        value: NoSQLMarshall.makeString('CTUF')
      },
      limit: 100,
      consistent_read: true
    };
    if (startKey) queryParams.start_key = startKey;

    var result = await table.queryTable(queryParams);
    var items;
    try {
      items = result.getResponseData();
    } catch (e) {
      throw new Error('Failed to parse NoSQL response: ' + e.message);
    }

    if (items && items.length > 0) {
      for (var di = 0; di < items.length; di++) {
        var data = items[di];
        if (data && data.item && typeof data.item.to === 'function') {
          var doc = data.item.to();
          if (doc && doc.feature_id) allDocs.push(doc);
        }
      }
    }
    try {
      startKey = result.start_key;
    } catch (e) { startKey = null; }
    hasMore = (startKey != null) && (items && items.length > 0);
  }

  return allDocs;
}

/*
 * Group CTUF records by (unit_id, crime_head_id) pair.
 * Returns a map: key = "unit_id|crime_head_id", value = array of records.
 */
function groupByUnitCrime(ctufRecords) {
  var groups = {};
  ctufRecords.forEach(function (rec) {
    var unitId = rec.unit_id || rec.unitId || '';
    var crimeHeadId = rec.crime_head_id || rec.crimeHeadId || '';
    var key = unitId + '|' + crimeHeadId;
    if (!groups[key]) groups[key] = { unit_id: unitId, crime_head_id: crimeHeadId, records: [] };
    groups[key].records.push(rec);
  });
  return groups;
}

/*
 * Sort records chronologically by time_bucket.
 */
function sortChronologically(records) {
  return records.slice().sort(function (a, b) {
    var ta = a.time_bucket || a.timeBucket || '';
    var tb = b.time_bucket || b.timeBucket || '';
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return 0;
  });
}

/*
 * Aggregate duplicate weeks: same time_bucket within a group sums case_count.
 */
function aggregateDuplicates(records) {
  var map = {};
  records.forEach(function (r) {
    var tb = r.time_bucket || r.timeBucket || '';
    if (!tb) return;
    var cc = Number(r.case_count || r.caseCount || 0);
    map[tb] = (map[tb] || 0) + cc;
  });
  var result = [];
  var weeks = Object.keys(map).sort();
  weeks.forEach(function (w) { result.push({ time_bucket: w, case_count: map[w] }); });
  return result;
}

/*
 * Fill missing weeks with zero case_count between min and max dates.
 */
function fillMissingWeeks(sortedRecords) {
  if (sortedRecords.length < 2) return sortedRecords;
  var minDate = sortedRecords[0].time_bucket;
  var maxDate = sortedRecords[sortedRecords.length - 1].time_bucket;
  var dateSet = {};
  sortedRecords.forEach(function (r) { dateSet[r.time_bucket] = true; });

  var result = [];
  var current = minDate;
  while (current <= maxDate) {
    if (dateSet[current]) {
      var match = null;
      for (var i = 0; i < sortedRecords.length; i++) {
        if (sortedRecords[i].time_bucket === current) { match = sortedRecords[i]; break; }
      }
      result.push(match);
    } else {
      result.push({ time_bucket: current, case_count: 0 });
    }
    current = addWeeks(current, 1);
  }
  return result;
}

/*
 * Reject malformed records (missing/invalid time_bucket, non-numeric case_count).
 */
function rejectMalformed(records) {
  return records.filter(function (r) {
    var tb = r.time_bucket || r.timeBucket;
    if (!tb) return false;
    var d = new Date(tb);
    if (isNaN(d.getTime())) return false;
    var cc = Number(r.case_count || r.caseCount);
    if (isNaN(cc) || cc < 0) return false;
    return true;
  });
}

/*
 * Full preparation pipeline for one unit+crime series.
 */
function prepareSeries(ctufRecords) {
  // 1. Reject malformed
  var cleaned = rejectMalformed(ctufRecords);
  if (cleaned.length === 0) return null;

  // 2. Sort chronologically
  var sorted = sortChronologically(cleaned);

  // 3. Aggregate duplicate weeks
  var aggregated = aggregateDuplicates(sorted);

  // 4. Fill missing weeks
  var filled = fillMissingWeeks(aggregated);

  return filled;
}

/*
 * Temporal train/validation split.
 * Earlier observations → training, last validationRatio observations → validation.
 */
function temporalSplit(series, validationRatio) {
  validationRatio = validationRatio || 0.2;
  if (series.length < 2) return { training: series.slice(), validation: [] };
  var valCount = Math.max(1, Math.round(series.length * validationRatio));
  var splitIdx = series.length - valCount;
  return {
    training: series.slice(0, splitIdx),
    validation: series.slice(splitIdx)
  };
}

/*
 * Get all unique week dates from a series.
 */
function extractWeekValues(series) {
  return series.map(function (r) { return { date: r.time_bucket, value: r.case_count }; });
}

module.exports = {
  loadCTUFRecords: loadCTUFRecords,
  groupByUnitCrime: groupByUnitCrime,
  sortChronologically: sortChronologically,
  aggregateDuplicates: aggregateDuplicates,
  fillMissingWeeks: fillMissingWeeks,
  rejectMalformed: rejectMalformed,
  prepareSeries: prepareSeries,
  temporalSplit: temporalSplit,
  extractWeekValues: extractWeekValues,
  getMonday: getMonday,
  addWeeks: addWeeks,
  weeksBetween: weeksBetween,
  setMinHistoryWeeks: setMinHistoryWeeks,
  MIN_HISTORY_WEEKS: function () { return MIN_HISTORY_WEEKS; }
};
