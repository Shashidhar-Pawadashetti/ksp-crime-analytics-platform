'use strict';

var path = require('path');
var normaliser = require('../entity-matching-engine/normaliser');
var phonetic = require('../entity-matching-engine/phonetic');
var blocking = require('../entity-matching-engine/blocking');

var normaliseName = normaliser.normaliseName;
var generatePhoneticKey = phonetic.generatePhoneticKey;
var STRATEGIES = blocking.STRATEGIES;

var BUILDER_OUTPUT_DIR = path.resolve(__dirname, '..', 'personmaster-builder', 'output');
var DOCUMENTS_PATH = path.join(BUILDER_OUTPUT_DIR, 'personmaster_documents.json');

function prepareRecord(name, age, gender, case_id, source_table, source_id) {
  var normalised = normaliseName(name);
  var phoneticKey = normalised ? generatePhoneticKey(normalised) : '';
  return {
    name: name,
    normalised_name: normalised,
    phonetic_key: phoneticKey,
    age: age,
    gender: gender,
    case_id: case_id,
    source_table: source_table,
    source_id: source_id
  };
}

function computeBlockingKeys(record) {
  var keys = {};
  for (var si = 0; si < STRATEGIES.length; si++) {
    var key = STRATEGIES[si].fn(record);
    if (key) keys[STRATEGIES[si].name] = key;
  }
  return keys;
}

function precomputeBlockingIndex(sourceData, pmDocuments) {
  var index = {};
  var pmKeyLookup = {};

  for (var di = 0; di < pmDocuments.length; di++) {
    var doc = pmDocuments[di];
    pmKeyLookup[doc.person_id] = doc;
  }

  for (var di2 = 0; di2 < pmDocuments.length; di2++) {
    var doc2 = pmDocuments[di2];
    var handledKeys = {};

    for (var si = 0; si < doc2.source_records.length; si++) {
      var sr = doc2.source_records[si];
      var srcKey = sr.table + ':' + sr.source_id;
      var srcRecord = sourceData.sourceByKey[srcKey];
      if (!srcRecord) continue;

      var rec = prepareRecord(
        srcRecord.name,
        srcRecord.age,
        srcRecord.gender,
        srcRecord.case_id,
        srcRecord.table,
        srcRecord.source_id
      );
      rec.person_id = doc2.person_id;

      var keys = computeBlockingKeys(rec);
      for (var kn in keys) {
        var blockVal = keys[kn];
        var fullKey = kn + '::' + blockVal;
        if (handledKeys[fullKey]) continue;
        handledKeys[fullKey] = true;

        if (!index[fullKey]) index[fullKey] = {};
        index[fullKey][doc2.person_id] = true;
      }
    }
  }

  return index;
}

function findCandidates(incomingRecord, blockingIndex) {
  var keys = computeBlockingKeys(incomingRecord);
  var candidateSet = {};

  for (var kn in keys) {
    var blockVal = keys[kn];
    var fullKey = kn + '::' + blockVal;
    var matched = blockingIndex[fullKey];
    if (matched) {
      for (var pmId in matched) {
        candidateSet[pmId] = true;
      }
    }
  }

  return Object.keys(candidateSet);
}

function loadCandidates(incomingRecord, sourceData, pmDocuments) {
  var blockingIndex = precomputeBlockingIndex(sourceData, pmDocuments);
  var pmIds = findCandidates(incomingRecord, blockingIndex);
  var pmLookup = {};
  for (var di = 0; di < pmDocuments.length; di++) {
    pmLookup[pmDocuments[di].person_id] = pmDocuments[di];
  }
  return pmIds.map(function(id) { return pmLookup[id]; });
}

module.exports = {
  prepareRecord,
  computeBlockingKeys,
  precomputeBlockingIndex,
  findCandidates,
  loadCandidates
};
