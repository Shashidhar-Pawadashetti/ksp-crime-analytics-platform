const { faker } = require('@faker-js/faker');
const fs = require('fs');
const path = require('path');

faker.seed(42);

const DATA_DIR = path.join(__dirname, 'data');
const CASE_COUNT = 3000;
const HABITUAL_POOL_SIZE = 150;
const HUBBALLI_LAT = 15.3647;
const HUBBALLI_LON = 75.1240;

const MAJOR_HUBS = [
  { value: { city: 'Bengaluru', lat: 12.9716, lon: 77.5946 }, weight: 35 },
  { value: { city: 'Mysuru', lat: 12.2958, lon: 76.6394 }, weight: 15 },
  { value: { city: 'Hubballi', lat: 15.3647, lon: 75.1240 }, weight: 15 },
  { value: { city: 'Mangaluru', lat: 12.9141, lon: 74.8560 }, weight: 15 },
  { value: { city: 'Kalaburagi', lat: 17.3297, lon: 76.8343 }, weight: 10 },
  { value: { city: 'Belagavi', lat: 15.8497, lon: 74.4977 }, weight: 10 }
];

function randomInt(min, max) {
  return faker.number.int({ min, max });
}

function randomFloat(min, max) {
  return faker.number.float({ min, max });
}

function randomDate(start, end) {
  return faker.date.between({ from: new Date(start), to: new Date(end) });
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateTime(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function writeCSV(filename, headers, rows) {
  const filePath = path.join(DATA_DIR, filename);
  const headerLine = headers.join(',') + '\n';
  fs.writeFileSync(filePath, headerLine, 'utf8');
  const chunks = [];
  for (const row of rows) {
    chunks.push(row.join(',') + '\n');
    if (chunks.length >= 500) {
      fs.appendFileSync(filePath, chunks.join(''), 'utf8');
      chunks.length = 0;
    }
  }
  if (chunks.length > 0) {
    fs.appendFileSync(filePath, chunks.join(''), 'utf8');
  }
}

function kmToLatDeg(km) {
  return km / 111.0;
}

function kmToLonDeg(km, lat) {
  return km / (111.0 * Math.cos(lat * Math.PI / 180));
}

function generateHubCoord() {
  const radiusKm = 8;
  const hub = pickWeighted(MAJOR_HUBS);
  const angle = randomFloat(0, 2 * Math.PI);
  const dist = Math.sqrt(randomFloat(0, 1)) * radiusKm;
  const dLat = kmToLatDeg(dist) * Math.cos(angle);
  const dLon = kmToLonDeg(dist, hub.lat) * Math.sin(angle);
  return {
    lat: (hub.lat + dLat).toFixed(6),
    lon: (hub.lon + dLon).toFixed(6),
    city: hub.city,
  };
}

function generateWideCoord() {
  const lat = randomFloat(11.5, 18.5);
  const lon = randomFloat(74.0, 78.5);
  const ruralRegions = ['Chitradurga Rural', 'Koppal', 'Raichur Outskirts', 'Kodagu', 'Chamarajanagar'];
  return {
    lat: lat.toFixed(6),
    lon: lon.toFixed(6),
    city: faker.helpers.arrayElement(ruralRegions),
  };
}

function pickWeighted(options) {
  const totalWeight = options.reduce((sum, o) => sum + o.weight, 0);
  let r = randomFloat(0, totalWeight);
  for (const opt of options) {
    r -= opt.weight;
    if (r <= 0) return opt.value;
  }
  return options[options.length - 1].value;
}

console.log('=== Generating Synthetic Police Database ===\n');

const habitualOffenders = [];
for (let i = 0; i < HABITUAL_POOL_SIZE; i++) {
  const gender = faker.helpers.arrayElement(['Male', 'Female']);
  const firstName = faker.person.firstName(gender === 'Male' ? 'male' : 'female');
  const lastName = faker.person.lastName();
  const baseBirthYear = randomInt(1960, 2000);
  habitualOffenders.push({
    id: i + 1,
    firstName,
    lastName,
    gender,
    baseBirthYear,
  });
}

console.log('Generating CaseMaster...');
const caseMasterRecords = [];
const crimeTypes = [
  'burglary', 'assault', 'vehicle theft', 'robbery', 'dacoity',
  'murder', 'kidnapping', 'fraud', 'cybercrime', 'domestic violence',
  'rape', 'rioting', 'drug trafficking', 'extortion', 'counterfeiting',
  'attempt to murder', 'cheating', 'criminal trespass', 'arson', 'human trafficking',
];

const complaintPhrases = [
  'The victim stated that',
  'According to the complaint,',
  'Preliminary investigation revealed that',
  'Witnesses reported that',
  'Police patrolling team noticed that',
];
const actionPhrases = [
  'the suspect(s) fled the scene with valuables.',
  'the accused was apprehended at the scene.',
  'multiple suspects were involved in the incident.',
  'the incident occurred during nighttime hours.',
  'CCTV footage confirmed the sequence of events.',
  'the victim sustained serious injuries.',
  'forced entry was made through the rear window.',
  'the accused were identified by the victim during identification parade.',
];
const closingPhrases = [
  'Further investigation is ongoing.',
  'A case has been registered under relevant sections.',
  'The accused has been remanded to judicial custody.',
  'Evidence has been sent for forensic analysis.',
  'Witness statements are being recorded.',
  'Investigation is in progress and further details are awaited.',
  'Searches are being conducted to apprehend the absconding accused.',
];

for (let i = 0; i < CASE_COUNT; i++) {
  const caseMasterID = i + 1;
  const crimeRegDate = randomDate('2024-01-01', '2026-06-30');
  const incFromDate = randomDate('2024-01-01', '2026-06-30');
  const incToDate = new Date(incFromDate.getTime() + randomInt(0, 72) * 3600000);

  const year = crimeRegDate.getFullYear();
  const caseNo = `${year}${String(randomInt(1, 99999)).padStart(5, '0')}`;
  const crimeNo = `104430006${year}${String(i + 1).padStart(5, '0')}`;

  const isClustered = Math.random() < 0.6;
  const coord = isClustered ? generateHubCoord() : generateWideCoord();

  const crimeType = faker.helpers.arrayElement(crimeTypes);
  const briefFacts = `A ${crimeType} incident was reported at ${faker.location.streetAddress()}, ${coord.city}. ${faker.helpers.arrayElement(complaintPhrases)} ${faker.helpers.arrayElement(actionPhrases)} ${faker.helpers.arrayElement(closingPhrases)}`;

    const infoReceivedDate = randomDate('2024-01-01', '2026-06-30');
  caseMasterRecords.push({
    caseMasterID,
    crimeNo,
    caseNo,
    crimeRegisteredDate: formatDate(crimeRegDate),
    policePersonID: randomInt(1, 1000),
    policeStationID: randomInt(1, 150),
    caseCategoryID: randomInt(1, 5),
    gravityOffenceID: faker.helpers.arrayElement([1, 2]),
    crimeMajorHeadID: randomInt(1, 20),
    crimeMinorHeadID: randomInt(1, 100),
    caseStatusID: randomInt(1, 7),
    courtID: randomInt(1, 10),
    incidentFromDate: formatDateTime(incFromDate),
    incidentToDate: formatDateTime(incToDate),
    infoReceivedPSDate: formatDateTime(infoReceivedDate),
    latitude: coord.lat,
    longitude: coord.lon,
    briefFacts,
  });
}

console.log('Generating ComplainantDetails...');
const complainantRecords = [];
let complainantID = 1;
for (let i = 0; i < CASE_COUNT; i++) {
  const caseMasterID = i + 1;
  const numComplainants = Math.random() < 0.035 ? 2 : 1;
  for (let j = 0; j < numComplainants; j++) {
    const gender = faker.helpers.arrayElement(['Male', 'Female']);
    complainantRecords.push([
      complainantID,
      caseMasterID,
      csvEscape(faker.person.fullName(gender === 'Male' ? 'male' : 'female')),
      randomInt(18, 80),
      randomInt(1, 30),
      randomInt(1, 5),
      randomInt(1, 15),
      gender === 'Male' ? '1' : '2',
    ]);
    complainantID++;
  }
}

console.log('Generating Victim...');
const victimRecords = [];
for (let victimID = 1; victimID <= 3500; victimID++) {
  const caseMasterID = randomInt(1, CASE_COUNT);
  const gender = faker.helpers.arrayElement(['Male', 'Female']);
  const isVictimPolice = Math.random() < 0.05;
  victimRecords.push([
    victimID,
    caseMasterID,
    csvEscape(faker.person.fullName(gender === 'Male' ? 'male' : 'female')),
    randomInt(1, 90),
    gender === 'Male' ? '1' : '2',
    isVictimPolice ? '1' : '0',
  ]);
}

console.log('Generating Accused...');
const accusedRecords = [];
const groundTruthRecords = [];

const TARGET_ACCUSED = 5000;
let totalAccusedSoFar = 0;
const accusedPerCase = [];
for (let i = 0; i < CASE_COUNT; i++) {
  const remaining = CASE_COUNT - i - 1;
  const remainingNeeded = TARGET_ACCUSED - totalAccusedSoFar;
  const minPossible = Math.max(1, remainingNeeded - remaining * 4);
  const maxPossible = Math.min(4, remainingNeeded - remaining * 1);
  const count = randomInt(minPossible, maxPossible);
  accusedPerCase.push(count);
  totalAccusedSoFar += count;
}

let accusedID = 1;
for (let i = 0; i < CASE_COUNT; i++) {
  const caseMasterID = i + 1;
  const numAccused = accusedPerCase[i];

  for (let j = 0; j < numAccused; j++) {
    let name;
    let ageYear;
    let genderId;
    let isHabitual = false;
    let baseProfileId = null;

    if (Math.random() < 0.15) {
      isHabitual = true;
      const profile = faker.helpers.arrayElement(habitualOffenders);
      baseProfileId = profile.id;

      genderId = profile.gender === 'Male' ? '1' : '2';

      if (Math.random() < 0.4) {
        const varType = randomInt(1, 6);
        switch (varType) {
          case 1:
            name = `${profile.firstName[0]}. ${profile.lastName}`;
            break;
          case 2:
            name = `${profile.firstName} ${profile.lastName[0]}.`;
            break;
          case 3:
            name = `${profile.firstName}a ${profile.lastName}`;
            break;
          case 4:
            name = `${profile.firstName} K`;
            break;
          case 5:
            name = `${profile.firstName} Kumar`;
            break;
          case 6:
          default:
            name = `${profile.firstName} ${profile.lastName}`;
            break;
        }
      } else {
        name = `${profile.firstName} ${profile.lastName}`;
      }

      let birthYear = profile.baseBirthYear;
      if (Math.random() < 0.3) {
        birthYear += randomInt(-2, 2);
      }
      ageYear = 2026 - birthYear;
      if (ageYear < 18) ageYear = 18;
      if (ageYear > 70) ageYear = 70;
    } else {
      const gender = faker.helpers.arrayElement(['Male', 'Female']);
      name = faker.person.fullName(gender === 'Male' ? 'male' : 'female');
      ageYear = randomInt(18, 70);
      genderId = gender === 'Male' ? '1' : '2';
    }

    const personID = `A${j + 1}`;
    accusedRecords.push([accusedID, caseMasterID, csvEscape(name), ageYear, genderId, personID]);

    if (isHabitual) {
      groundTruthRecords.push([accusedID, caseMasterID, baseProfileId, csvEscape(name), ageYear]);
    }

    accusedID++;
  }
}

console.log('Generating ActSectionAssociation...');
const actSectionRecords = [];

for (let i = 0; i < CASE_COUNT; i++) {
  const caseMasterID = i + 1;
  const numActs = pickWeighted([
    { value: 1, weight: 50 },
    { value: 2, weight: 40 },
    { value: 3, weight: 10 },
  ]);

  for (let actOrder = 1; actOrder <= numActs; actOrder++) {
    const actID = randomInt(1, 5);
    const numSections = pickWeighted([
      { value: 1, weight: 50 },
      { value: 2, weight: 40 },
      { value: 3, weight: 10 },
    ]);

    for (let sectionOrder = 1; sectionOrder <= numSections; sectionOrder++) {
      actSectionRecords.push([
        caseMasterID,
        actID,
        randomInt(1, 200),
        actOrder,
        sectionOrder,
      ]);
    }
  }
}

console.log('\nWriting CSV files...');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

writeCSV('CaseMaster.csv', [
  'CaseMasterID', 'CrimeNo', 'CaseNo', 'CrimeRegisteredDate', 'PolicePersonID',
  'PoliceStationID', 'CaseCategoryID', 'GravityOffenceID', 'CrimeMajorHeadID',
  'CrimeMinorHeadID', 'CaseStatusID', 'CourtID', 'IncidentFromDate', 'IncidentToDate',
  'InfoReceivedPSDate', 'latitude', 'longitude', 'BriefFacts',
], caseMasterRecords.map(r => [
  r.caseMasterID, r.crimeNo, r.caseNo, r.crimeRegisteredDate, r.policePersonID,
  r.policeStationID, r.caseCategoryID, r.gravityOffenceID, r.crimeMajorHeadID,
  r.crimeMinorHeadID, r.caseStatusID, r.courtID, r.incidentFromDate, r.incidentToDate,
  r.infoReceivedPSDate, r.latitude, r.longitude, csvEscape(r.briefFacts),
]));

writeCSV('ComplainantDetails.csv', [
  'ComplainantID', 'CaseMasterID', 'ComplainantName', 'AgeYear', 'OccupationID',
  'ReligionID', 'CasteID', 'GenderID',
], complainantRecords);

writeCSV('Victim.csv', [
  'VictimMasterID', 'CaseMasterID', 'VictimName', 'AgeYear', 'GenderID', 'VictimPolice',
], victimRecords);

writeCSV('Accused.csv', [
  'AccusedMasterID', 'CaseMasterID', 'AccusedName', 'AgeYear', 'GenderID', 'PersonID',
], accusedRecords);

writeCSV('ActSectionAssociation.csv', [
  'CaseMasterID', 'ActID', 'SectionID', 'ActOrderID', 'SectionOrderID',
], actSectionRecords);

writeCSV('ground_truth_identities.csv', [
  'AccusedMasterID', 'CaseMasterID', 'BaseProfileID', 'GeneratedName', 'AgeYear',
], groundTruthRecords);

console.log('\n=== Generation Complete ===');
console.log(`CaseMaster:             ${caseMasterRecords.length}`);
console.log(`ComplainantDetails:     ${complainantRecords.length}`);
console.log(`Victim:                 ${victimRecords.length}`);
console.log(`Accused:                ${accusedRecords.length}`);
console.log(`ActSectionAssociation:  ${actSectionRecords.length}`);
console.log(`GroundTruthIdentities:  ${groundTruthRecords.length}`);
console.log(`\nOutput directory: ${DATA_DIR}`);
