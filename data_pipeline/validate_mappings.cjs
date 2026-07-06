const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const MAPPINGS = path.join(BASE, 'mappings');

function loadJSON(name) {
  return JSON.parse(fs.readFileSync(path.join(MAPPINGS, name + '.json'), 'utf-8'));
}

const maps = {
  employee: loadJSON('employee'),
  unit: loadJSON('unit'),
  court: loadJSON('court'),
  caseCategory: loadJSON('caseCategory'),
  gravityOffence: loadJSON('gravityOffence'),
  crimeHead: loadJSON('crimeHead'),
  crimeSubHead: loadJSON('crimeSubHead'),
  caseStatus: loadJSON('caseStatus'),
};

const valid = {};
for (const [k, v] of Object.entries(maps)) {
  valid[k] = {};
  for (const [id, rowid] of Object.entries(v)) {
    valid[k][rowid] = parseInt(id);
  }
}

function parseLine(line) {
  const res = [];
  let cur = '', inq = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inq = !inq; }
    else if (ch === ',' && !inq) { res.push(cur); cur = ''; }
    else cur += ch;
  }
  res.push(cur);
  return res;
}

const csv = fs.readFileSync(path.join(BASE, 'data', 'CaseMaster.csv'), 'utf-8').trim().split('\n');
const h = parseLine(csv[0]);
const ci = {};
h.forEach((n, i) => ci[n] = i);

const colMap = {
  PolicePersonID: 'employee',
  PoliceStationID: 'unit',
  CaseCategoryID: 'caseCategory',
  GravityOffenceID: 'gravityOffence',
  CrimeMajorHeadID: 'crimeHead',
  CrimeMinorHeadID: 'crimeSubHead',
  CaseStatusID: 'caseStatus',
  CourtID: 'court',
};

console.log('=== MAPPING VERIFICATION ===');
console.log('Total records:', csv.length - 1);
console.log('');

let errs = 0;
const colErrs = {};
for (const col of Object.keys(colMap)) colErrs[col] = 0;

for (let i = 1; i < csv.length; i++) {
  const c = parseLine(csv[i]);
  const cid = c[ci.CaseMasterID];
  for (const [col, mname] of Object.entries(colMap)) {
    const val = c[ci[col]];
    if (!valid[mname][val]) {
      console.log('  ERROR CaseMasterID=' + cid + ': ' + col + '=' + val + ' not found in ' + mname + '.json');
      errs++;
      colErrs[col]++;
    }
  }
}

console.log('');
if (errs === 0) {
  console.log('RESULT: ALL FOREIGN KEY ROWIDs ARE CORRECTLY MAPPED. PASS');
} else {
  console.log('RESULT: ' + errs + ' errors found');
  for (const [col, count] of Object.entries(colErrs)) {
    if (count > 0) console.log('  ' + col + ': ' + count + ' errors');
  }
}

console.log('');
console.log('=== CROSS-REFERENCE CHECKS ===');

const unitMap = maps.unit;
const empMap = maps.employee;

const unitNames = {};
const empLines = fs.readFileSync(path.join(BASE, 'data', 'Employee.csv'), 'utf-8').trim().split('\n');
const empH = parseLine(empLines[0]);
const empI = {}; empH.forEach((n, i) => empI[n] = i);
const empByUnit = {};
for (let i = 1; i < empLines.length; i++) {
  const cols = parseLine(empLines[i]);
  const empRowID = empMap[cols[empI.EmployeeID]];
  if (empRowID) {
    const unitRowID = cols[empI.UnitID];
    if (!empByUnit[unitRowID]) empByUnit[unitRowID] = [];
    empByUnit[unitRowID].push(empRowID);
  }
}

let relOk = 0, relBad = 0;
for (let i = 1; i < csv.length; i++) {
  const c = parseLine(csv[i]);
  const station = c[ci.PoliceStationID];
  const person = c[ci.PolicePersonID];
  if (empByUnit[station] && empByUnit[station].includes(person)) {
    relOk++;
  } else {
    relBad++;
    if (relBad <= 3) {
      console.log('  RELATIONSHIP MISMATCH: CaseMasterID=' + c[ci.CaseMasterID] +
        ', Station=' + station + ' (biz#' + valid.unit[station] + ')' +
        ', Employee=' + person + ' (biz#' + valid.employee[person] + ')' +
        ' - Employee not posted at this station');
    }
  }
}
console.log('Station-Employee relationship matches: ' + relOk + '/' + (relOk + relBad));
if (relBad === 0) console.log('  PASS: All employees belong to their assigned stations');
