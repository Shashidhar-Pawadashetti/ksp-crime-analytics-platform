const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const DATA = path.join(BASE, 'data');
const MAPPINGS = path.join(BASE, 'mappings');

function loadJSON(name) {
  return JSON.parse(fs.readFileSync(path.join(MAPPINGS, name + '.json'), 'utf-8'));
}
function loadCSV(name) {
  return fs.readFileSync(path.join(DATA, name + '.csv'), 'utf-8').trim().split('\n');
}
function parseLine(line) {
  const res = []; let cur = '', inq = false;
  for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') inq = !inq; else if (ch === ',' && !inq) { res.push(cur); cur = ''; } else cur += ch; }
  res.push(cur); return res;
}

function revMap(m) { const r = {}; for (const [k, v] of Object.entries(m)) r[v] = parseInt(k); return r; }

// Load mapping files
const caseMasterMap = loadJSON('caseMaster');
const accusedMap = loadJSON('accused');
const stateMap = loadJSON('state');
const districtMap = loadJSON('district');
const unitMap = loadJSON('unit');
const employeeMap = loadJSON('employee');
const courtMap = loadJSON('court');

const KARNATAKA_STATE_ROWID = stateMap['1'];

const caseMasterRev = revMap(caseMasterMap);
const unitRev = revMap(unitMap);

// Load CaseMaster CSV
const cmLines = loadCSV('CaseMaster');
const cmH = parseLine(cmLines[0]);
const cmI = {}; cmH.forEach((n, i) => cmI[n] = i);

const caseData = {};
for (let i = 1; i < cmLines.length; i++) {
  const c = parseLine(cmLines[i]);
  const bizId = parseInt(c[cmI.CaseMasterID]);
  caseData[bizId] = {
    regDate: c[cmI.CrimeRegisteredDate],
    stationROWID: c[cmI.PoliceStationID],
    personROWID: c[cmI.PolicePersonID],
    courtROWID: c[cmI.CourtID],
  };
}

// Load Unit CSV to build Unit ROWID -> District ROWID lookup
const unitLines = loadCSV('Unit');
const unitH = parseLine(unitLines[0]);
const unitI = {}; unitH.forEach((n, i) => unitI[n] = i);

const unitDistrictMap = {};
for (let i = 1; i < unitLines.length; i++) {
  const c = parseLine(unitLines[i]);
  const bizId = parseInt(c[unitI.UnitID]);
  const unitROWID = unitMap[bizId.toString()];
  if (unitROWID) {
    unitDistrictMap[unitROWID] = c[unitI.DistrictID];
  }
}

// Load Court CSV to build Court ROWID -> District ROWID lookup
const courtLines = loadCSV('Court');
const courtH = parseLine(courtLines[0]);
const courtI = {}; courtH.forEach((n, i) => courtI[n] = i);
const courtDistrictMap = {};
for (let i = 1; i < courtLines.length; i++) {
  const c = parseLine(courtLines[i]);
  const bizId = parseInt(c[courtI.CourtID]);
  const courtROWID = courtMap[bizId.toString()];
  if (courtROWID) {
    courtDistrictMap[courtROWID] = c[courtI.DistrictID];
  }
}

// Load Accused CSV
const accLines = loadCSV('Accused');
const accH = parseLine(accLines[0]);
const accI = {}; accH.forEach((n, i) => accI[n] = i);

function seededRandom(seed) {
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
const RNG = seededRandom(20260706);
function randomInt(min, max) { return min + Math.floor(RNG() * (max - min + 1)); }

function formatDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function addDays(date, days) {
  const r = new Date(date); r.setDate(r.getDate() + days); return r;
}

const records = [];
let arrestSurrenderId = 0;

const validAccusedROWIDs = new Set(Object.values(accusedMap));
const validCaseMasterROWIDs = new Set(Object.values(caseMasterMap));
const validEmployeeROWIDs = new Set(Object.values(employeeMap));
const validCourtROWIDs = new Set(Object.values(courtMap));
const validUnitROWIDs = new Set(Object.values(unitMap));
const validDistrictROWIDs = new Set(Object.values(districtMap));
const validStateROWIDs = new Set(Object.values(stateMap));

let skippedNoCase = 0;
let skippedMissingStation = 0;

for (let i = 1; i < accLines.length; i++) {
  const c = parseLine(accLines[i]);
  const accusedBizId = parseInt(c[accI.AccusedMasterID]);
  const caseMasterROWID = c[accI.CaseMasterID];

  const accusedROWID = accusedMap[accusedBizId.toString()];
  if (!accusedROWID) continue;

  const cmBizId = caseMasterRev[caseMasterROWID];
  if (!cmBizId) { skippedNoCase++; continue; }

  const cdata = caseData[cmBizId];
  if (!cdata) { skippedNoCase++; continue; }

  // ~35% chance of an arrest/surrender record per accused
  if (RNG() > 0.35) continue;

  arrestSurrenderId++;

  const isArrest = RNG() < 0.65;
  const typeId = isArrest ? 1 : 2;

  const regDate = new Date(cdata.regDate);
  let arrestDate;
  if (isArrest) {
    arrestDate = addDays(regDate, randomInt(0, 7));
  } else {
    arrestDate = addDays(regDate, randomInt(1, 90));
  }

  // Determine district from the case's police station (unit)
  let districtROWID = unitDistrictMap[cdata.stationROWID];
  if (!districtROWID) {
    // Fallback: try the court's district
    districtROWID = courtDistrictMap[cdata.courtROWID];
  }
  if (!districtROWID) {
    // Last resort: pick a random district ROWID
    districtROWID = pick(Array.from(validDistrictROWIDs));
  }

  records.push({
    ArrestSurrenderID: arrestSurrenderId,
    CaseMasterID: caseMasterROWID,
    ArrestSurrenderTypeID: typeId,
    ArrestSurrenderDate: formatDate(arrestDate),
    ArrestSurrenderStateId: KARNATAKA_STATE_ROWID,
    ArrestSurrenderDistrictId: districtROWID,
    PoliceStationID: cdata.stationROWID,
    IOID: cdata.personROWID,
    CourtID: cdata.courtROWID,
    AccusedMasterID: accusedROWID,
    IsAccused: 'TRUE',
    IsComplainantAccused: RNG() < 0.03 ? 'TRUE' : 'FALSE',
  });
}

function pick(arr) { return arr[Math.floor(RNG() * arr.length)]; }

console.log('Generated ' + records.length + ' arrest/surrender records');

// Validation
console.log('\n=== VALIDATION ===');

const dedupCheck = new Set();
let dupCount = 0;
for (const rec of records) {
  if (dedupCheck.has(rec.ArrestSurrenderID)) {
    console.log('DUPLICATE ArrestSurrenderID: ' + rec.ArrestSurrenderID);
    dupCount++;
  }
  dedupCheck.add(rec.ArrestSurrenderID);
}
if (dupCount === 0) console.log('ArrestSurrenderID: ALL UNIQUE');
else { console.log('ArrestSurrenderID: ' + dupCount + ' duplicates - ABORTING'); process.exit(1); }

const fkChecks = [
  { col: 'CaseMasterID', set: validCaseMasterROWIDs, label: 'CaseMasterID' },
  { col: 'ArrestSurrenderStateId', set: validStateROWIDs, label: 'StateID' },
  { col: 'ArrestSurrenderDistrictId', set: validDistrictROWIDs, label: 'DistrictID' },
  { col: 'PoliceStationID', set: validUnitROWIDs, label: 'PoliceStationID (Unit)' },
  { col: 'IOID', set: validEmployeeROWIDs, label: 'IOID (Employee)' },
  { col: 'CourtID', set: validCourtROWIDs, label: 'CourtID' },
  { col: 'AccusedMasterID', set: validAccusedROWIDs, label: 'AccusedMasterID' },
];

let totalErrors = 0;
for (const check of fkChecks) {
  let errs = 0;
  for (const rec of records) {
    const val = rec[check.col];
    if (!val || val === '') {
      errs++; if (errs <= 3) console.log('  NULL ' + check.label);
    } else if (!check.set.has(val)) {
      errs++; if (errs <= 3) console.log('  INVALID ' + check.label + ': ' + val);
    }
  }
  if (errs === 0) console.log('  ' + check.label + ': ALL VALID');
  else { console.log('  ' + check.label + ': ' + errs + ' errors'); totalErrors += errs; }
}

if (totalErrors > 0) { console.log('VALIDATION FAILED with ' + totalErrors + ' errors - ABORTING'); process.exit(1); }

console.log('VALIDATION PASSED');

// Validate ArrestSurrenderDate >= CrimeRegisteredDate
let dateErr = 0;
const caseMasterROWIDSet = new Set(Object.entries(caseMasterMap).map(([k, v]) => v));
for (const rec of records) {
  const cmBizId2 = caseMasterRev[rec.CaseMasterID];
  if (cmBizId2 && caseData[cmBizId2]) {
    const reg = new Date(caseData[cmBizId2].regDate);
    const asDate = new Date(rec.ArrestSurrenderDate);
    if (asDate < reg) { dateErr++; if (dateErr <= 3) console.log('  ArrestSurrenderDate before CrimeRegisteredDate for record ' + rec.ArrestSurrenderID); }
  }
}
if (dateErr === 0) console.log('ArrestSurrenderDate: ALL AFTER CrimeRegisteredDate');
else { console.log('ArrestSurrenderDate: ' + dateErr + ' before registration - ABORTING'); process.exit(1); }

// Write CSV
const columns = ['ArrestSurrenderID', 'CaseMasterID', 'ArrestSurrenderTypeID', 'ArrestSurrenderDate',
  'ArrestSurrenderStateId', 'ArrestSurrenderDistrictId', 'PoliceStationID', 'IOID', 'CourtID',
  'AccusedMasterID', 'IsAccused', 'IsComplainantAccused'];

const lines = [columns.join(',')];
for (const rec of records) {
  const line = columns.map(col => {
    const val = rec[col];
    if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
      return '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  }).join(',');
  lines.push(line);
}
fs.writeFileSync(path.join(DATA, 'ArrestSurrender.csv'), lines.join('\n'), 'utf-8');
console.log('\nWritten ' + records.length + ' records -> data/ArrestSurrender.csv');
