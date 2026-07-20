'use strict';

/*
 * Edge validator — validates typed edge objects against schema rules.
 *
 * Pure validation only — NO database calls, NO persistence.
 *
 * Returns { valid: boolean, errors: string[] }
 */

var { VALID_EDGE_TYPES } = require('./edgeTypes');

/**
 * Validate an edge object.
 *
 * Checks:
 *   - edge_type ∈ VALID_EDGE_TYPES
 *   - confidence is a number between 0 and 1 (inclusive)
 *   - source_person_id !== target_person_id
 *   - target_person_id is a non-empty string
 *   - case_ids is an array
 *   - evidence is an array
 *
 * @param {Object} edge  — edge object to validate
 * @param {Object} [context]  — optional context with source_person_id
 * @param {string} [context.source_person_id]
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateEdge(edge, context) {
  var errors = [];

  if (!edge || typeof edge !== 'object') {
    return { valid: false, errors: ['edge must be a non-null object'] };
  }

  /* -- edge_type -- */
  if (!edge.edge_type) {
    errors.push('edge_type is required');
  } else if (VALID_EDGE_TYPES.indexOf(edge.edge_type) === -1) {
    errors.push('edge_type "' + edge.edge_type + '" is not a valid type (valid: ' + VALID_EDGE_TYPES.join(', ') + ')');
  }

  /* -- confidence -- */
  if (edge.confidence == null) {
    errors.push('confidence is required');
  } else if (typeof edge.confidence !== 'number' || isNaN(edge.confidence)) {
    errors.push('confidence must be a number');
  } else if (edge.confidence < 0 || edge.confidence > 1) {
    errors.push('confidence must be between 0 and 1 (inclusive)');
  }

  /* -- target_person_id -- */
  if (!edge.target_person_id || typeof edge.target_person_id !== 'string') {
    errors.push('target_person_id is required and must be a non-empty string');
  }

  /* -- source != target -- */
  if (context && context.source_person_id) {
    if (edge.target_person_id === context.source_person_id) {
      errors.push('source_person_id and target_person_id must be different');
    }
  }

  /* -- case_ids -- */
  if (edge.case_ids !== undefined && !Array.isArray(edge.case_ids)) {
    errors.push('case_ids must be an array');
  }

  /* -- evidence -- */
  if (edge.evidence !== undefined && !Array.isArray(edge.evidence)) {
    errors.push('evidence must be an array');
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

module.exports = { validateEdge: validateEdge };
