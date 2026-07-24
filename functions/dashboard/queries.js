'use strict';

function isSafeValue(val) {
  if (!val || typeof val !== 'string') return true;
  return /^[a-zA-Z0-9\s\-_]+$/.test(val);
}

function escapeSingleQuotes(val) {
  if (!val || typeof val !== 'string') return val;
  return val.replace(/'/g, "''");
}

function buildWhere(filters) {
  const clauses = [];

  if (filters.district) {
    if (!isSafeValue(filters.district)) {
      throw new Error('Invalid district value: only alphanumeric characters and spaces allowed');
    }
    clauses.push(`d.DistrictName LIKE '*${escapeSingleQuotes(filters.district)}*'`);
  }

  if (filters.crimeType) {
    if (!isSafeValue(filters.crimeType)) {
      throw new Error('Invalid crimeType value: only alphanumeric characters and spaces allowed');
    }
    clauses.push(`ch.CrimeGroupName LIKE '*${escapeSingleQuotes(filters.crimeType)}*'`);
  }

  if (filters.startDate) {
    clauses.push(`cm.CrimeRegisteredDate >= '${escapeSingleQuotes(filters.startDate)}'`);
  }

  if (filters.endDate) {
    clauses.push(`cm.CrimeRegisteredDate <= '${escapeSingleQuotes(filters.endDate)}'`);
  }

  return clauses.length > 0 ? 'WHERE ' + clauses.join(' AND ') : '';
}

function buildFilterSubqueries(filters) {
  const clauses = [];
  if (filters.district) {
    clauses.push(`cm.PoliceStationID IN (SELECT u.ROWID FROM Unit u INNER JOIN District d ON u.DistrictID = d.ROWID WHERE d.DistrictName LIKE '*${escapeSingleQuotes(filters.district)}*')`);
  }
  if (filters.crimeType) {
    clauses.push(`cm.CrimeMajorHeadID IN (SELECT ch.ROWID FROM CrimeHead ch WHERE ch.CrimeGroupName LIKE '*${escapeSingleQuotes(filters.crimeType)}*')`);
  }
  return clauses;
}

function trendQuery(filters) {
  const filterClauses = buildFilterSubqueries(filters);
  const dateFilters = [];
  if (filters.startDate) dateFilters.push(`cm.CrimeRegisteredDate >= '${escapeSingleQuotes(filters.startDate)}'`);
  if (filters.endDate) dateFilters.push(`cm.CrimeRegisteredDate <= '${escapeSingleQuotes(filters.endDate)}'`);

  const allConditions = filterClauses.concat(dateFilters);
  const where = allConditions.length > 0 ? 'WHERE ' + allConditions.join(' AND ') : '';

  return `
    SELECT cm.CrimeRegisteredDate, COUNT(cm.CaseMasterID)
    FROM CaseMaster cm
    ${where}
    GROUP BY cm.CrimeRegisteredDate
    ORDER BY cm.CrimeRegisteredDate ASC
    LIMIT 60
  `;
}

function breakdownQuery(filters) {
  const filterClauses = buildFilterSubqueries(filters);
  const dateFilters = [];
  if (filters.startDate) dateFilters.push(`cm.CrimeRegisteredDate >= '${escapeSingleQuotes(filters.startDate)}'`);
  if (filters.endDate) dateFilters.push(`cm.CrimeRegisteredDate <= '${escapeSingleQuotes(filters.endDate)}'`);

  const allConditions = filterClauses.concat(dateFilters);
  const where = allConditions.length > 0 ? 'WHERE ' + allConditions.join(' AND ') : '';

  return `
    SELECT ch.CrimeGroupName, COUNT(cm.CaseMasterID)
    FROM CaseMaster cm
    INNER JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.ROWID
    ${where}
    GROUP BY ch.CrimeGroupName
    ORDER BY COUNT(cm.CaseMasterID) DESC
    LIMIT 15
  `;
}

function locationQuery(filters) {
  const filterClauses = buildFilterSubqueries(filters);
  const dateFilters = [];
  if (filters.startDate) dateFilters.push(`cm.CrimeRegisteredDate >= '${escapeSingleQuotes(filters.startDate)}'`);
  if (filters.endDate) dateFilters.push(`cm.CrimeRegisteredDate <= '${escapeSingleQuotes(filters.endDate)}'`);

  const allConditions = filterClauses.concat(dateFilters);
  const where = allConditions.length > 0 ? 'WHERE ' + allConditions.join(' AND ') : '';

  return `
    SELECT d.DistrictName, COUNT(cm.CaseMasterID)
    FROM CaseMaster cm
    INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID
    INNER JOIN District d ON u.DistrictID = d.ROWID
    ${where}
    GROUP BY d.DistrictName
    ORDER BY COUNT(cm.CaseMasterID) DESC
    LIMIT 20
  `;
}

function hotspotsQuery(filters) {
  const filterClauses = buildFilterSubqueries(filters);
  const dateFilters = [];
  if (filters.startDate) dateFilters.push(`cm.CrimeRegisteredDate >= '${escapeSingleQuotes(filters.startDate)}'`);
  if (filters.endDate) dateFilters.push(`cm.CrimeRegisteredDate <= '${escapeSingleQuotes(filters.endDate)}'`);

  const allConditions = filterClauses.concat(dateFilters);
  const latLngCondition = 'cm.Latitude IS NOT NULL AND cm.Longitude IS NOT NULL';
  const conditions = [latLngCondition].concat(allConditions);
  const where = 'WHERE ' + conditions.join(' AND ');

  return `
    SELECT cm.CaseMasterID, cm.Latitude, cm.Longitude, ch.CrimeGroupName, cm.CrimeRegisteredDate
    FROM CaseMaster cm
    INNER JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.ROWID
    ${where}
    LIMIT 200
  `;
}

function riskRankedQuery() {
  return `
    SELECT a.AccusedName, COUNT(DISTINCT a.CaseMasterID) AS case_count
    FROM Accused a
    GROUP BY a.AccusedName
    HAVING COUNT(DISTINCT a.CaseMasterID) >= 1
    ORDER BY COUNT(DISTINCT a.CaseMasterID) DESC
    LIMIT 50
  `;
}

function seasonalQuery(filters) {
  const filterClauses = buildFilterSubqueries(filters);
  const dateFilters = [];
  if (filters.startDate) dateFilters.push(`cm.CrimeRegisteredDate >= '${escapeSingleQuotes(filters.startDate)}'`);
  if (filters.endDate) dateFilters.push(`cm.CrimeRegisteredDate <= '${escapeSingleQuotes(filters.endDate)}'`);

  const allConditions = filterClauses.concat(dateFilters);
  const where = allConditions.length > 0 ? 'WHERE ' + allConditions.join(' AND ') : '';

  return `
    SELECT cm.CrimeRegisteredDate, COUNT(cm.CaseMasterID)
    FROM CaseMaster cm
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
  personSearchQuery,
  buildWhere
};
