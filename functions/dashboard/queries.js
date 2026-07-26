'use strict';

function isSafeValue(val) {
  if (!val || typeof val !== 'string') return true;
  return /^[a-zA-Z0-9\s\-_]+$/.test(val);
}

function escapeSingleQuotes(val) {
  if (!val || typeof val !== 'string') return val;
  return val.replace(/'/g, "''");
}

function filterDateConditions(filters) {
  const clauses = [];
  if (filters.startDate) clauses.push(`cm.CrimeRegisteredDate >= '${escapeSingleQuotes(filters.startDate)}'`);
  if (filters.endDate) clauses.push(`cm.CrimeRegisteredDate <= '${escapeSingleQuotes(filters.endDate)}'`);
  return clauses;
}

function trendQuery(filters) {
  const joins = [];
  const conditions = filterDateConditions(filters);

  if (filters.district) {
    if (!isSafeValue(filters.district)) throw new Error('Invalid district value');
    joins.push('INNER JOIN Unit filter_unit ON cm.PoliceStationID = filter_unit.ROWID');
    joins.push('INNER JOIN District filter_dist ON filter_unit.DistrictID = filter_dist.ROWID');
    conditions.push(`filter_dist.DistrictName LIKE '*${escapeSingleQuotes(filters.district)}*'`);
  }

  if (filters.crimeType) {
    if (!isSafeValue(filters.crimeType)) throw new Error('Invalid crimeType value');
    joins.push('INNER JOIN CrimeHead filter_crime ON cm.CrimeMajorHeadID = filter_crime.ROWID');
    conditions.push(`filter_crime.CrimeGroupName LIKE '*${escapeSingleQuotes(filters.crimeType)}*'`);
  }

  const joinClause = joins.join('\n');
  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  return `
    SELECT cm.CrimeRegisteredDate, COUNT(cm.CaseMasterID)
    FROM CaseMaster cm
    ${joinClause}
    ${where}
    GROUP BY cm.CrimeRegisteredDate
    ORDER BY cm.CrimeRegisteredDate ASC
    LIMIT 60
  `;
}

function breakdownQuery(filters) {
  const joins = [];
  const conditions = filterDateConditions(filters);

  if (filters.district) {
    if (!isSafeValue(filters.district)) throw new Error('Invalid district value');
    joins.push('INNER JOIN Unit filter_unit ON cm.PoliceStationID = filter_unit.ROWID');
    joins.push('INNER JOIN District filter_dist ON filter_unit.DistrictID = filter_dist.ROWID');
    conditions.push(`filter_dist.DistrictName LIKE '*${escapeSingleQuotes(filters.district)}*'`);
  }

  if (filters.crimeType) {
    if (!isSafeValue(filters.crimeType)) throw new Error('Invalid crimeType value');
    conditions.push(`ch.CrimeGroupName LIKE '*${escapeSingleQuotes(filters.crimeType)}*'`);
  }

  const joinClause = joins.join('\n');
  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  return `
    SELECT ch.CrimeGroupName, COUNT(cm.CaseMasterID)
    FROM CaseMaster cm
    INNER JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.ROWID
    ${joinClause}
    ${where}
    GROUP BY ch.CrimeGroupName
    LIMIT 100
  `;
}

function locationQuery(filters) {
  const joins = [];
  const conditions = filterDateConditions(filters);

  if (filters.district) {
    if (!isSafeValue(filters.district)) throw new Error('Invalid district value');
    conditions.push(`d.DistrictName LIKE '*${escapeSingleQuotes(filters.district)}*'`);
  }

  if (filters.crimeType) {
    if (!isSafeValue(filters.crimeType)) throw new Error('Invalid crimeType value');
    joins.push('INNER JOIN CrimeHead filter_crime ON cm.CrimeMajorHeadID = filter_crime.ROWID');
    conditions.push(`filter_crime.CrimeGroupName LIKE '*${escapeSingleQuotes(filters.crimeType)}*'`);
  }

  const joinClause = joins.join('\n');
  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  return `
    SELECT d.DistrictName, COUNT(cm.CaseMasterID)
    FROM CaseMaster cm
    INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID
    INNER JOIN District d ON u.DistrictID = d.ROWID
    ${joinClause}
    ${where}
    GROUP BY d.DistrictName
    LIMIT 100
  `;
}

function hotspotsQuery(filters) {
  const joins = [];
  const conditions = filterDateConditions(filters);

  if (filters.district) {
    if (!isSafeValue(filters.district)) throw new Error('Invalid district value');
    joins.push('INNER JOIN Unit filter_unit ON cm.PoliceStationID = filter_unit.ROWID');
    joins.push('INNER JOIN District filter_dist ON filter_unit.DistrictID = filter_dist.ROWID');
    conditions.push(`filter_dist.DistrictName LIKE '*${escapeSingleQuotes(filters.district)}*'`);
  }

  if (filters.crimeType) {
    if (!isSafeValue(filters.crimeType)) throw new Error('Invalid crimeType value');
    conditions.push(`ch.CrimeGroupName LIKE '*${escapeSingleQuotes(filters.crimeType)}*'`);
  }

  const joinClause = joins.join('\n');
  const latLngCondition = 'cm.Latitude IS NOT NULL AND cm.Longitude IS NOT NULL';
  const allConditions = [latLngCondition].concat(conditions);
  const where = 'WHERE ' + allConditions.join(' AND ');

  return `
    SELECT cm.CaseMasterID, cm.Latitude, cm.Longitude, ch.CrimeGroupName, cm.CrimeRegisteredDate
    FROM CaseMaster cm
    INNER JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.ROWID
    ${joinClause}
    ${where}
    LIMIT 200
  `;
}

function riskRankedQuery() {
  return `
    SELECT a.AccusedName, COUNT(a.CaseMasterID)
    FROM Accused a
    GROUP BY a.AccusedName
    ORDER BY COUNT(a.CaseMasterID) DESC
    LIMIT 50
  `;
}

function seasonalQuery(filters) {
  const joins = [];
  const conditions = filterDateConditions(filters);

  if (filters.district) {
    if (!isSafeValue(filters.district)) throw new Error('Invalid district value');
    joins.push('INNER JOIN Unit filter_unit ON cm.PoliceStationID = filter_unit.ROWID');
    joins.push('INNER JOIN District filter_dist ON filter_unit.DistrictID = filter_dist.ROWID');
    conditions.push(`filter_dist.DistrictName LIKE '*${escapeSingleQuotes(filters.district)}*'`);
  }

  if (filters.crimeType) {
    if (!isSafeValue(filters.crimeType)) throw new Error('Invalid crimeType value');
    joins.push('INNER JOIN CrimeHead filter_crime ON cm.CrimeMajorHeadID = filter_crime.ROWID');
    conditions.push(`filter_crime.CrimeGroupName LIKE '*${escapeSingleQuotes(filters.crimeType)}*'`);
  }

  const joinClause = joins.join('\n');
  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  return `
    SELECT cm.CrimeRegisteredDate, COUNT(cm.CaseMasterID)
    FROM CaseMaster cm
    ${joinClause}
    ${where}
    GROUP BY cm.CrimeRegisteredDate
    ORDER BY cm.CrimeRegisteredDate ASC
    LIMIT 200
  `;
}

function personSearchQuery(searchTerm) {
  if (!searchTerm || typeof searchTerm !== 'string' || searchTerm.trim().length === 0) {
    return [];
  }
  if (!isSafeValue(searchTerm)) {
    throw new Error('Invalid search term: only alphanumeric characters and spaces allowed');
  }
  const escaped = escapeSingleQuotes(searchTerm.trim());
  return [
    `SELECT a.AccusedName, a.AccusedMasterID FROM Accused a WHERE a.AccusedName LIKE '*${escaped}*' LIMIT 10`,
    `SELECT v.VictimName, v.VictimMasterID FROM Victim v WHERE v.VictimName LIKE '*${escaped}*' LIMIT 10`,
    `SELECT cd.ComplainantName, cd.ComplainantID FROM ComplainantDetails cd WHERE cd.ComplainantName LIKE '*${escaped}*' LIMIT 10`
  ];
}

module.exports = {
  trendQuery,
  breakdownQuery,
  locationQuery,
  hotspotsQuery,
  riskRankedQuery,
  seasonalQuery,
  personSearchQuery
};
