'use strict';

var NODE_STYLES = {
  'accused': {
    size: 50,
    color: '#E53935',
    borderColor: '#B71C1C',
    icon: 'user-tie'
  },
  'victim': {
    size: 45,
    color: '#FF9800',
    borderColor: '#E65100',
    icon: 'user-injured'
  },
  'complainant': {
    size: 45,
    color: '#43A047',
    borderColor: '#1B5E20',
    icon: 'user-shield'
  },
  'mixed': {
    size: 55,
    color: '#7B1FA2',
    borderColor: '#4A148C',
    icon: 'users'
  },
  'default': {
    size: 40,
    color: '#757575',
    borderColor: '#424242',
    icon: 'user'
  }
};

var EDGE_STYLES = {
  'CO_ACCUSED': {
    color: '#E53935',
    width: 3,
    style: 'solid',
    label: 'Co-Accused'
  },
  'ACCUSED_TO_VICTIM': {
    color: '#FF9800',
    width: 2,
    style: 'solid',
    label: 'Accused → Victim'
  },
  'UNCONFIRMED_MATCH': {
    color: '#9E9E9E',
    width: 1,
    style: 'dashed',
    label: 'Unconfirmed'
  },
  'SHARED_LOCATION': {
    color: '#2196F3',
    width: 2,
    style: 'dotted',
    label: 'Shared Location'
  },
  'default': {
    color: '#757575',
    width: 1,
    style: 'solid',
    label: 'Unknown'
  }
};

function getNodeStyle(rolesSummary) {
  if (!rolesSummary) return NODE_STYLES.default;

  var counts = [];
  if (rolesSummary.accused_count > 0) counts.push('accused');
  if (rolesSummary.victim_count > 0) counts.push('victim');
  if (rolesSummary.complainant_count > 0) counts.push('complainant');

  if (counts.length === 0) return NODE_STYLES.default;
  if (counts.length === 1) return NODE_STYLES[counts[0]];
  return NODE_STYLES.mixed;
}

function getPrimaryRole(rolesSummary) {
  if (!rolesSummary) return 'Unknown';

  var maxCount = 0;
  var primaryRole = 'Unknown';

  if (rolesSummary.accused_count > maxCount) {
    maxCount = rolesSummary.accused_count;
    primaryRole = 'Accused';
  }
  if (rolesSummary.victim_count > maxCount) {
    maxCount = rolesSummary.victim_count;
    primaryRole = 'Victim';
  }
  if (rolesSummary.complainant_count > maxCount) {
    maxCount = rolesSummary.complainant_count;
    primaryRole = 'Complainant';
  }

  var total = rolesSummary.accused_count + rolesSummary.victim_count + rolesSummary.complainant_count;
  if (total === 0) return 'Unknown';

  var roleCount = 0;
  if (rolesSummary.accused_count > 0) roleCount++;
  if (rolesSummary.victim_count > 0) roleCount++;
  if (rolesSummary.complainant_count > 0) roleCount++;

  if (roleCount === 1) return primaryRole;

  var dominance = maxCount / total;
  return dominance >= 0.75 ? primaryRole : 'Mixed (' + primaryRole + ')';
}

function getEdgeStyle(edgeType) {
  return EDGE_STYLES[edgeType] || EDGE_STYLES.default;
}

module.exports = {
  NODE_STYLES: NODE_STYLES,
  EDGE_STYLES: EDGE_STYLES,
  getNodeStyle: getNodeStyle,
  getPrimaryRole: getPrimaryRole,
  getEdgeStyle: getEdgeStyle
};
