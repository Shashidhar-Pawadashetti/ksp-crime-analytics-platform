'use strict';

var path = require('path');
var documentBuilder = require('../personmaster-builder/documentBuilder');

function generateNewPersonId(existingDocuments) {
  var maxNum = 0;
  for (var di = 0; di < existingDocuments.length; di++) {
    var match = existingDocuments[di].person_id.match(/^PM_(\d{6})$/);
    if (match) {
      var num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return 'PM_' + String(maxNum + 1).padStart(6, '0');
}

function normalizeAliasKey(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}

function aliasExists(aliases, newName) {
  var newKey = normalizeAliasKey(newName);
  if (!newKey) return true;
  for (var ai = 0; ai < aliases.length; ai++) {
    if (normalizeAliasKey(aliases[ai]) === newKey) return true;
  }
  return false;
}

function sourceRecordExists(sourceRecords, table, sourceId) {
  for (var si = 0; si < sourceRecords.length; si++) {
    if (sourceRecords[si].table === table && sourceRecords[si].source_id === sourceId) {
      return true;
    }
  }
  return false;
}

function applyMatch(existingPM, incomingRecord, sourceData) {
  var updated = JSON.parse(JSON.stringify(existingPM));

  var newSR = {
    table: incomingRecord.source_table,
    source_id: incomingRecord.source_id,
    case_id: incomingRecord.case_id || '',
    role: incomingRecord.source_table
  };

  if (incomingRecord.source_table === 'ComplainantDetails') {
    newSR.role = 'ComplainantDetails';
  }

  if (!sourceRecordExists(updated.source_records, newSR.table, newSR.source_id)) {
    updated.source_records.push(newSR);
  }

  if (!aliasExists(updated.aliases, incomingRecord.name)) {
    updated.aliases.push(incomingRecord.name);
    updated.aliases.sort();
  }

  updated.roles_summary = documentBuilder.computeRolesSummary(updated.source_records);

  var resolvedRecords = updated.source_records.map(function(sr) {
    return sourceData.sourceByKey[sr.table + ':' + sr.source_id] || sr;
  });
  updated.demographics = documentBuilder.computeDemographics(resolvedRecords);

  var names = resolvedRecords.map(function(r) { return r.name; }).filter(function(n) { return n; });
  updated.canonical_name = documentBuilder.chooseCanonicalName(names);

  updated.confidence = {
    cluster_size: updated.source_records.length,
    average_match_score: null,
    minimum_match_score: null,
    maximum_match_score: null
  };

  return updated;
}

function createNew(incomingRecord, sourceData) {
  var now = new Date().toISOString();

  var sourceRecord = sourceData.sourceByKey[
    incomingRecord.source_table + ':' + incomingRecord.source_id
  ] || incomingRecord;

  var aliases = incomingRecord.name ? [incomingRecord.name] : [];
  var names = incomingRecord.name ? [incomingRecord.name] : [];

  return {
    person_id: null,
    canonical_name: incomingRecord.name || '',
    aliases: aliases,
    source_records: [{
      table: incomingRecord.source_table,
      source_id: incomingRecord.source_id,
      case_id: incomingRecord.case_id || '',
      role: incomingRecord.source_table
    }],
    roles_summary: {
      accused_count: incomingRecord.source_table === 'Accused' ? 1 : 0,
      victim_count: incomingRecord.source_table === 'Victim' ? 1 : 0,
      complainant_count: incomingRecord.source_table === 'ComplainantDetails' ? 1 : 0
    },
    demographics: {
      gender: incomingRecord.gender || null,
      estimated_age: incomingRecord.age || null,
      district: null,
      unit: null
    },
    confidence: {
      cluster_size: 1,
      average_match_score: null,
      minimum_match_score: null,
      maximum_match_score: null
    },
    meta: {
      created_at: now,
      algorithm_version: 'v1',
      entity_resolution_version: '4.2B'
    }
  };
}

module.exports = { applyMatch, createNew, generateNewPersonId };
