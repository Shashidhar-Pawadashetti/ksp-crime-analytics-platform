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

const caseMasterMap = loadJSON('caseMaster');
const employeeMap = loadJSON('employee');
const unitMap = loadJSON('unit');
const courtMap = loadJSON('court');
const occupationMap = loadJSON('occupation');
const religionMap = loadJSON('religion');
const casteMap = loadJSON('caste');
const sectionMap = loadJSON('section');
const actMap = loadJSON('act');
const crimeHeadMap = loadJSON('crimeHead');
const crimeSubHeadMap = loadJSON('crimeSubHead');
const caseStatusMasterMap = loadJSON('caseStatus');
const caseCategoryMasterMap = loadJSON('caseCategory');

function intMap(m) { const r = {}; for (const [k, v] of Object.entries(m)) r[parseInt(k)] = v; return r; }
function revMap(m) { const r = {}; for (const [k, v] of Object.entries(m)) r[v] = parseInt(k); return r; }

const caseMasterROWID = intMap(caseMasterMap);
const employeeROWID = intMap(employeeMap);
const courtROWID = intMap(courtMap);
const revCrimeHead = revMap(crimeHeadMap);
const revCaseStatus = revMap(caseStatusMasterMap);
const revCaseCategory = revMap(caseCategoryMasterMap);

const caseLines = loadCSV('CaseMaster');
const cH = parseLine(caseLines[0]);
const cI = {}; cH.forEach((n, i) => cI[n] = i);

const cases = [];
for (let i = 1; i < caseLines.length; i++) {
  const c = parseLine(caseLines[i]);
  const cmBizID = parseInt(c[cI.CaseMasterID]);
  cases.push({
    id: cmBizID,
    rowid: caseMasterROWID[cmBizID],
    headId: revCrimeHead[c[cI.CrimeMajorHeadID]] || 1,
    statusId: revCaseStatus[c[cI.CaseStatusID]] || 1,
    categoryId: c[cI.CaseCategoryID],
    regDate: c[cI.CrimeRegisteredDate],
    station: c[cI.PoliceStationID],
    person: c[cI.PolicePersonID],
    court: c[cI.CourtID],
  });
}

console.log('Loaded ' + cases.length + ' cases');

function seededRandom(seed) {
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
const RNG = seededRandom(20260703);
function randomInt(min, max) { return min + Math.floor(RNG() * (max - min + 1)); }
function pick(arr) { return arr[Math.floor(RNG() * arr.length)]; }

const maleFirst = ['Aarav','Vihaan','Vivaan','Ansh','Reyansh','Shaurya','Ayaan','Krishna','Ishaan','Arjun','Rudra','Pranav','Dhruv','Rohan','Siddharth','Yash','Amit','Rahul','Rajesh','Sanjay','Vijay','Deepak','Suresh','Mohan','Ravi','Kiran','Mahesh','Manjunath','Chandrashekar','Basavaraj','Siddalinga','Mallikarjun','Gururaj','Yadunandan','Shankar','Prakash','Venkatesh','Nagaraj','Naveen','Harish','Manish','Vinay','Akash','Pavan','Bheemesh','Hemanth','Jagadish','Eashwar','Satish','Ramachandra','Narasimha'];
const femaleFirst = ['Aanya','Diya','Ishita','Myra','Saanvi','Neha','Kavya','Priya','Riya','Aditi','Pooja','Nandini','Lakshmi','Bhagya','Shwetha','Usha','Asha','Radha','Sita','Geeta','Uma','Kaveri','Mala','Roopa','Shobha','Padma','Hema','Revathi','Pallavi','Madhuri','Kavitha','Rani','Lalitha','Nalini','Sharada','Indira','Gowri','Savitri','Deepika','Chandrika','Yamuna','Tara'];
const lastNames = ['Patil','Deshmukh','Kulkarni','Joshi','Shinde','More','Pawar','Jadhav','Mahajan','Ghorpade','Hegde','Shetty','Rao','Nayak','Naik','Kamat','Acharya','Bhat','Mallya','Murthy','Aiyappa','Gowda','Reddy','Kumar','Singh','Verma','Sharma','Gupta','Das','Nair','Menon','Pillai','Iyer','Iyengar','Chowdhury','Banerjee','Mukherjee','Sarkar','Bose','Sen','Ganguly','Bhatt','Trivedi','Mehta','Shah','Thakur','Yadav','Chauhan','Rajput'];

const occIds = Object.keys(occupationMap).map(Number);
const relIds = Object.keys(religionMap).map(Number);
const casIds = Object.keys(casteMap).map(Number);

function generateName() {
  const gender = RNG() > 0.5 ? 'M' : 'F';
  const first = gender === 'M' ? pick(maleFirst) : pick(femaleFirst);
  return { name: first + ' ' + pick(lastNames), gender: gender === 'M' ? '1' : '2' };
}

function generateNameWithGender(gender) {
  const first = gender === '1' ? pick(maleFirst) : pick(femaleFirst);
  return first + ' ' + pick(lastNames);
}

function formatDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function addDays(date, days) {
  const r = new Date(date); r.setDate(r.getDate() + days); return r;
}

function writeCSV(filename, columns, records) {
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
  fs.writeFileSync(path.join(DATA, filename), lines.join('\n'), 'utf-8');
  console.log('Generated ' + (records.length) + ' records -> ' + filename);
}

const columns = {
  complainant: ['ComplainantID','CaseMasterID','ComplainantName','AgeYear','OccupationID','ReligionID','CasteID','GenderID'],
  victim: ['VictimMasterID','CaseMasterID','VictimName','AgeYear','GenderID','VictimPolice'],
  accused: ['AccusedMasterID','CaseMasterID','AccusedName','AgeYear','GenderID','PersonID'],
  actSection: ['CaseMasterID','ActID','SectionID','ActOrderID','SectionOrderID'],
  chargesheet: ['CSID','CaseMasterID','csdate','cstype','PolicePersonID'],
};

const crimeHeadActMap = {
  1:  { acts: [['IPC','302']] },
  2:  { acts: [] },
  3:  { acts: [] },
  4:  { acts: [['IEA','24']] },
  5:  { acts: [] },
  6:  { acts: [] },
  7:  { acts: [] },
  8:  { acts: [] },
  9:  { acts: [] },
  10: { acts: [] },
  11: { acts: [] },
  12: { acts: [] },
  13: { acts: [['IPC','489A']] },
  14: { acts: [] },
  15: { acts: [] },
  16: { acts: [] },
  17: { acts: [] },
  18: { acts: [] },
  19: { acts: [['IPC','498A']] },
  20: { acts: [['ITACT','43'],['ITACT','66']] },
};

const proceduralSections = ['154','155','157','161','164','167','173'];

const complainantRecords = [];
const victimRecords = [];
const accusedRecords = [];
const actSectionRecords = [];
const chargesheetRecords = [];

for (let ci = 0; ci < cases.length; ci++) {
  const ca = cases[ci];
  const cmRowID = ca.rowid;

  const gen = generateName();
  complainantRecords.push({
    ComplainantID: ci + 1,
    CaseMasterID: cmRowID,
    ComplainantName: gen.name,
    AgeYear: randomInt(20, 65),
    OccupationID: occupationMap[String(pick(occIds))],
    ReligionID: religionMap[String(pick(relIds))],
    CasteID: casteMap[String(pick(casIds))],
    GenderID: gen.gender,
  });

  const headId = ca.headId;
  const violentCrimes = [1, 2, 3, 4, 5, 18, 19];
  const propertyCrimes = [6, 7, 8, 9, 14, 17];
  const financialCrimes = [11, 12, 13, 16];
  const isViolent = violentCrimes.includes(headId);
  const isProperty = propertyCrimes.includes(headId);
  const isFinancial = financialCrimes.includes(headId);

  let victimCount = 0;
  if (isViolent) victimCount = RNG() < 0.15 ? 0 : (RNG() < 0.4 ? 1 : (RNG() < 0.7 ? 2 : (RNG() < 0.9 ? 3 : randomInt(4, 6))));
  else if (isProperty) victimCount = RNG() < 0.5 ? 0 : (RNG() < 0.7 ? 1 : (RNG() < 0.85 ? 2 : 3));
  else if (isFinancial) victimCount = RNG() < 0.3 ? 0 : (RNG() < 0.7 ? 1 : (RNG() < 0.9 ? 2 : 3));
  else victimCount = RNG() < 0.4 ? 0 : (RNG() < 0.65 ? 1 : (RNG() < 0.85 ? 2 : 3));

  for (let v = 0; v < victimCount; v++) {
    const vg = generateName();
    const isPolice = RNG() < 0.05 ? '1' : '0';
    victimRecords.push({
      VictimMasterID: victimRecords.length + 1,
      CaseMasterID: cmRowID,
      VictimName: vg.name,
      AgeYear: randomInt(5, 85),
      GenderID: vg.gender,
      VictimPolice: isPolice,
    });
  }
}

const habitualPool = [];
const poolSize = Math.floor(6000 * 0.12);
for (let i = 0; i < poolSize; i++) {
  const gen = generateName();
  habitualPool.push({ baseName: gen.name, gender: gen.gender, variations: [] });
}

const nameVariations = {
  'a':['aa','ah'],'i':['ii','y'],'e':['ee','ie'],'o':['oo','oh'],'u':['uu'],
  'sh':['shh','sch'],'k':['kh','ck'],'t':['tt','th'],'p':['pp','ph'],'m':['mm'],
};

function createVariation(name) {
  const parts = name.split(' ');
  const varied = parts.map(part => {
    if (part.length < 4) return part;
    const idx = Math.floor(RNG() * part.length);
    const char = part[idx].toLowerCase();
    const subs = nameVariations[char] || nameVariations[Object.keys(nameVariations)[Math.floor(RNG() * Object.keys(nameVariations).length)]];
    if (RNG() < 0.5) return part;
    const sub = pick(subs);
    return part.slice(0, idx) + sub + part.slice(idx + 1);
  });
  return varied.join(' ');
}

for (const profile of habitualPool) {
  const numVariations = randomInt(1, 3);
  for (let v = 0; v < numVariations; v++) {
    profile.variations.push(createVariation(profile.baseName));
  }
}

let habitualAssignments = [];
let currentPoolIndex = 0;
let totalAccusedTarget = 5000;

let accusedIdCounter = 0;
const maxHabitualAssignmentPerCase = 2;
let habitualCycleIndex = 0;
let poolAssignCount = Array(habitualPool.length).fill(0);
let maxPoolUses = Math.ceil(poolSize * 4);

for (let ci = 0; ci < cases.length; ci++) {
  const ca = cases[ci];
  const cmRowID = ca.rowid;
  const headId = ca.headId;

  const violentCrimes = [1, 2, 3, 4, 5, 18, 19];
  const isViolent = violentCrimes.includes(headId);

  let accusedCount = 0;
  if (isViolent) accusedCount = RNG() < 0.08 ? 0 : (RNG() < 0.3 ? 1 : (RNG() < 0.55 ? 2 : (RNG() < 0.75 ? 3 : (RNG() < 0.9 ? randomInt(4, 5) : randomInt(6, 8)))));
  else accusedCount = RNG() < 0.12 ? 0 : (RNG() < 0.4 ? 1 : (RNG() < 0.65 ? 2 : (RNG() < 0.85 ? 3 : randomInt(4, 6))));

  let habitualInThisCase = 0;
  for (let a = 0; a < accusedCount; a++) {
    accusedIdCounter++;
    const currentId = accusedIdCounter;
    const useHabitual = (RNG() < 0.12 && habitualInThisCase < maxHabitualAssignmentPerCase && maxPoolAssignmentsLeft() > 0);

    let name, gender;
    if (useHabitual) {
      habitualInThisCase++;
      const poolIdx = findLeastUsedPoolEntry();
      poolAssignCount[poolIdx]++;
      const profile = habitualPool[poolIdx];
      const useBase = RNG() < 0.4;
      name = useBase ? profile.baseName : pick(profile.variations);
      gender = profile.gender;
      habitualAssignments.push({ accusedId: currentId, poolIdx: poolIdx });
    } else {
      const gen = generateName();
      name = gen.name;
      gender = gen.gender;
    }

    accusedRecords.push({
      AccusedMasterID: currentId,
      CaseMasterID: cmRowID,
      AccusedName: name,
      AgeYear: randomInt(18, 65),
      GenderID: gender,
      PersonID: 'A' + (a + 1),
    });
  }
}

const dedupCheck = new Set();
for (const rec of accusedRecords) {
  if (dedupCheck.has(rec.AccusedMasterID)) {
    throw new Error('DUPLICATE AccusedMasterID: ' + rec.AccusedMasterID);
  }
  dedupCheck.add(rec.AccusedMasterID);
}
console.log('AccusedMasterID uniqueness verified: ' + dedupCheck.size + ' unique IDs');

function maxPoolAssignmentsLeft() {
  return poolAssignCount.reduce((max, count) => max + (count < maxPoolUses ? 1 : 0), 0);
}

function findLeastUsedPoolEntry() {
  let minIdx = 0, minVal = Infinity;
  for (let i = 0; i < poolAssignCount.length; i++) {
    if (poolAssignCount[i] < minVal && poolAssignCount[i] < maxPoolUses) {
      minVal = poolAssignCount[i];
      minIdx = i;
    }
  }
  return minIdx;
}

let habitualPercentage = (habitualAssignments.length / accusedRecords.length * 100);
console.log('Accused records: ' + accusedRecords.length + ', habitual: ' + habitualAssignments.length + ' (' + habitualPercentage.toFixed(1) + '%)');

const crimeHeadSectionMapping = {};
for (let headId = 1; headId <= 20; headId++) {
  const mapped = crimeHeadActMap[headId];
  crimeHeadSectionMapping[headId] = mapped.acts.filter(([act, sec]) => sectionMap[sec]).map(([act, sec]) => ({ actCode: act, sectionCode: sec }));
}

const actKeys = Object.keys(actMap);

for (let ci = 0; ci < cases.length; ci++) {
  const ca = cases[ci];
  const cmRowID = ca.rowid;
  const headId = ca.headId;
  const catId = ca.statusId;

  const caseSections = [];

  const substantiveSections = crimeHeadSectionMapping[headId] || [];
  for (const ss of substantiveSections) {
    caseSections.push({ actCode: ss.actCode, sectionCode: ss.sectionCode });
  }

  const catBizID = revCaseCategory[ca.categoryId] || 1;
  const isCognizable = [1, 3, 4, 5].includes(catBizID);
  const crpcSection = isCognizable ? '154' : '155';
  if (RNG() < 0.9) caseSections.push({ actCode: 'CRPC', sectionCode: crpcSection });

  if (RNG() < 0.7) caseSections.push({ actCode: 'CRPC', sectionCode: '157' });
  if (RNG() < 0.8) caseSections.push({ actCode: 'CRPC', sectionCode: '161' });
  if (RNG() < 0.4) caseSections.push({ actCode: 'CRPC', sectionCode: '164' });

  if (RNG() < 0.6) {
    const iesSections = ['24', '65B'];
    caseSections.push({ actCode: 'IEA', sectionCode: pick(iesSections) });
  }

  if (RNG() < 0.5) caseSections.push({ actCode: 'IEA', sectionCode: '65B' });

  const uniqueSections = [];
  const seen = new Set();
  for (const s of caseSections) {
    const key = s.actCode + ':' + s.sectionCode;
    if (!seen.has(key) && sectionMap[s.sectionCode]) {
      seen.add(key);
      uniqueSections.push(s);
    }
  }

  const actsMap = {};
  let order = 0;
  for (const us of uniqueSections) {
    order++;
    if (!actsMap[us.actCode]) actsMap[us.actCode] = [];
    actsMap[us.actCode].push({ actOrder: order, sectionCode: us.sectionCode });
  }

  let sectionOrder = 0;
  for (const [actCode, sections] of Object.entries(actsMap)) {
    const actRowID = actMap[actCode];
    for (const sec of sections) {
      sectionOrder++;
      actSectionRecords.push({
        CaseMasterID: cmRowID,
        ActID: actRowID,
        SectionID: sectionMap[sec.sectionCode],
        ActOrderID: Object.keys(actsMap).indexOf(actCode) + 1,
        SectionOrderID: sections.indexOf(sec) + 1,
      });
    }
  }
}

const empIds = Object.keys(employeeMap).map(Number);
const chargesheetableCases = cases.filter(ca => ca.statusId >= 2);
console.log('Chargesheet-eligible cases (status 2+, biz IDs): ' + chargesheetableCases.length);
console.log('Status distribution:', cases.reduce((a,c)=>{a[c.statusId]=(a[c.statusId]||0)+1;return a;},{}));

let chargesheetId = 0;
for (const ca of chargesheetableCases) {
  chargesheetId++;
  const regDate = new Date(ca.regDate);
  const csDate = addDays(regDate, randomInt(30, 365));

  const csTypes = [
    'Final Report', 'Supplementary Charge Sheet', 'Additional Report',
  ];

  const policePersonId = employeeROWID[String(pick(empIds))];

  chargesheetRecords.push({
    CSID: chargesheetId,
    CaseMasterID: ca.rowid,
    csdate: formatDate(csDate),
    cstype: pick(csTypes),
    PolicePersonID: policePersonId,
  });
}

writeCSV('ComplainantDetails.csv', columns.complainant, complainantRecords);
writeCSV('Victim.csv', columns.victim, victimRecords);
writeCSV('Accused.csv', columns.accused, accusedRecords);
writeCSV('ActSectionAssociation.csv', columns.actSection, actSectionRecords);
writeCSV('ChargesheetDetails.csv', columns.chargesheet, chargesheetRecords);

console.log('\n=== SUMMARY ===');
console.log('ComplainantDetails: ' + complainantRecords.length);
console.log('Victim: ' + victimRecords.length);
console.log('Accused: ' + accusedRecords.length + ' (habitual: ' + habitualAssignments.length + ', ' + (habitualAssignments.length / accusedRecords.length * 100).toFixed(1) + '%)');
console.log('ActSectionAssociation: ' + actSectionRecords.length);
console.log('ChargesheetDetails: ' + chargesheetRecords.length);
