'use strict';

/**
 * Validate filter values for safety (T-02-01 mitigation).
 * Returns true if value contains only alphanumeric, spaces, hyphens, and underscores.
 */
function isSafeValue(val) {
  if (!val || typeof val !== 'string') return true;
  return /^[a-zA-Z0-9\s\-_]+$/.test(val);
}

/**
 * Escape single quotes in filter values by doubling them (T-02-01 mitigation).
 */
function escapeSingleQuotes(val) {
  if (!val || typeof val !== 'string') return val;
  return val.replace(/'/g, "''");
}

/**
 * Build WHERE clause from filter parameters.
 * Validates district and crimeType inputs are alphanumeric + spaces only.
 * Escapes single quotes in all string values.
 */
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

/**
 * Trend query: crime counts over time (ASC, LIMIT 60).
 * Maps to /dashboard/trend endpoint.
 */
function trendQuery(filters) {
  return `
    SELECT cm.CrimeRegisteredDate, COUNT(cm.CaseMasterID)
    FROM CaseMaster cm
    INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID
    INNER JOIN District d ON u.DistrictID = d.ROWID
    INNER JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.ROWID
    ${buildWhere(filters)}
    GROUP BY cm.CrimeRegisteredDate
    ORDER BY cm.CrimeRegisteredDate ASC
    LIMIT 60
  `;
}

/**
 * Breakdown query: crime counts by CrimeGroupName (DESC, LIMIT 15).
 * Maps to /dashboard/breakdown endpoint.
 */
function breakdownQuery(filters) {
  return `
    SELECT ch.CrimeGroupName, COUNT(cm.CaseMasterID)
    FROM CaseMaster cm
    INNER JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.ROWID
    INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID
    INNER JOIN District d ON u.DistrictID = d.ROWID
    ${buildWhere(filters)}
    GROUP BY ch.CrimeGroupName
    ORDER BY COUNT(cm.CaseMasterID) DESC
    LIMIT 15
  `;
}

/**
 * Location query: crime counts by DistrictName (DESC, LIMIT 20).
 * Maps to /dashboard/location endpoint.
 */
function locationQuery(filters) {
  return `
    SELECT d.DistrictName, COUNT(cm.CaseMasterID)
    FROM CaseMaster cm
    INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID
    INNER JOIN District d ON u.DistrictID = d.ROWID
    INNER JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.ROWID
    ${buildWhere(filters)}
    GROUP BY d.DistrictName
    ORDER BY COUNT(cm.CaseMasterID) DESC
    LIMIT 20
  `;
}

/**
 * Hotspots query: returns lat/lng data for map rendering.
 * Maps to /dashboard/hotspots endpoint.
 */
function hotspotsQuery(filters) {
  return `
    SELECT cm.CaseMasterID, cm.Latitude, cm.Longitude, ch.CrimeGroupName, cm.CrimeRegisteredDate
    FROM CaseMaster cm
    INNER JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.ROWID
    ${buildWhere(filters)}
    AND cm.Latitude IS NOT NULL AND cm.Longitude IS NOT NULL
    LIMIT 500
  `;
}

/**
 * Risk-ranked query: returns repeat offenders with case counts.
 * Maps to /dashboard/risk-ranked endpoint.
 */
function riskRankedQuery() {
  return `
    SELECT a.AccusedName, COUNT(DISTINCT a.CaseMasterID) AS case_count,
           COUNT(DISTINCT ch.CrimeGroupName) AS type_count
    FROM Accused a
    INNER JOIN CaseMaster cm ON a.CaseMasterID = cm.ROWID
    INNER JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.ROWID
    GROUP BY a.AccusedName
    HAVING COUNT(DISTINCT a.CaseMasterID) >= 1
    ORDER BY COUNT(DISTINCT a.CaseMasterID) DESC
    LIMIT 50
  `;
}

/**
 * Seasonal query: longer date range for seasonal pattern detection.
 * Maps to /dashboard/seasonal endpoint.
 */
function seasonalQuery(filters) {
  return `
    SELECT cm.CrimeRegisteredDate, COUNT(cm.CaseMasterID)
    FROM CaseMaster cm
    INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID
    INNER JOIN District d ON u.DistrictID = d.ROWID
    ${buildWhere(filters)}
    GROUP BY cm.CrimeRegisteredDate
    ORDER BY cm.CrimeRegisteredDate ASC
    LIMIT 365
  `;
}

/**
 * Person search query: used for autocomplete in GraphView.
 * Maps to /dashboard/person-search endpoint.
 */
function personSearchQuery(searchTerm) {
  if (!searchTerm || typeof searchTerm !== 'string') {
    throw new Error('searchTerm is required');
  }
  if (!isSafeValue(searchTerm)) {
    throw new Error('Invalid search term: only alphanumeric characters and spaces allowed');
  }
  return `
    SELECT DISTINCT AccusedName
    FROM Accused
    WHERE AccusedName LIKE '*${escapeSingleQuotes(searchTerm)}*'
    LIMIT 10
  `;
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
