'use strict';

var EDGE_TYPES = {
  CO_ACCUSED: 'co_accused',
  ACCUSED_TO_VICTIM: 'accused_to_victim',
  SHARED_LOCATION: 'shared_location',
  CANDIDATE_MATCH: 'candidate_match'
};

var VALID_EDGE_TYPES = Object.keys(EDGE_TYPES).map(function (k) {
  return EDGE_TYPES[k];
});

module.exports = {
  EDGE_TYPES: EDGE_TYPES,
  VALID_EDGE_TYPES: VALID_EDGE_TYPES
};
