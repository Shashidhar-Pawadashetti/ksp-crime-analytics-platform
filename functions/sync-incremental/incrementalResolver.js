'use strict';

var emEngine = require('../entity-matching-engine/index');

var match = emEngine.match;

function resolve(incomingRecord, candidatePMs, sourceData) {
  if (candidatePMs.length === 0) {
    return { matched: false, bestPM: null, bestScore: 0, allScores: [] };
  }

  var results = [];

  for (var ci = 0; ci < candidatePMs.length; ci++) {
    var pm = candidatePMs[ci];
    var pmScore = computeCompositeScore(incomingRecord, pm, sourceData);

    results.push({
      person_id: pm.person_id,
      pm: pm,
      score: pmScore.confidence,
      matched: pmScore.classification === 'CONFIRMED',
      classification: pmScore.classification
    });
  }

  results.sort(function(a, b) { return b.score - a.score; });

  var best = results[0];

  if (best.matched) {
    return {
      matched: true,
      bestPM: best.pm,
      bestScore: best.score,
      allScores: results
    };
  }

  return {
    matched: false,
    bestPM: null,
    bestScore: best ? best.score : 0,
    allScores: results
  };
}

function resolveSourceRecord(sr, sourceData) {
  if (!sr || !sourceData) return null;
  var key = sr.table + ':' + sr.source_id;
  return sourceData.sourceByKey[key] || null;
}

function computeCompositeScore(incomingRecord, pm, sourceData) {
  var bestConfidence = 0;
  var bestClassification = 'DISCARD';
  var bestBreakdown = null;

  for (var si = 0; si < pm.source_records.length; si++) {
    var sr = pm.source_records[si];

    var fullRecord = resolveSourceRecord(sr, sourceData);
    if (!fullRecord) continue;

    var pmRecord = {
      name: fullRecord.name || '',
      normalised_name: fullRecord.name || '',
      age: fullRecord.age,
      gender: fullRecord.gender,
      lat: fullRecord.lat,
      lon: fullRecord.lon,
      unit_id: fullRecord.unit_id,
      district_id: fullRecord.district_id,
      source_table: fullRecord.table,
      source_id: fullRecord.source_id
    };

    var result = match(incomingRecord, pmRecord);

    if (result.confidence > bestConfidence) {
      bestConfidence = result.confidence;
      bestClassification = result.classification;
      bestBreakdown = result.score_breakdown;
    }
  }

  return {
    confidence: bestConfidence,
    classification: bestClassification,
    score_breakdown: bestBreakdown
  };
}

module.exports = { resolve, computeCompositeScore };
