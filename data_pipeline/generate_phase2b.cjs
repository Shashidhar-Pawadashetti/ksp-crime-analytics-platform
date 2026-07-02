const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const MAPPINGS_DIR = path.join(__dirname, 'mappings');

const stateMap = JSON.parse(fs.readFileSync(path.join(MAPPINGS_DIR, 'state.json'), 'utf8'));
const districtMap = JSON.parse(fs.readFileSync(path.join(MAPPINGS_DIR, 'district.json'), 'utf8'));
const unitTypeMap = JSON.parse(fs.readFileSync(path.join(MAPPINGS_DIR, 'unitType.json'), 'utf8'));

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
    if (chunks.length >= 200) {
      fs.appendFileSync(filePath, chunks.join(''), 'utf8');
      chunks.length = 0;
    }
  }
  if (chunks.length > 0) {
    fs.appendFileSync(filePath, chunks.join(''), 'utf8');
  }
}

function ROWID(map, key) {
  return map[String(key)];
}

const S_KARNATAKA = ROWID(stateMap, 1);

const UNITS = [
  // Top-level units (ParentUnit = NULL)
  { id: 1,  name: 'Karnataka State Police Headquarters',           type: 5, parent: null, dist: 5  },
  { id: 2,  name: 'Bengaluru City Police Commissionerate',         type: 2, parent: null, dist: 5  },
  { id: 3,  name: 'Mysuru City Police Commissionerate',            type: 2, parent: null, dist: 22 },
  { id: 4,  name: 'Hubballi-Dharwad Police Commissionerate',       type: 2, parent: null, dist: 13 },
  { id: 5,  name: 'Mangaluru City Police Commissionerate',         type: 2, parent: null, dist: 11 },
  { id: 6,  name: 'Belagavi City Police Commissionerate',          type: 2, parent: null, dist: 2  },
  { id: 7,  name: 'Kalaburagi City Police Commissionerate',        type: 2, parent: null, dist: 17 },

  // Range Headquarters
  { id: 8,  name: 'Bengaluru Range Headquarters',                   type: 4, parent: 1, dist: 5  },
  { id: 9,  name: 'Southern Range Headquarters, Mysuru',            type: 4, parent: 1, dist: 22 },
  { id: 10, name: 'Northern Range Headquarters, Belagavi',          type: 4, parent: 1, dist: 2  },
  { id: 11, name: 'Eastern Range Headquarters, Kalaburagi',         type: 4, parent: 1, dist: 17 },

  // District Police Offices
  { id: 12,  name: 'Bagalkot District Police Office',                type: 3, parent: 1,  dist: 1  },
  { id: 13,  name: 'Belagavi District Police Office',               type: 3, parent: 10, dist: 2  },
  { id: 14,  name: 'Bellary District Police Office',                type: 3, parent: 8,  dist: 3  },
  { id: 15,  name: 'Bengaluru Rural District Police Office',        type: 3, parent: 8,  dist: 4  },
  { id: 16,  name: 'Bengaluru Urban District Police Office',        type: 3, parent: 8,  dist: 5  },
  { id: 17,  name: 'Bidar District Police Office',                  type: 3, parent: 11, dist: 6  },
  { id: 18,  name: 'Chamarajanagar District Police Office',         type: 3, parent: 9,  dist: 7  },
  { id: 19,  name: 'Chikkaballapur District Police Office',         type: 3, parent: 8,  dist: 8  },
  { id: 20,  name: 'Chikkamagaluru District Police Office',         type: 3, parent: 9,  dist: 9  },
  { id: 21,  name: 'Chitradurga District Police Office',            type: 3, parent: 8,  dist: 10 },
  { id: 22,  name: 'Dakshina Kannada District Police Office',       type: 3, parent: 9,  dist: 11 },
  { id: 23,  name: 'Davanagere District Police Office',             type: 3, parent: 8,  dist: 12 },
  { id: 24,  name: 'Dharwad District Police Office',                type: 3, parent: 10, dist: 13 },
  { id: 25,  name: 'Gadag District Police Office',                  type: 3, parent: 10, dist: 14 },
  { id: 26,  name: 'Hassan District Police Office',                 type: 3, parent: 9,  dist: 15 },
  { id: 27,  name: 'Haveri District Police Office',                 type: 3, parent: 10, dist: 16 },
  { id: 28,  name: 'Kalaburagi District Police Office',             type: 3, parent: 11, dist: 17 },
  { id: 29,  name: 'Kodagu District Police Office',                 type: 3, parent: 9,  dist: 18 },
  { id: 30,  name: 'Kolar District Police Office',                  type: 3, parent: 8,  dist: 19 },
  { id: 31,  name: 'Koppal District Police Office',                 type: 3, parent: 11, dist: 20 },
  { id: 32,  name: 'Mandya District Police Office',                 type: 3, parent: 9,  dist: 21 },
  { id: 33,  name: 'Mysuru District Police Office',                 type: 3, parent: 9,  dist: 22 },
  { id: 34,  name: 'Raichur District Police Office',                type: 3, parent: 11, dist: 23 },
  { id: 35,  name: 'Ramanagara District Police Office',             type: 3, parent: 8,  dist: 24 },
  { id: 36,  name: 'Shivamogga District Police Office',             type: 3, parent: 8,  dist: 25 },
  { id: 37,  name: 'Tumakuru District Police Office',               type: 3, parent: 8,  dist: 26 },
  { id: 38,  name: 'Udupi District Police Office',                  type: 3, parent: 9,  dist: 27 },
  { id: 39,  name: 'Uttara Kannada District Police Office',         type: 3, parent: 10, dist: 28 },
  { id: 40,  name: 'Vijayanagara District Police Office',           type: 3, parent: 8,  dist: 29 },
  { id: 41,  name: 'Vijayapura District Police Office',             type: 3, parent: 11, dist: 30 },
  { id: 42,  name: 'Yadgir District Police Office',                 type: 3, parent: 11, dist: 31 },

  // State-level specialized units
  { id: 43, name: 'Karnataka State Traffic Police Unit',            type: 6, parent: 1,  dist: 5  },
  { id: 44, name: 'Karnataka State Cyber Crime Cell',               type: 7, parent: 1,  dist: 5  },
  { id: 45, name: 'Karnataka State Women Police Station',           type: 1, parent: 1,  dist: 5  },
  { id: 46, name: 'Karnataka State Anti-Narcotics Unit',            type: 1, parent: 1,  dist: 5  },
  { id: 47, name: 'Karnataka State Economic Offences Wing',         type: 1, parent: 1,  dist: 5  },
  { id: 48, name: 'Karnataka State Fingerprint Bureau',             type: 1, parent: 1,  dist: 5  },
  { id: 49, name: 'Karnataka State Dog Squad Unit',                 type: 1, parent: 1,  dist: 5  },

  // Police Stations under Bengaluru City Commissionerate
  { id: 50,  name: 'Cubbon Park Police Station',                    type: 1, parent: 2,  dist: 5  },
  { id: 51,  name: 'High Grounds Police Station',                   type: 1, parent: 2,  dist: 5  },
  { id: 52,  name: 'Seshadripuram Police Station',                  type: 1, parent: 2,  dist: 5  },
  { id: 53,  name: 'Rajajinagar Police Station',                    type: 1, parent: 2,  dist: 5  },
  { id: 54,  name: 'Malleswaram Police Station',                    type: 1, parent: 2,  dist: 5  },
  { id: 55,  name: 'Yeshwanthpur Police Station',                   type: 1, parent: 2,  dist: 5  },
  { id: 56,  name: 'Hebbal Police Station',                         type: 1, parent: 2,  dist: 5  },
  { id: 57,  name: 'Banaswadi Police Station',                      type: 1, parent: 2,  dist: 5  },
  { id: 58,  name: 'Indiranagar Police Station',                    type: 1, parent: 2,  dist: 5  },
  { id: 59,  name: 'Koramangala Police Station',                    type: 1, parent: 2,  dist: 5  },
  { id: 60,  name: 'Jayanagar Police Station',                      type: 1, parent: 2,  dist: 5  },
  { id: 61,  name: 'Basavanagudi Police Station',                   type: 1, parent: 2,  dist: 5  },
  { id: 62,  name: 'Wilson Garden Police Station',                  type: 1, parent: 2,  dist: 5  },
  { id: 63,  name: 'Ulsoor Police Station',                         type: 1, parent: 2,  dist: 5  },
  { id: 64,  name: 'Frazer Town Police Station',                    type: 1, parent: 2,  dist: 5  },
  { id: 65,  name: 'Whitefield Police Station',                     type: 1, parent: 2,  dist: 5  },
  { id: 66,  name: 'Kengeri Police Station',                        type: 1, parent: 2,  dist: 5  },
  { id: 67,  name: 'Jalahalli Police Station',                      type: 1, parent: 2,  dist: 5  },
  { id: 68,  name: 'Peenya Police Station',                         type: 1, parent: 2,  dist: 5  },
  { id: 69,  name: 'Magadi Road Police Station',                    type: 1, parent: 2,  dist: 5  },
  { id: 70,  name: 'Krishnarajapuram Police Station',               type: 1, parent: 2,  dist: 5  },
  { id: 71,  name: 'Byatarayanapura Police Station',                type: 1, parent: 2,  dist: 5  },
  { id: 72,  name: 'HSR Layout Police Station',                     type: 1, parent: 2,  dist: 5  },
  { id: 73,  name: 'JP Nagar Police Station',                       type: 1, parent: 2,  dist: 5  },
  { id: 74,  name: 'HAL Police Station',                            type: 1, parent: 2,  dist: 5  },
  { id: 75,  name: 'Bengaluru Traffic Police Unit',                 type: 6, parent: 2,  dist: 5  },
  { id: 76,  name: 'Bengaluru Cyber Crime Cell',                    type: 7, parent: 2,  dist: 5  },

  // Police Stations under Mysuru City Commissionerate
  { id: 77,  name: 'Nazarbad Police Station',                       type: 1, parent: 3,  dist: 22 },
  { id: 78,  name: 'KR Nagar Police Station',                       type: 1, parent: 3,  dist: 22 },
  { id: 79,  name: 'Mysuru South Police Station',                   type: 1, parent: 3,  dist: 22 },
  { id: 80,  name: 'Mysuru North Police Station',                   type: 1, parent: 3,  dist: 22 },
  { id: 81,  name: 'Vijayanagar Police Station, Mysuru',            type: 1, parent: 3,  dist: 22 },
  { id: 82,  name: 'Udayagiri Police Station',                      type: 1, parent: 3,  dist: 22 },
  { id: 83,  name: 'Kuvempunagar Police Station',                   type: 1, parent: 3,  dist: 22 },
  { id: 84,  name: 'Mysuru Traffic Police Unit',                    type: 6, parent: 3,  dist: 22 },
  { id: 85,  name: 'Mysuru Cyber Crime Cell',                       type: 7, parent: 3,  dist: 22 },

  // Police Stations under Hubballi-Dharwad Police Commissionerate
  { id: 86,  name: 'Hubballi Rural Police Station',                  type: 1, parent: 4,  dist: 13 },
  { id: 87,  name: 'Hubballi Urban Police Station',                 type: 1, parent: 4,  dist: 13 },
  { id: 88,  name: 'Vidyanagar Police Station, Hubballi',            type: 1, parent: 4,  dist: 13 },
  { id: 89,  name: 'Gokul Road Police Station',                      type: 1, parent: 4,  dist: 13 },
  { id: 90,  name: 'Dharwad City Police Station',                    type: 1, parent: 4,  dist: 13 },
  { id: 91,  name: 'Hubballi Traffic Police Unit',                   type: 6, parent: 4,  dist: 13 },

  // Police Stations under Mangaluru City Commissionerate
  { id: 92,  name: 'Mangaluru South Police Station',                 type: 1, parent: 5,  dist: 11 },
  { id: 93,  name: 'Mangaluru North Police Station',                 type: 1, parent: 5,  dist: 11 },
  { id: 94,  name: 'Bunder Police Station',                          type: 1, parent: 5,  dist: 11 },
  { id: 95,  name: 'Panambur Police Station',                        type: 1, parent: 5,  dist: 11 },
  { id: 96,  name: 'Mangaluru Traffic Police Unit',                  type: 6, parent: 5,  dist: 11 },
  { id: 97,  name: 'Mangaluru Cyber Crime Cell',                    type: 7, parent: 5,  dist: 11 },

  // Police Stations under Belagavi City Police Commissionerate
  { id: 98,  name: 'Belagavi City Police Station',                  type: 1, parent: 6,  dist: 2  },
  { id: 99,  name: 'Belagavi Camp Police Station',                  type: 1, parent: 6,  dist: 2  },
  { id: 100, name: 'Maruti Police Station, Belagavi',                type: 1, parent: 6,  dist: 2  },
  { id: 101, name: 'Belagavi Traffic Police Unit',                   type: 6, parent: 6,  dist: 2  },

  // Police Stations under Kalaburagi City Police Commissionerate
  { id: 102, name: 'Kalaburagi City Police Station',                 type: 1, parent: 7,  dist: 17 },
  { id: 103, name: 'Kalaburagi Suburban Police Station',             type: 1, parent: 7,  dist: 17 },
  { id: 104, name: 'Kalaburagi Traffic Police Unit',                 type: 6, parent: 7,  dist: 17 },

  // Police Stations under District Police Offices
  { id: 105, name: 'Davanagere City Police Station',                 type: 1, parent: 23, dist: 12 },
  { id: 106, name: 'Shivamogga City Police Station',                 type: 1, parent: 36, dist: 25 },
  { id: 107, name: 'Ballari City Police Station',                    type: 1, parent: 14, dist: 3  },
  { id: 108, name: 'Bidar City Police Station',                      type: 1, parent: 17, dist: 6  },
  { id: 109, name: 'Udupi Town Police Station',                      type: 1, parent: 38, dist: 27 },
  { id: 110, name: 'Hassan Town Police Station',                     type: 1, parent: 26, dist: 15 },
  { id: 111, name: 'Chikkamagaluru Town Police Station',             type: 1, parent: 20, dist: 9  },
  { id: 112, name: 'Chikkodi Police Station',                        type: 1, parent: 13, dist: 2  },
  { id: 113, name: 'Gokak Police Station',                           type: 1, parent: 13, dist: 2  },
  { id: 114, name: 'Tumakuru City Police Station',                   type: 1, parent: 37, dist: 26 },
  { id: 115, name: 'Tiptur Police Station',                          type: 1, parent: 37, dist: 26 },
  { id: 116, name: 'Mandya Town Police Station',                     type: 1, parent: 32, dist: 21 },
  { id: 117, name: 'Raichur City Police Station',                    type: 1, parent: 34, dist: 23 },
  { id: 118, name: 'Sindhanur Police Station',                       type: 1, parent: 34, dist: 23 },
  { id: 119, name: 'Vijayapura City Police Station',                 type: 1, parent: 41, dist: 30 },
  { id: 120, name: 'Kolar Town Police Station',                      type: 1, parent: 30, dist: 19 },
  { id: 121, name: 'Kolar Gold Fields Police Station',               type: 1, parent: 30, dist: 19 },
  { id: 122, name: 'Chitradurga City Police Station',                type: 1, parent: 21, dist: 10 },
];

const COURTS = [
  // Bengaluru Urban - District 5
  { id: 1,  name: 'Principal District and Sessions Court, Bengaluru',                   dist: 5  },
  { id: 2,  name: 'Additional District and Sessions Court, Bengaluru',                   dist: 5  },
  { id: 3,  name: 'Chief Judicial Magistrate Court, Bengaluru',                          dist: 5  },
  { id: 4,  name: 'Additional Chief Judicial Magistrate Court, Bengaluru',               dist: 5  },
  { id: 5,  name: 'Principal Civil Judge (Senior Division) Court, Bengaluru',             dist: 5  },
  { id: 6,  name: 'Family Court, Bengaluru',                                              dist: 5  },
  { id: 7,  name: 'Motor Accident Claims Tribunal, Bengaluru',                            dist: 5  },
  { id: 8,  name: 'Fast Track Court, Bengaluru',                                          dist: 5  },

  // Mysuru - District 22
  { id: 9,  name: 'District and Sessions Court, Mysuru',                                  dist: 22 },
  { id: 10, name: 'Additional District and Sessions Court, Mysuru',                        dist: 22 },
  { id: 11, name: 'Chief Judicial Magistrate Court, Mysuru',                               dist: 22 },
  { id: 12, name: 'Family Court, Mysuru',                                                   dist: 22 },

  // Belagavi - District 2
  { id: 13, name: 'District and Sessions Court, Belagavi',                                 dist: 2  },
  { id: 14, name: 'Additional District and Sessions Court, Belagavi',                       dist: 2  },
  { id: 15, name: 'Chief Judicial Magistrate Court, Belagavi',                              dist: 2  },

  // Dharwad - District 13
  { id: 16, name: 'District and Sessions Court, Dharwad at Hubballi',                       dist: 13 },
  { id: 17, name: 'Additional District and Sessions Court, Dharwad',                         dist: 13 },
  { id: 18, name: 'Chief Judicial Magistrate Court, Dharwad',                                dist: 13 },

  // Dakshina Kannada - District 11
  { id: 19, name: 'District and Sessions Court, Dakshina Kannada at Mangaluru',              dist: 11 },
  { id: 20, name: 'Additional District and Sessions Court, Mangaluru',                        dist: 11 },
  { id: 21, name: 'Chief Judicial Magistrate Court, Mangaluru',                               dist: 11 },

  // Kalaburagi - District 17
  { id: 22, name: 'District and Sessions Court, Kalaburagi',                                  dist: 17 },
  { id: 23, name: 'Additional District and Sessions Court, Kalaburagi',                        dist: 17 },
  { id: 24, name: 'Chief Judicial Magistrate Court, Kalaburagi',                               dist: 17 },

  // Ballari - District 3
  { id: 25, name: 'District and Sessions Court, Ballari',                                     dist: 3  },
  { id: 26, name: 'Additional District and Sessions Court, Ballari',                           dist: 3  },

  // Davanagere - District 12
  { id: 27, name: 'District and Sessions Court, Davanagere',                                  dist: 12 },
  { id: 28, name: 'Additional District and Sessions Court, Davanagere',                        dist: 12 },

  // Shivamogga - District 25
  { id: 29, name: 'District and Sessions Court, Shivamogga',                                  dist: 25 },

  // Tumakuru - District 26
  { id: 30, name: 'District and Sessions Court, Tumakuru',                                    dist: 26 },

  // Udupi - District 27
  { id: 31, name: 'District and Sessions Court, Udupi',                                       dist: 27 },

  // Hassan - District 15
  { id: 32, name: 'District and Sessions Court, Hassan',                                      dist: 15 },

  // Kolar - District 19
  { id: 33, name: 'District and Sessions Court, Kolar',                                       dist: 19 },

  // Chikkamagaluru - District 9
  { id: 34, name: 'District and Sessions Court, Chikkamagaluru',                               dist: 9  },

  // Raichur - District 23
  { id: 35, name: 'District and Sessions Court, Raichur',                                     dist: 23 },

  // Bidar - District 6
  { id: 36, name: 'District and Sessions Court, Bidar',                                       dist: 6  },

  // Vijayapura - District 30
  { id: 37, name: 'District and Sessions Court, Vijayapura',                                  dist: 30 },

  // Mandya - District 21
  { id: 38, name: 'District and Sessions Court, Mandya',                                      dist: 21 },

  // Chitradurga - District 10
  { id: 39, name: 'District and Sessions Court, Chitradurga',                                 dist: 10 },

  // Bagalkot - District 1
  { id: 40, name: 'District and Sessions Court, Bagalkot',                                    dist: 1  },

  // Gadag - District 14
  { id: 41, name: 'District and Sessions Court, Gadag',                                       dist: 14 },

  // Additional CJM / other courts across districts
  { id: 42, name: 'Chief Judicial Magistrate Court, Bagalkot',                                dist: 1  },
  { id: 43, name: 'Chief Judicial Magistrate Court, Chitradurga',                             dist: 10 },
  { id: 44, name: 'Chief Judicial Magistrate Court, Raichur',                                 dist: 23 },
  { id: 45, name: 'Chief Judicial Magistrate Court, Bidar',                                   dist: 6  },
  { id: 46, name: 'Chief Judicial Magistrate Court, Vijayapura',                              dist: 30 },
  { id: 47, name: 'Family Court, Hubballi',                                                   dist: 13 },
  { id: 48, name: 'Family Court, Mangaluru',                                                  dist: 11 },
  { id: 49, name: 'Fast Track Court, Mysuru',                                                 dist: 22 },
  { id: 50, name: 'Fast Track Court, Belagavi',                                               dist: 2  },
];

console.log('Generating Unit.csv...');
writeCSV('Unit.csv',
  ['UnitID', 'UnitName', 'TypeID', 'ParentUnit', 'NationalityID', 'StateID', 'DistrictID', 'Active'],
  UNITS.map(u => [
    u.id,
    csvEscape(u.name),
    ROWID(unitTypeMap, u.type),
    u.parent === null ? '' : u.parent,
    1,
    S_KARNATAKA,
    ROWID(districtMap, u.dist),
    1
  ])
);
console.log(`  Unit.csv: ${UNITS.length} records`);

console.log('Generating Court.csv...');
writeCSV('Court.csv',
  ['CourtID', 'CourtName', 'DistrictID', 'StateID', 'Active'],
  COURTS.map(c => [
    c.id,
    csvEscape(c.name),
    ROWID(districtMap, c.dist),
    S_KARNATAKA,
    1
  ])
);
console.log(`  Court.csv: ${COURTS.length} records`);

console.log('\n=== Phase 2B Generation Complete ===');
