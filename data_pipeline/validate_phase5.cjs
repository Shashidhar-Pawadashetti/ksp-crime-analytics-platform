const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const DATA = path.join(BASE, 'data');
const MAPPINGS = path.join(BASE, 'mappings');

function loadJSON(n) { return JSON.parse(fs.readFileSync(path.join(MAPPINGS, n + '.json'), 'utf-8')); }
function loadCSV(n) { return fs.readFileSync(path.join(DATA, n + '.csv'), 'utf-8').trim().split('\n'); }
function parseLine(l) { const r = []; let c = '', q = false; for (let i = 0; i < l.length; i++) { const h = l[i]; if (h === '"') q = !q; else if (h === ',' && !q) { r.push(c); c = ''; } else c += h; } r.push(c); return r; }

const caseMasterCSV = loadCSV('CaseMaster');
const cmH = parseLine(caseMasterCSV[0]);
const cmI = {}; cmH.forEach((n, i) => cmI[n] = i);
const cmIDs = new Set();
for (let i = 1; i < caseMasterCSV.length; i++) {
  const c = parseLine(caseMasterCSV[i]);
  cmIDs.add(c[cmI.CaseMasterID]);
}
console.log('CaseMaster ROWIDs in use: ' + cmIDs.size);

const caseMasterMap = loadJSON('caseMaster');
const validCM = new Set(Object.values(caseMasterMap));
const validEmployee = new Set(Object.values(loadJSON('employee')));
const validCourt = new Set(Object.values(loadJSON('court')));
const validAct = new Set(Object.values(loadJSON('act')));
const validSection = new Set(Object.values(loadJSON('section')));
const validOccupation = new Set(Object.values(loadJSON('occupation')));
const validReligion = new Set(Object.values(loadJSON('religion')));
const validCaste = new Set(Object.values(loadJSON('caste')));

const validEmpBiz = new Set(Object.keys(loadJSON('employee')).map(Number));

const tables = {
  'ComplainantDetails': {
    file: loadCSV('ComplainantDetails'),
    checks: [
      { col: 'CaseMasterID', set: validCM, label: 'CaseMasterID' },
      { col: 'OccupationID', set: validOccupation, label: 'OccupationID' },
      { col: 'ReligionID', set: validReligion, label: 'ReligionID' },
      { col: 'CasteID', set: validCaste, label: 'CasteID' },
    ]
  },
  'Victim': {
    file: loadCSV('Victim'),
    checks: [
      { col: 'CaseMasterID', set: validCM, label: 'CaseMasterID' },
    ]
  },
  'Accused': {
    file: loadCSV('Accused'),
    checks: [
      { col: 'CaseMasterID', set: validCM, label: 'CaseMasterID' },
    ]
  },
  'ActSectionAssociation': {
    file: loadCSV('ActSectionAssociation'),
    checks: [
      { col: 'CaseMasterID', set: validCM, label: 'CaseMasterID' },
      { col: 'ActID', set: validAct, label: 'ActID' },
      { col: 'SectionID', set: validSection, label: 'SectionID' },
    ]
  },
  'ChargesheetDetails': {
    file: loadCSV('ChargesheetDetails'),
    checks: [
      { col: 'CaseMasterID', set: validCM, label: 'CaseMasterID' },
      { col: 'PolicePersonID', set: validEmployee, label: 'PolicePersonID' },
    ]
  },
};

for (const [tname, tinfo] of Object.entries(tables)) {
  const lines = tinfo.file;
  const h = parseLine(lines[0]);
  const ci = {}; h.forEach((n, i) => ci[n] = i);
  console.log('\n=== ' + tname + ' ===');
  console.log('Records: ' + (lines.length - 1));

  let totalErr = 0;
  for (const check of tinfo.checks) {
    let errs = 0;
    for (let i = 1; i < lines.length; i++) {
      const c = parseLine(lines[i]);
      const val = c[ci[check.col]];
      if (!check.set.has(val)) {
        errs++;
        if (errs <= 3) console.log('  ERROR: ' + check.label + '=' + val + ' not found in mapping (row ' + i + ')');
      }
    }
    if (errs === 0) console.log('  ' + check.label + ': ALL VALID');
    else console.log('  ' + check.label + ': ' + errs + ' errors');
    totalErr += errs;
  }

  if (tname === 'ChargesheetDetails') {
    const csColIdx = ci['csdate'] !== undefined ? ci['csdate'] : -1;
    const cmIdIdx = ci['CaseMasterID'] !== undefined ? ci['CaseMasterID'] : -1;
    let dateErr = 0;
    for (let i = 1; i < lines.length; i++) {
      const c = parseLine(lines[i]);
      const csDate = csColIdx >= 0 && c[csColIdx] ? new Date(c[csColIdx]) : null;
      const caseId = cmIdIdx >= 0 ? c[cmIdIdx] : null;
      if (!csDate || !caseId) { dateErr++; continue; }
      for (let j = 1; j < caseMasterCSV.length; j++) {
        const cm = parseLine(caseMasterCSV[j]);
        if (cm[cmI.CaseMasterID] === caseId) {
          const regDate = new Date(cm[cmI.CrimeRegisteredDate]);
          if (csDate < regDate) { dateErr++; }
          break;
        }
      }
    }
    if (dateErr === 0) console.log('  ChargesheetDate: ALL AFTER CrimeRegisteredDate');
    else console.log('  ChargesheetDate: ' + dateErr + ' before registration');
  }

  if (totalErr === 0) console.log('  => PASS');
  else console.log('  => FAILED with ' + totalErr + ' errors');
}

console.log('\n=== ACCUSED HABITUAL CHECK ===');
const accLines = loadCSV('Accused');
const accH = parseLine(accLines[0]);
const accI = {}; accH.forEach((n, i) => accI[n] = i);
const names = {};
for (let i = 1; i < accLines.length; i++) {
  const c = parseLine(accLines[i]);
  const name = c[accI.AccusedName];
  names[name] = (names[name] || 0) + 1;
}
const recurring = Object.entries(names).filter(([n, c]) => c > 1);
console.log('Total accused: ' + (accLines.length - 1));
console.log('Unique names: ' + Object.keys(names).length);
console.log('Recurring names (appear 2+ times): ' + recurring.length);
console.log('Recurring name occurrences: ' + recurring.reduce((s, [n, c]) => s + c, 0));
