'use strict';

var { EDGE_TYPES, VALID_EDGE_TYPES } = require('./edgeTypes');

/**
 * Compute a deterministic edge_id from two person IDs, edge type, and case IDs.
 *
 * LLD: "edge_id is a deterministic hash of
 *   (min(personId_A, personId_B), max(personId_A, personId_B), edgeType, sorted(case_ids))"
 *
 * Uses FNV-1a 64-bit hash (no crypto dependency).
 *
 * @param {string} src    — source person ID
 * @param {string} tgt    — target person ID
 * @param {string} type   — one of EDGE_TYPES values
 * @param {Array} [caseIds] — case IDs for this edge
 */
function deterministicEdgeId(src, tgt, type, caseIds) {
  var ids = [src, tgt].sort();
  var parts = [ids[0], ids[1], type];
  if (Array.isArray(caseIds) && caseIds.length > 0) {
    parts.push(caseIds.slice().sort().join('|'));
  }
  var seed = parts.join('|');
  var hash = 0xCBF29CE484222325;
  for (var i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x100000001B3);
    hash = hash >>> 0;
  }
  return 'E-' + hash.toString(16).padStart(12, '0').slice(0, 8).toUpperCase();
}

/**
 * Create a single typed edge object matching LLD §2.1 schema.
 *
 * @param {Object} opts
 * @param {string} opts.source_person_id
 * @param {string} opts.target_person_id   — stored as with_person_id in output
 * @param {string} opts.type               — one of EDGE_TYPES values
 * @param {string} opts.with_name_normalised
 * @param {Array}  [opts.case_ids]
 * @param {Array}  [opts.source_records]   — [{table, row_id, case_id?}]
 * @param {number} [opts.confidence]
 * @param {Object} [opts.score_breakdown]   — {name_score, age_score, gender_score, location_score}
 * @param {string} [opts.reason_below_threshold]
 */
function createEdge(opts) {
  if (!opts || !opts.source_person_id || !opts.target_person_id || !opts.type) {
    throw new Error('createEdge requires source_person_id, target_person_id, and type');
  }

  var edge = {
    edge_id: deterministicEdgeId(
      opts.source_person_id,
      opts.target_person_id,
      opts.type,
      opts.case_ids
    ),
    type: opts.type,
    with_person_id: opts.target_person_id,
    with_name_normalised: opts.with_name_normalised || '',
    case_ids: Array.isArray(opts.case_ids) ? opts.case_ids : [],
    source_records: Array.isArray(opts.source_records) ? opts.source_records : []
  };

  if (opts.confidence != null) {
    edge.confidence = opts.confidence;
  }

  if (opts.score_breakdown) {
    edge.score_breakdown = {
      name_score: opts.score_breakdown.name_score || 0,
      age_score: opts.score_breakdown.age_score || 0,
      gender_score: opts.score_breakdown.gender_score || 0,
      location_score: opts.score_breakdown.location_score || 0
    };
  }

  if (opts.reason_below_threshold) {
    edge.reason_below_threshold = opts.reason_below_threshold;
  }

  return edge;
}

module.exports = { createEdge: createEdge, deterministicEdgeId: deterministicEdgeId };
