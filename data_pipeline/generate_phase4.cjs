const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const MAPPINGS_DIR = path.join(__dirname, 'mappings');

function loadJSON(name) {
  return JSON.parse(fs.readFileSync(path.join(MAPPINGS_DIR, name + '.json'), 'utf-8'));
}
function loadCSV(name) {
  return fs.readFileSync(path.join(DATA_DIR, name + '.csv'), 'utf-8').trim().split('\n');
}

const unitMap = loadJSON('unit');
const employeeMap = loadJSON('employee');
const courtMap = loadJSON('court');
const caseCategoryMap = loadJSON('caseCategory');
const gravityOffenceMap = loadJSON('gravityOffence');
const crimeHeadMap = loadJSON('crimeHead');
const crimeSubHeadMap = loadJSON('crimeSubHead');
const caseStatusMap = loadJSON('caseStatus');
const districtMap = loadJSON('district');

function intMap(map) {
  const r = {};
  for (const [k, v] of Object.entries(map)) r[parseInt(k)] = v;
  return r;
}
function revMap(map) {
  const r = {};
  for (const [k, v] of Object.entries(map)) r[v] = parseInt(k);
  return r;
}

const unitROWID = intMap(unitMap);
const employeeROWID = intMap(employeeMap);
const courtROWID = intMap(courtMap);
const caseCategoryROWID = intMap(caseCategoryMap);
const gravityOffenceROWID = intMap(gravityOffenceMap);
const crimeHeadROWID = intMap(crimeHeadMap);
const crimeSubHeadROWID = intMap(crimeSubHeadMap);
const caseStatusROWID = intMap(caseStatusMap);
const districtROWID = intMap(districtMap);
const revDistrict = revMap(districtMap);

const unitLines = loadCSV('Unit');
const empLines = loadCSV('Employee');
const courtLines = loadCSV('Court');

function parseLine(line) {
  const res = [];
  let cur = '', inq = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inq = !inq;
    else if (ch === ',' && !inq) { res.push(cur); cur = ''; }
    else cur += ch;
  }
  res.push(cur);
  return res;
}

const districtNames = {};
const districtLines = loadCSV('District');
for (let i = 1; i < districtLines.length; i++) {
  const c = districtLines[i].split(',');
  districtNames[parseInt(c[0])] = c[1];
}

const uCol = {};
const uh = parseLine(unitLines[0]);
uh.forEach((n, i) => uCol[n] = i);

const unitDistricts = {};
for (let i = 1; i < unitLines.length; i++) {
  const c = parseLine(unitLines[i]);
  const uid = parseInt(c[uCol.UnitID]);
  const distRowID = c[uCol.DistrictID];
  const distBizID = revDistrict[distRowID];
  if (distBizID === undefined) console.log('Unknown district ROWID for unit', uid, ':', distRowID);
  else unitDistricts[uid] = distBizID;
}

const eCol = {};
const eh = parseLine(empLines[0]);
eh.forEach((n, i) => eCol[n] = i);

const empByUnit = {};
for (let i = 1; i < empLines.length; i++) {
  const c = parseLine(empLines[i]);
  const empBizID = parseInt(c[eCol.EmployeeID]);
  const unitRowID = c[eCol.UnitID];
  const revUnit = revMap(unitMap);
  const unitBizID = revUnit[unitRowID];
  if (!empByUnit[unitBizID]) empByUnit[unitBizID] = [];
  empByUnit[unitBizID].push(empBizID);
}

const courtByDistrict = {};
for (let i = 1; i < courtLines.length; i++) {
  const c = parseLine(courtLines[i]);
  const courtBizID = parseInt(c[0]);
  const distRowID = c[2];
  const distBizID = revDistrict[distRowID];
  if (distBizID === undefined) { console.log('Unknown district ROWID for court', courtBizID, ':', distRowID); continue; }
  if (!courtByDistrict[distBizID]) courtByDistrict[distBizID] = [];
  courtByDistrict[distBizID].push(courtBizID);
}

const cityHotspots = {
  1:  [{ lat: 16.1700, lng: 75.6600, name: 'Bagalkot City' }],
  2:  [{ lat: 15.8497, lng: 74.4977, name: 'Belagavi City' }, { lat: 15.8500, lng: 74.5200, name: 'Belagavi Camp' }, { lat: 15.8300, lng: 74.4800, name: 'Maruti Galli Belagavi' }],
  3:  [{ lat: 15.1394, lng: 76.9214, name: 'Ballari City' }],
  4:  [{ lat: 13.0000, lng: 77.6000, name: 'Bengaluru Rural' }],
  5:  [{ lat: 12.9716, lng: 77.5946, name: 'Bengaluru City Center' }, { lat: 12.9700, lng: 77.6400, name: 'MG Road Bengaluru' }, { lat: 12.9350, lng: 77.6100, name: 'Koramangala' }, { lat: 12.9800, lng: 77.5800, name: 'Malleswaram' }, { lat: 12.9500, lng: 77.5700, name: 'Rajajinagar' }, { lat: 13.0200, lng: 77.5600, name: 'Yeshwanthpur' }, { lat: 12.9900, lng: 77.6600, name: 'Indiranagar' }, { lat: 12.9100, lng: 77.6300, name: 'HSR Layout' }, { lat: 12.9700, lng: 77.5900, name: 'Jayanagar' }, { lat: 12.9400, lng: 77.5400, name: 'Basavanagudi' }],
  6:  [{ lat: 17.9104, lng: 77.5199, name: 'Bidar City' }],
  7:  [{ lat: 11.9260, lng: 76.9409, name: 'Chamarajanagar' }],
  8:  [{ lat: 13.4210, lng: 77.7275, name: 'Chikkaballapur' }],
  9:  [{ lat: 13.3152, lng: 75.7750, name: 'Chikkamagaluru Town' }],
  10: [{ lat: 14.2238, lng: 76.4006, name: 'Chitradurga City' }],
  11: [{ lat: 12.9141, lng: 74.8560, name: 'Mangaluru City Center' }, { lat: 12.8800, lng: 74.8400, name: 'Bunder Mangaluru' }, { lat: 12.9200, lng: 74.8700, name: 'Panambur Mangaluru' }],
  12: [{ lat: 14.4641, lng: 75.9232, name: 'Davanagere City' }],
  13: [{ lat: 15.3647, lng: 75.1240, name: 'Hubballi City Center' }, { lat: 15.4589, lng: 75.0078, name: 'Dharwad City Center' }, { lat: 15.3800, lng: 75.1100, name: 'Vidyanagar Hubballi' }, { lat: 15.3450, lng: 75.1450, name: 'Gokul Road Hubballi' }, { lat: 15.3550, lng: 75.1350, name: 'Hubballi Railway Station' }, { lat: 15.3500, lng: 75.1650, name: 'Old Hubballi' }, { lat: 15.4380, lng: 75.0650, name: 'Amargol' }, { lat: 15.3800, lng: 75.0800, name: 'Navanagar' }],
  14: [{ lat: 15.4290, lng: 75.6290, name: 'Gadag City' }],
  15: [{ lat: 13.0072, lng: 76.0961, name: 'Hassan Town' }],
  16: [{ lat: 14.7930, lng: 75.4040, name: 'Haveri City' }],
  17: [{ lat: 17.3297, lng: 76.8343, name: 'Kalaburagi City Center' }, { lat: 17.3100, lng: 76.8200, name: 'Kalaburagi Suburban' }],
  18: [{ lat: 12.4200, lng: 75.7400, name: 'Madikeri Kodagu' }],
  19: [{ lat: 13.1359, lng: 78.1298, name: 'Kolar Town' }, { lat: 12.9600, lng: 78.2700, name: 'Kolar Gold Fields' }],
  20: [{ lat: 15.3500, lng: 76.1500, name: 'Koppal City' }],
  21: [{ lat: 12.5243, lng: 76.8958, name: 'Mandya Town' }],
  22: [{ lat: 12.2958, lng: 76.6394, name: 'Mysuru City Center' }, { lat: 12.3200, lng: 76.6200, name: 'Mysuru South' }, { lat: 12.3400, lng: 76.6500, name: 'Mysuru North' }, { lat: 12.3100, lng: 76.6100, name: 'Kuvempunagar Mysuru' }, { lat: 12.2800, lng: 76.6600, name: 'KR Nagar Mysuru' }],
  23: [{ lat: 16.2070, lng: 77.3560, name: 'Raichur City' }, { lat: 15.6000, lng: 76.9500, name: 'Sindhanur' }],
  24: [{ lat: 12.7150, lng: 77.2820, name: 'Ramanagara' }],
  25: [{ lat: 13.9299, lng: 75.5681, name: 'Shivamogga City' }],
  26: [{ lat: 13.3379, lng: 77.1173, name: 'Tumakuru City' }, { lat: 13.2600, lng: 76.6500, name: 'Tiptur' }],
  27: [{ lat: 13.3409, lng: 74.7421, name: 'Udupi Town' }],
  28: [{ lat: 14.5200, lng: 74.3200, name: 'Karwar Uttara Kannada' }],
  29: [{ lat: 15.1800, lng: 76.9100, name: 'Vijayanagara City' }],
  30: [{ lat: 16.8300, lng: 75.7100, name: 'Vijayapura City' }],
  31: [{ lat: 16.7700, lng: 77.1400, name: 'Yadgir City' }],
};

const crimeSubHeadToHead = {
  1:1,2:1,3:1,4:1,5:1,6:2,7:2,8:2,9:3,10:3,11:3,12:4,13:4,14:4,15:4,
  16:5,17:5,18:5,19:5,20:6,21:6,22:6,23:6,24:7,25:7,26:7,27:7,
  28:8,29:8,30:8,31:8,32:9,33:9,34:9,35:9,36:10,37:10,38:10,39:10,
  40:11,41:11,42:11,43:11,44:12,45:12,46:12,47:13,48:13,49:13,50:13,
  51:14,52:14,53:14,54:14,55:15,56:15,57:15,58:15,59:16,60:16,61:16,
  62:17,63:17,64:17,65:17,66:18,67:18,68:18,69:18,70:19,71:19,72:19,
  73:20,74:20,75:20,76:20,
};

const briefFactsTemplates = {
  1: ['The accused attacked the victim with a sharp weapon near {location} over a property dispute. The victim succumbed to injuries on the way to the hospital.','A dead body with multiple stab wounds was found at {location}. During investigation, the accused was arrested and the murder weapon recovered.','The accused conspired with unknown persons to murder the victim using a firearm near {location}. Postmortem confirmed death due to gunshot injury.','The deceased was last seen with the accused at {location}. Later, the body was discovered in a secluded area with head injuries caused by a blunt object.','The accused administered poison to the victim mixed in food at a local hotel near {location}. The victim died while undergoing treatment.'],
  2: ['The accused fired a gunshot at the victim near {location}. The victim sustained serious injuries and is undergoing treatment at the district hospital.','The accused attempted to strangulate the victim at {location}. Neighbors intervened and rescued the victim.','The victim was attacked with a knife by the accused near {location} following a verbal altercation.','The accused threw acid on the victim near {location} over a personal rivalry. The victim suffered severe burns.','The accused attempted to murder the victim by hitting with an iron rod at {location}.'],
  3: ['The accused driving a rash vehicle knocked down the victim near {location}. The victim died on the spot due to severe head injuries.','A road accident occurred at {location} when the accused lost control of the vehicle and hit a pedestrian, causing death by negligence.','The victim died due to medical negligence at a private clinic near {location}.','The accused was involved in a construction collapse at {location} due to use of substandard materials, resulting in death of two laborers.','Death occurred due to electrocution at {location} caused by negligence of the electricity department.'],
  4: ['The accused committed rape of a major woman at {location} under the pretext of marriage.','A minor girl aged 15 years was raped by the accused near {location}. The survivor was rescued and medical examination confirmed the offence.','Gang rape of a woman was reported at {location} by three unknown accused persons.','The accused, a relative of the survivor, committed rape at {location} by threatening the survivor.','The accused repeatedly raped the survivor at {location} over several months by promising marriage.'],
  5: ['The accused kidnapped a minor boy from near {location} for ransom. The child was safely rescued.','A minor girl was kidnapped from near her school at {location}. The accused was traced and the child was recovered within 24 hours.','The accused abducted a woman at {location} with intent to force her into marriage.','Kidnapping of a businessman for ransom occurred at {location}.','A newborn baby was kidnapped from the hospital near {location}. CCTV footage helped identify the accused.'],
  6: ['Armed robbery was committed at a petrol bunk near {location}. The accused fled with cash amounting to Rs 2 lakhs.','A gang of three persons robbed commuters on the highway near {location} at knife point.','Robbery at a jewellery store at {location} was committed by two masked persons. Ornaments worth Rs 10 lakhs were stolen.','A woman was robbed of her gold chain by two bike-borne accused near {location}.','The accused robbed a bank customer at {location} after following him from the ATM.'],
  7: ['Armed dacoity was committed at a textile showroom at {location} by a gang of five persons. Goods worth Rs 15 lakhs looted.','A gang of dacoits stopped a truck on the highway near {location} and looted the consignment.','Dacoity with murder occurred at a farmhouse near {location}. The gang killed the watchman.','A group of unknown miscreants committed dacoity at a temple near {location} and looted the donation box.','Highway dacoity committed on the bypass near {location}.'],
  8: ['Burglary occurred at a residence at {location} during night hours. Gold jewellery and cash worth Rs 8 lakhs were stolen.','A shop near {location} was burgled by breaking the lock.','Night burglary was committed at a godown at {location}. Stock worth Rs 5 lakhs was stolen.','The accused broke into a house at {location} by cutting the grill.','Burglary at a commercial establishment at {location} was reported. CCTV footage shows a single accused.'],
  9: ['A motor vehicle theft was reported at {location}. A motorcycle bearing local registration was stolen.','Mobile phone theft occurred at a bus stop at {location}.','Theft of valuables from a parked car was reported at {location}. The window glass was broken and valuables stolen.','Chain snatching occurred at {location} by two bike-borne accused.','Theft from a vehicle parked at {location} was reported. A tool box and spare tyre were stolen.'],
  10: ['A group of persons armed with deadly weapons clashed near {location} over a political rivalry.','Rioting occurred at {location} during a religious procession. Stones were pelted.','Unlawful assembly was formed at {location} causing public nuisance.','A factional fight at {location} resulted in damage to public property.','Rioting with destruction of property occurred at {location} during a land dispute.'],
  11: ['The accused cheated the victim by impersonating as a government official at {location} and extracted Rs 2 lakhs.','A Ponzi scheme was operated by the accused near {location}. Hundreds of investors were cheated.','Online fraud was reported from {location}. The victim was tricked into transferring Rs 50,000 through phishing.','The accused cheated the victim by selling a fake property at {location}.','The accused obtained a loan by submitting forged documents to a bank near {location}.'],
  12: ['Criminal breach of trust by a public servant was reported at {location}. Government funds amounting to Rs 5 lakhs were misappropriated.','The accused misappropriated funds collected from farmers near {location}.','A bailee sold the bailed goods without consent near {location}.','The accused, a bank employee, misappropriated fixed deposit amounts of senior citizens at {location}.','The trustee of a charitable trust misused trust funds near {location}.'],
  13: ['Counterfeit currency notes of Rs 500 denomination were seized near {location}.','A racket of stamp paper counterfeiting was busted at {location}.','Forged documents including property deeds were seized from a gang operating near {location}.','Counterfeit Indian currency with face value of Rs 2 lakhs was recovered at {location}.','Possession of counterfeit currency notes was traced to a hideout near {location}.'],
  14: ['The accused set fire to the thatched house of the victim at {location} following a property dispute.','Mischief by explosive materials was reported at {location}.','Arson of a public building was committed at {location}.','Fire was set to a vehicle parked at {location} by unknown persons.','The accused set fire to agricultural fields near {location} over a land dispute.'],
  15: ['Grievous hurt was caused by the accused using a sword at {location}.','The accused administered poison to the victim at {location}.','Simple hurt was caused during a quarrel at {location}.','Hurt by rash driving occurred at {location}. A pedestrian was knocked down.','The accused attacked the victim with a cycle chain at {location}.'],
  16: ['The accused extorted money by threatening to kill the victim near {location}.','A public servant demanded and accepted a bribe of Rs 50,000 at {location}.','The accused intimidated the shopkeeper at {location} and demanded protection money.','Extortion by anonymous phone calls was reported at {location}.','The accused, claiming to be a gangster, demanded ransom from a businessman at {location}.'],
  17: ['House trespass was committed by the accused at {location}.','House trespass by night was reported at {location}.','Lurking house trespass was committed at {location} during the daytime.','Criminal trespass by a public servant at {location} was reported.','The accused trespassed into a government office at {location} and threatened the officials.'],
  18: ['The accused assaulted a woman with intent to outrage her modesty at {location}.','Sexual harassment was reported at the workplace at {location}.','Voyeurism was reported at {location}. The accused was caught filming.','Stalking was reported by a woman at {location}.','The accused passed lewd comments at a woman near {location}.'],
  19: ['Dowry death by burning occurred at {location}. The victim was set on fire by her husband and in-laws.','A married woman died due to poisoning at {location}. Investigation revealed dowry harassment.','The victim was subjected to cruelty and harassment for dowry at {location}.','Dowry death by hanging was reported at {location}.','The accused caused the dowry death of the victim at {location}.'],
  20: ['Hacking of a social media account was reported at {location}.','Identity theft was reported at {location}. The accused used the victims Aadhaar details.','Cyber stalking of a woman was reported at {location}.','Data theft from a company server was detected at {location}.','An email phishing scam was reported at {location}. The victim lost Rs 1.2 lakhs.'],
};

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function pad(n, len) { return String(n).padStart(len, '0'); }

function randomDate(rng, startYear, endYear) {
  const start = new Date(startYear, 0, 1).getTime();
  const end = new Date(endYear, 11, 31).getTime();
  return new Date(start + rng() * (end - start));
}
function formatDate(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1,2)}-${pad(d.getDate(),2)}`; }
function formatDateTime(d) { return `${formatDate(d)} 12:00:00`; }

const RNG = seededRandom(20260702);

const stations = Object.keys(empByUnit)
  .map(Number)
  .filter(uid => unitDistricts[uid])
  .sort((a, b) => a - b);

console.log('Active stations with employees:', stations.length);
console.log('Station IDs:', stations.join(', '));

const stationWeights = {};
for (const uid of stations) {
  stationWeights[uid] = empByUnit[uid].length;
}
const totalWeight = Object.values(stationWeights).reduce((a, b) => a + b, 0);

const years = [2020, 2021, 2022, 2023, 2024, 2025];

const serialCounters = {};
for (const year of years) {
  for (const uid of stations) {
    serialCounters[`${uid}:${year}`] = 0;
  }
}

function pickStation(rng) {
  let r = rng() * totalWeight;
  for (const uid of stations) {
    r -= stationWeights[uid];
    if (r <= 0) return uid;
  }
  return stations[stations.length - 1];
}

const records = [];
let caseMasterID = 1;

for (let i = 0; i < 3000; i++) {
  const year = years[Math.floor(RNG() * years.length)];
  const stationId = pickStation(RNG);
  const districtId = unitDistricts[stationId];

  serialCounters[`${stationId}:${year}`]++;
  const serial = serialCounters[`${stationId}:${year}`];

  const categoryId = Math.floor(RNG() * 5) + 1;
  const distCode = pad(districtId, 4);
  const stationPad = pad(stationId, 4);
  const caseNo = `${year}${pad(serial, 5)}`;
  const crimeNo = `${categoryId}${distCode}${stationPad}${caseNo}`;

  const subHeadId = Math.floor(RNG() * 76) + 1;
  const headId = crimeSubHeadToHead[subHeadId];

  const employees = empByUnit[stationId];
  const employeeId = employees[Math.floor(RNG() * employees.length)];

  const courtFallback = {4:5,7:22,8:19,16:12,18:22,20:3,24:5,28:2,29:3,31:17};
  const courtDistId = courtByDistrict[districtId] ? districtId : (courtFallback[districtId] || 5);
  const districtCourts = courtByDistrict[courtDistId];
  if (!districtCourts) { console.log('ERROR: No courts for district', districtId, 'fallback', courtDistId, 'courtByDistrict keys:', Object.keys(courtByDistrict).join(',')); process.exit(1); }
  const courtId = districtCourts[Math.floor(RNG() * districtCourts.length)];

  const gravityId = RNG() > 0.5 ? 1 : 2;
  const statusWeights = [0.5, 0.2, 0.1, 0.05, 0.05, 0.05, 0.05];
  const statusRand = RNG();
  let cumulative = 0;
  let statusId = 1;
  for (let j = 0; j < statusWeights.length; j++) {
    cumulative += statusWeights[j];
    if (statusRand <= cumulative) { statusId = j + 1; break; }
  }

  const districtHotspots = cityHotspots[districtId] || cityHotspots[5];
  const hotspot = districtHotspots[Math.floor(RNG() * districtHotspots.length)];
  const lat = hotspot.lat + (RNG() - 0.5) * 0.015;
  const lng = hotspot.lng + (RNG() - 0.5) * 0.015;

  const incidentFrom = randomDate(RNG, year - 1, year);
  const incidentTo = new Date(incidentFrom.getTime() + RNG() * 7 * 24 * 60 * 60 * 1000);
  const infoReceived = new Date(incidentTo.getTime() + RNG() * 3 * 24 * 60 * 60 * 1000);
  const crimeRegistered = new Date(infoReceived.getTime() + RNG() * 2 * 24 * 60 * 60 * 1000);

  const templates = briefFactsTemplates[headId];
  const template = templates[Math.floor(RNG() * templates.length)];
  const districtName = districtNames[districtId] || 'Karnataka';
  const briefFacts = template.replace('{location}', `${hotspot.name}, ${districtName}`);

  records.push({
    CaseMasterID: caseMasterID++,
    CrimeNo: crimeNo,
    CaseNo: caseNo,
    CrimeRegisteredDate: formatDate(crimeRegistered),
    PolicePersonID: employeeROWID[employeeId],
    PoliceStationID: unitROWID[stationId],
    CaseCategoryID: caseCategoryROWID[categoryId],
    GravityOffenceID: gravityOffenceROWID[gravityId],
    CrimeMajorHeadID: crimeHeadROWID[headId],
    CrimeMinorHeadID: crimeSubHeadROWID[subHeadId],
    CaseStatusID: caseStatusROWID[statusId],
    CourtID: courtROWID[courtId],
    IncidentFromDate: formatDateTime(incidentFrom),
    IncidentToDate: formatDateTime(incidentTo),
    InfoReceivedPSDate: formatDateTime(infoReceived),
    Latitude: lat.toFixed(6),
    Longitude: lng.toFixed(6),
    BriefFacts: briefFacts,
  });
}

records.sort((a, b) => a.CaseMasterID - b.CaseMasterID);

const columns = [
  'CaseMasterID','CrimeNo','CaseNo','CrimeRegisteredDate',
  'PolicePersonID','PoliceStationID','CaseCategoryID','GravityOffenceID',
  'CrimeMajorHeadID','CrimeMinorHeadID','CaseStatusID','CourtID',
  'IncidentFromDate','IncidentToDate','InfoReceivedPSDate',
  'Latitude','Longitude','BriefFacts',
];

const csvLines = [columns.join(',')];
for (const record of records) {
  const line = columns.map(col => {
    const val = record[col];
    if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  }).join(',');
  csvLines.push(line);
}

fs.writeFileSync(path.join(DATA_DIR, 'CaseMaster.csv'), csvLines.join('\n'), 'utf-8');
console.log(`Generated ${records.length} CaseMaster records -> data/CaseMaster.csv`);
