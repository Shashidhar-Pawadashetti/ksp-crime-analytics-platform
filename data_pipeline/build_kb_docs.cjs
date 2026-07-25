'use strict';

const fs = require('fs');
const path = require('path');

const EXPORT_DIR = path.join(__dirname, 'kb_export');
const OUTPUT_DIR = path.join(__dirname, 'kb_output');
const BATCH_SIZE = 200;

const TABLES = [
  { name: 'State', columns: ['StateID', 'StateName', 'NationalityID', 'Active'] },
  { name: 'District', columns: ['DistrictID', 'DistrictName', 'StateID', 'Active'] },
  { name: 'CaseCategory', columns: ['CaseCategoryID', 'LookupValue', 'Active'] },
  { name: 'GravityOffence', columns: ['GravityOffenceID', 'LookupValue', 'Active'] },
  { name: 'CrimeHead', columns: ['CrimeHeadID', 'CrimeGroupName', 'Active'] },
  { name: 'Act', columns: ['ActCode', 'ActDescription', 'ShortName', 'Active'] },
  { name: 'Section', columns: ['ActCode', 'SectionCode', 'SectionDescription', 'Active'] },
  { name: 'CrimeSubHead', columns: ['CrimeSubHeadID', 'CrimeHeadID', 'CrimeHeadName', 'SeqID'] },
  { name: 'CrimeHeadActSection', columns: ['CrimeHeadID', 'ActCode', 'SectionCode'] },
  { name: 'ReligionMaster', columns: ['ReligionID', 'ReligionName'] },
  { name: 'CasteMaster', columns: ['caste_master_id', 'caste_master_name'] },
  { name: 'OccupationMaster', columns: ['OccupationID', 'OccupationName'] },
  { name: 'CaseStatusMaster', columns: ['CaseStatusID', 'CaseStatusName'] },
  { name: 'UnitType', columns: ['UnitTypeID', 'UnitTypeName', 'CityDistState', 'Hierarchy', 'Active'] },
  { name: 'Rank', columns: ['RankID', 'RankName', 'Hierarchy', 'Active'] },
  { name: 'Designation', columns: ['DesignationID', 'DesignationName', 'Active', 'SortOrder'] },
  { name: 'Employee', columns: ['EmployeeID', 'FirstName', 'KGID', 'RankID', 'DesignationID', 'UnitID', 'DistrictID', 'EmployeeDOB', 'GenderID', 'BloodGroupID', 'PhysicallyChallenged', 'AppointmentDate'] },
  { name: 'Unit', columns: ['UnitID', 'UnitName', 'TypeID', 'ParentUnit', 'NationalityID', 'StateID', 'DistrictID', 'Active'] },
  { name: 'Court', columns: ['CourtID', 'CourtName', 'DistrictID', 'StateID', 'Active'] },
  { name: 'CaseMaster', columns: ['CaseMasterID', 'CrimeNo', 'CaseNo', 'CrimeRegisteredDate', 'PolicePersonID', 'PoliceStationID', 'CaseCategoryID', 'GravityOffenceID', 'CrimeMajorHeadID', 'CrimeMinorHeadID', 'CaseStatusID', 'CourtID', 'IncidentFromDate', 'IncidentToDate', 'InfoReceivedPSDate', 'Latitude', 'Longitude', 'BriefFacts'] },
  { name: 'ComplainantDetails', columns: ['ComplainantID', 'CaseMasterID', 'ComplainantName', 'AgeYear', 'OccupationID', 'ReligionID', 'CasteID', 'GenderID'] },
  { name: 'Victim', columns: ['VictimMasterID', 'CaseMasterID', 'VictimName', 'AgeYear', 'GenderID', 'VictimPolice'] },
  { name: 'Accused', columns: ['AccusedMasterID', 'CaseMasterID', 'AccusedName', 'AgeYear', 'GenderID', 'PersonID'] },
  { name: 'ActSectionAssociation', columns: ['CaseMasterID', 'ActID', 'SectionID', 'ActOrderID', 'SectionOrderID'] },
  { name: 'ChargesheetDetails', columns: ['CSID', 'CaseMasterID', 'csdate', 'cstype', 'PolicePersonID'] },
  { name: 'ArrestSurrender', columns: ['ArrestSurrenderID', 'CaseMasterID', 'ArrestSurrenderTypeID', 'ArrestSurrenderDate', 'ArrestSurrenderStateId', 'ArrestSurrenderDistrictId', 'PoliceStationID', 'IOID', 'CourtID', 'AccusedMasterID', 'IsAccused', 'IsComplainantAccused'] },
];

function log(msg) {
  console.log(`[KB] ${msg}`);
}

function buildIndex(rows, keyCol) {
  const idx = {};
  for (const r of rows) {
    const k = r[keyCol];
    if (k !== undefined && k !== '' && k !== null) idx[String(k)] = r;
  }
  return idx;
}

function buildMultiIndex(rows, keyCol) {
  const idx = {};
  for (const r of rows) {
    const k = r[keyCol];
    if (k === undefined || k === '' || k === null) continue;
    const ks = String(k);
    if (!idx[ks]) idx[ks] = [];
    idx[ks].push(r);
  }
  return idx;
}

const GENDER_MAP = { '1': 'Male', '2': 'Female', '3': 'Other' };

function pretty(val) {
  if (val === undefined || val === null || val === '') return 'N/A';
  return val;
}

function gender(val) {
  return GENDER_MAP[String(val)] || pretty(val);
}

function generateDocuments(allData) {
  log('Generating Knowledge Base documents...');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const {
    CaseMaster = [], District = [], CrimeHead = [], CrimeSubHead = [],
    CaseStatusMaster = [], Court = [], Unit = [], Employee = [],
    Accused = [], Victim = [], ComplainantDetails = [],
    ActSectionAssociation = [], Act = [], Section = [],
    ChargesheetDetails = [], ArrestSurrender = [],
    Rank = [], Designation = [], OccupationMaster = [],
  } = allData;

  const districtIdx = buildIndex(District, 'ROWID');
  const crimeHeadIdx = buildIndex(CrimeHead, 'ROWID');
  const crimeSubHeadIdx = buildMultiIndex(CrimeSubHead, 'CrimeHeadID');
  const caseStatusIdx = buildIndex(CaseStatusMaster, 'ROWID');
  const courtIdx = buildIndex(Court, 'ROWID');
  const unitIdx = buildIndex(Unit, 'ROWID');
  const employeeIdx = buildIndex(Employee, 'ROWID');
  const rankIdx = buildIndex(Rank, 'ROWID');
  const desigIdx = buildIndex(Designation, 'ROWID');
  const occupIdx = buildIndex(OccupationMaster, 'ROWID');
  const actIdx = buildIndex(Act, 'ROWID');
  const sectionIdx = buildMultiIndex(Section, 'ROWID');

  const accusedByCase = buildMultiIndex(Accused, 'CaseMasterID');
  const victimByCase = buildMultiIndex(Victim, 'CaseMasterID');
  const compByCase = buildMultiIndex(ComplainantDetails, 'CaseMasterID');
  const asaByCase = buildMultiIndex(ActSectionAssociation, 'CaseMasterID');
  const chargeByCase = buildMultiIndex(ChargesheetDetails, 'CaseMasterID');
  const arrestByCase = buildMultiIndex(ArrestSurrender, 'CaseMasterID');

  function resolveStation(caseRow) {
    const unitId = caseRow.PoliceStationID;
    if (!unitId) return null;
    return unitIdx[String(unitId)] || null;
  }

  function resolveDistrict(caseRow) {
    const unit = resolveStation(caseRow);
    if (!unit) return '';
    const dist = districtIdx[String(unit.DistrictID)];
    return dist ? dist.DistrictName : '';
  }

  function resolveStationName(caseRow) {
    const unit = resolveStation(caseRow);
    if (!unit) return '';
    const dist = districtIdx[String(unit.DistrictID)];
    const distName = dist ? dist.DistrictName : '';
    const name = unit.UnitName || '';
    return distName ? `${name}, ${distName}` : name;
  }

  function resolveCrimeType(caseRow) {
    const head = crimeHeadIdx[String(caseRow.CrimeMajorHeadID)];
    return head ? head.CrimeGroupName : '';
  }

  function resolveCrimeSubType(caseRow) {
    const subs = crimeSubHeadIdx[String(caseRow.CrimeMajorHeadID)] || [];
    const minorId = caseRow.CrimeMinorHeadID;
    if (minorId) {
      const match = subs.find(s => String(s.CrimeSubHeadID) === String(minorId));
      if (match) return match.CrimeHeadName;
    }
    return '';
  }

  function resolveCourt(caseRow) {
    const c = courtIdx[String(caseRow.CourtID)];
    return c ? c.CourtName : '';
  }

  function resolveCaseStatus(caseRow) {
    const s = caseStatusIdx[String(caseRow.CaseStatusID)];
    return s ? s.CaseStatusName : '';
  }

  function resolveEmployee(empId) {
    if (!empId) return '';
    const e = employeeIdx[String(empId)];
    if (!e) return '';
    const rank = rankIdx[String(e.RankID)];
    const desig = desigIdx[String(e.DesignationID)];
    const parts = [e.FirstName];
    if (rank) parts.push(rank.RankName);
    if (desig) parts.push(desig.DesignationName);
    return parts.join(', ');
  }

  function formatSection(caseRow) {
    const assocs = asaByCase[String(caseRow.ROWID)] || [];
    return assocs.map(a => {
      const act = actIdx[String(a.ActID)];
      const sections = sectionIdx[String(a.SectionID)] || [];
      const sec = sections[0];
      if (act && sec) return `${act.ShortName || act.ActDescription} ${sec.SectionCode}`;
      if (act) return `${act.ShortName || act.ActDescription}`;
      if (sec) return `Section ${sec.SectionCode}`;
      return '';
    }).filter(Boolean).join(', ');
  }

  const batchDocs = [];
  let batchIndex = 0;
  let casesInBatch = [];
  let caseIndex = 0;

  for (let i = 0; i < CaseMaster.length; i++) {
    const row = CaseMaster[i];
    caseIndex++;
    const caseId = String(row.ROWID);
    const district = resolveDistrict(row);
    const stationName = resolveStationName(row);
    const crimeType = resolveCrimeType(row);
    const crimeSubType = resolveCrimeSubType(row);
    const status = resolveCaseStatus(row);
    const court = resolveCourt(row);
    const ioName = resolveEmployee(row.PolicePersonID);

    const accusedList = accusedByCase[caseId] || [];
    const victimList = victimByCase[caseId] || [];
    const compList = compByCase[caseId] || [];
    const sections = formatSection(row);
    const charges = chargeByCase[caseId] || [];
    const arrests = arrestByCase[caseId] || [];

    const parts = [];
    parts.push(`=== CASE ${caseIndex} ===`);
    parts.push(`CaseMasterID: ${pretty(row.CaseMasterID)}`);
    parts.push(`CrimeNo: ${pretty(row.CrimeNo)}${row.CaseNo ? ` | CaseNo: ${row.CaseNo}` : ''}`);
    parts.push(`Station: ${stationName || pretty(row.PoliceStationID)}`);
    parts.push(`District: ${district || pretty(row.PoliceStationID)}`);
    parts.push(`Crime Type: ${crimeType || 'N/A'}${crimeSubType ? ` (${crimeSubType})` : ''}`);
    parts.push(`Status: ${status || pretty(row.CaseStatusID)}`);
    parts.push(`Court: ${court || pretty(row.CourtID)}`);
    parts.push(`Registered: ${pretty(row.CrimeRegisteredDate)} | Incident: ${pretty(row.IncidentFromDate)} to ${pretty(row.IncidentToDate)}`);
    if (ioName) parts.push(`IO: ${ioName}`);
    if (sections) parts.push(`Sections: ${sections}`);

    parts.push('');
    parts.push('BRIEF FACTS:');
    parts.push(pretty(row.BriefFacts));

    const persons = [];
    if (accusedList.length > 0) {
      accusedList.forEach(a => {
        persons.push(`  ACCUSED: ${a.AccusedName}, Age ${pretty(a.AgeYear)}, ${gender(a.GenderID)}`);
      });
    }
    if (victimList.length > 0) {
      victimList.forEach(v => {
        persons.push(`  VICTIM: ${v.VictimName}, Age ${pretty(v.AgeYear)}, ${gender(v.GenderID)}`);
      });
    }
    if (compList.length > 0) {
      compList.forEach(c => {
        const occ = occupIdx[String(c.OccupationID)];
        const occName = occ ? occ.OccupationName : '';
        const occPart = occName ? `, ${occName}` : '';
        persons.push(`  COMPLAINANT: ${c.ComplainantName}, Age ${pretty(c.AgeYear)}${occPart}`);
      });
    }
    if (persons.length > 0) {
      parts.push('');
      parts.push('PERSONS INVOLVED:');
      parts.push(persons.join('\n'));
    }

    const proceedings = [];
    charges.forEach(cs => {
      proceedings.push(`  CHARGESHEET: ${pretty(cs.cstype)}, ${pretty(cs.csdate)}`);
    });
    arrests.forEach(a => {
      const arrestingIO = resolveEmployee(a.IOID);
      proceedings.push(`  ARREST: ${pretty(a.ArrestSurrenderDate)}${arrestingIO ? `, arresting IO: ${arrestingIO}` : ''}`);
    });
    if (proceedings.length > 0) {
      parts.push('');
      parts.push('PROCEEDINGS:');
      parts.push(proceedings.join('\n'));
    }

    if (row.Latitude && row.Longitude && row.Latitude !== '0.000000' && row.Longitude !== '0.000000') {
      parts.push(`  Location: ${pretty(row.Latitude)}, ${pretty(row.Longitude)}`);
    }

    casesInBatch.push(parts.join('\n'));

    if (casesInBatch.length >= BATCH_SIZE || i === CaseMaster.length - 1) {
      batchIndex++;
      const startIdx = caseIndex - casesInBatch.length + 1;
      const endIdx = caseIndex;
      const header = `=== KSP CRIME DATABASE KNOWLEDGE BASE ===\n=== BATCH ${batchIndex} (Cases ${startIdx}-${endIdx}) ===\n\n`;
      const content = header + casesInBatch.join('\n===\n\n');
      const filePath = path.join(OUTPUT_DIR, `batch_${String(batchIndex).padStart(2, '0')}.txt`);
      fs.writeFileSync(filePath, content, 'utf8');
      log(`  Written: batch_${String(batchIndex).padStart(2, '0')}.txt (${casesInBatch.length} cases)`);
      batchDocs.push(filePath);
      casesInBatch = [];
    }
  }

  const lookupTables = [
    'State', 'District', 'CaseCategory', 'GravityOffence', 'CrimeHead',
    'Act', 'Section', 'CrimeSubHead', 'CrimeHeadActSection',
    'ReligionMaster', 'CasteMaster', 'OccupationMaster', 'CaseStatusMaster',
    'UnitType', 'Rank', 'Designation', 'Unit', 'Court', 'Employee',
  ];

  const lookupDir = path.join(OUTPUT_DIR, 'lookups');
  fs.mkdirSync(lookupDir, { recursive: true });

  for (const tableName of lookupTables) {
    const rows = allData[tableName] || [];
    if (rows.length === 0) continue;
    const lines = rows.map(r => {
      const vals = Object.entries(r)
        .filter(([k, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${k}: ${v}`);
      return `  ${vals.join(', ')}`;
    });
    const content = `=== KSP CRIME DATABASE LOOKUP ===\n=== ${tableName} (${rows.length} records) ===\n\n${lines.join('\n')}\n`;
    const filePath = path.join(lookupDir, `${tableName}.txt`);
    fs.writeFileSync(filePath, content, 'utf8');
    log(`  Written: lookups/${tableName}.txt (${rows.length} records)`);
  }

  log(`\nDone! ${batchIndex} batch files + ${lookupTables.length} lookup files in ${OUTPUT_DIR}`);
  log('Upload these files to Catalyst Console → Knowledge Base.');
}

function loadTable(tableName, jsonPath, csvPath) {
  if (fs.existsSync(jsonPath)) {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    if (!raw.trim()) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.rows && Array.isArray(parsed.rows)) return parsed.rows;
      if (Array.isArray(parsed)) return parsed;
      log(`  ${tableName}: JSON has unexpected structure`);
      return null;
    } catch {
      log(`  ${tableName}: JSON parse error`);
      return null;
    }
  }
  if (fs.existsSync(csvPath)) {
    const text = fs.readFileSync(csvPath, 'utf8');
    if (!text.trim()) return null;
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = parseCSVLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = parseCSVLine(lines[i]);
      if (vals.length > 0) {
        const row = {};
        for (let idx = 0; idx < headers.length && idx < vals.length; idx++) {
          row[headers[idx]] = vals[idx];
        }
        rows.push(row);
      }
    }
    return rows;
  }
  return null;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function main() {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });

  const loaded = [];
  const missing = [];

  for (const t of TABLES) {
    const jsonPath = path.join(EXPORT_DIR, `${t.name}.json`);
    const csvPath = path.join(EXPORT_DIR, `${t.name}.csv`);
    const rows = loadTable(t.name, jsonPath, csvPath);
    if (rows !== null) {
      loaded.push({ table: t.name, rows });
    } else {
      missing.push(t.name);
    }
  }

  if (loaded.length === 0) {
    console.log();
    console.log('=== No data files found ===');
    console.log();
    console.log('Place either JSON or CSV files in: data_pipeline\\kb_export\\');
    console.log();
    console.log('JSON format (preferred):');
    console.log('  Create {TableName}.json with:');
    console.log('  { "table": "CrimeHead", "columns": [...], "rows": [ {...}, {...} ] }');
    console.log();
    console.log('CSV format:');
    console.log('  Create {TableName}.csv with header row + data rows');
    console.log();
    console.log('26 JSON template files already exist in kb_export/ with empty rows arrays.');
    console.log('Paste your data into the "rows" arrays, then run this script again.');
    return;
  }

  log(`Loaded ${loaded.length}/${TABLES.length} tables:`);
  for (const l of loaded) {
    log(`  ${l.table}: ${l.rows.length} records`);
  }

  if (missing.length > 0) {
    log(`\nMissing (skipped): ${missing.join(', ')}`);
  }

  const allData = {};
  for (const l of loaded) {
    allData[l.table] = l.rows;
  }

  log('\n=== Generating Knowledge Base documents ===\n');
  generateDocuments(allData);
}

main();
