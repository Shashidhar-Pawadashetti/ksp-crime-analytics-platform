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
const districtMap = loadJSON('district');
const rankMap = loadJSON('rank');
const designationMap = loadJSON('designation');

function intMap(m) { const r = {}; for (const [k, v] of Object.entries(m)) r[parseInt(k)] = v; return r; }
const unitROWID = intMap(unitMap);
const districtROWID = intMap(districtMap);
const rankROWID = intMap(rankMap);
const designationROWID = intMap(designationMap);

function parseLine(line) {
	const res = []; let cur = '', inq = false;
	for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') inq = !inq; else if (ch === ',' && !inq) { res.push(cur); cur = ''; } else cur += ch; }
	res.push(cur); return res;
}

const unitLines = loadCSV('Unit');
const uH = parseLine(unitLines[0]);
const uI = {}; uH.forEach((n, i) => uI[n] = i);

const units = [];
for (let i = 1; i < unitLines.length; i++) {
	const c = parseLine(unitLines[i]);
	units.push({
		id: parseInt(c[uI.UnitID]),
		type: parseInt(c[uI.TypeID]),
		dist: c[uI.DistrictID],
	});
}

function seededRandom(seed) {
	let s = seed % 2147483647; if (s <= 0) s += 2147483646;
	return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
const RNG = seededRandom(20260704);

function randomInt(min, max) { return min + Math.floor(RNG() * (max - min + 1)); }
function pick(arr) { return arr[Math.floor(RNG() * arr.length)]; }

const maleFirst = ['Aarav','Vihaan','Vivaan','Ansh','Reyansh','Shaurya','Ayaan','Krishna','Ishaan','Arjun','Rudra','Pranav','Dhruv','Rohan','Siddharth','Yash','Amit','Rahul','Rajesh','Sanjay','Vijay','Deepak','Suresh','Mohan','Ravi','Kiran','Mahesh','Manjunath','Chandrashekar','Basavaraj','Siddalinga','Mallikarjun','Gururaj','Yadunandan','Shankar','Prakash','Venkatesh','Nagaraj','Naveen','Harish','Manish','Vinay','Akash','Pavan','Bheemesh','Hemanth','Jagadish','Eashwar','Satish','Ramachandra','Narasimha'];
const femaleFirst = ['Aanya','Diya','Ishita','Myra','Saanvi','Neha','Kavya','Priya','Riya','Aditi','Pooja','Nandini','Lakshmi','Bhagya','Shwetha','Usha','Asha','Radha','Sita','Geeta','Uma','Kaveri','Mala','Roopa','Shobha','Padma','Hema','Revathi','Pallavi','Madhuri','Kavitha','Rani','Lalitha','Nalini','Sharada','Indira','Gowri','Savitri','Deepika','Chandrika','Yamuna','Tara'];
const lastNames = ['Patil','Deshmukh','Kulkarni','Joshi','Shinde','More','Pawar','Jadhav','Mahajan','Ghorpade','Hegde','Shetty','Rao','Nayak','Naik','Kamat','Acharya','Bhat','Mallya','Murthy','Aiyappa','Gowda','Reddy','Kumar','Singh','Verma','Sharma','Gupta','Das','Nair','Menon','Pillai','Iyer','Iyengar','Chowdhury','Banerjee','Mukherjee','Sarkar','Bose','Sen','Ganguly','Bhatt','Trivedi','Mehta','Shah','Thakur','Yadav','Chauhan','Rajput'];

function generateName() {
	const gender = RNG() > 0.5 ? 'M' : 'F';
	const first = gender === 'M' ? pick(maleFirst) : pick(femaleFirst);
	return first + ' ' + pick(lastNames);
}

function generateFirstName() {
	return RNG() > 0.5 ? pick(maleFirst) : pick(femaleFirst);
}

function generateRank(unitType) {
	const weights = {
		1:  { 1: 35, 2: 25, 3: 15, 4: 12, 5: 8, 6: 3, 7: 1, 8: 1 },
		2:  { 1: 20, 2: 15, 3: 10, 4: 15, 5: 15, 6: 10, 7: 5, 8: 5, 9: 3, 10: 2 },
		3:  { 1: 25, 2: 20, 3: 15, 4: 12, 5: 10, 6: 8, 7: 5, 8: 3, 9: 2 },
		4:  { 3: 5, 4: 15, 5: 20, 6: 20, 7: 15, 8: 10, 9: 8, 10: 5, 11: 2 },
		5:  { 3: 3, 4: 5, 5: 10, 6: 12, 7: 15, 8: 15, 9: 12, 10: 10, 11: 10, 12: 8 },
		6:  { 1: 30, 2: 25, 3: 15, 4: 12, 5: 8, 6: 5, 7: 3, 8: 2 },
		7:  { 1: 20, 2: 15, 3: 10, 4: 15, 5: 15, 6: 10, 7: 8, 8: 5, 9: 2 },
	};
	const w = weights[unitType] || weights[1];
	const total = Object.values(w).reduce((a, b) => a + b, 0);
	let r = RNG() * total;
	for (const [rank, weight] of Object.entries(w)) {
		r -= weight;
		if (r <= 0) return parseInt(rank);
	}
	return 1;
}

function rankToDesignation(rankID) {
	const map = {
		1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6,
		7: 7, 8: 9, 9: 10, 10: 14, 11: 11, 12: 12,
	};
	return map[rankID] || 1;
}

function randomDate(rng, startYear, endYear) {
	const start = new Date(startYear, 0, 1).getTime();
	const end = new Date(endYear, 11, 31).getTime();
	return new Date(start + rng() * (end - start));
}

function formatDate(d) {
	return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function generateKGID(empID) {
	return 'KGP' + String(empID).padStart(7, '0');
}

const bloodGroups = ['1', '2', '3', '4', '5', '6', '7', '8'];
function pickBloodGroup(rng) { return pick(bloodGroups); }

const employeeCount = 1000;
const records = [];
const genderWeights = { '1': 70, '2': 30 };

function randomGender(rng) {
	const r = rng() * 100;
	if (r < 70) return 1;
	return 2;
}

const employeesPerUnit = {};
for (const u of units) {
	let count;
	if (u.type === 1) count = randomInt(5, 18);
	else if (u.type === 2) count = randomInt(20, 50);
	else if (u.type === 3) count = randomInt(8, 20);
	else if (u.type === 4) count = randomInt(5, 12);
	else if (u.type === 5) count = randomInt(40, 80);
	else if (u.type === 6) count = randomInt(8, 20);
	else if (u.type === 7) count = randomInt(5, 15);
	else count = randomInt(3, 10);
	employeesPerUnit[u.id] = count;
}

let totalAllocated = Object.values(employeesPerUnit).reduce((a, b) => a + b, 0);
const scale = employeeCount / totalAllocated;

let employeeID = 0;
for (const u of units) {
	const target = Math.max(1, Math.round(employeesPerUnit[u.id] * scale));
	for (let i = 0; i < target; i++) {
		employeeID++;
		if (employeeID > employeeCount) break;
		const rank = generateRank(u.type);
		const gender = randomGender(RNG);
		const dob = randomDate(RNG, 1965, 2000);
		const joined = randomDate(RNG, 1985, 2023);
		records.push({
			EmployeeID: employeeID,
			FirstName: generateFirstName(),
			RankID: rankROWID[rank],
			UnitID: unitROWID[u.id],
			DistrictID: u.dist,
			DesignationID: designationROWID[rankToDesignation(rank)],
			KGID: generateKGID(employeeID),
			EmployeeDOB: formatDate(dob),
			GenderID: gender,
			BloodGroupID: pickBloodGroup(RNG),
			PhysicallyChallenged: RNG() < 0.02 ? 1 : 0,
			AppointmentDate: formatDate(joined),
		});
	}
	if (employeeID >= employeeCount) break;
}

while (employeeID < employeeCount) {
	employeeID++;
	const u = pick(units);
	const rank = generateRank(u.type);
	const gender = randomGender(RNG);
	const dob = randomDate(RNG, 1965, 2000);
	const joined = randomDate(RNG, 1985, 2023);
	records.push({
		EmployeeID: employeeID,
		FirstName: generateFirstName(),
		RankID: rankROWID[rank],
		UnitID: unitROWID[u.id],
		DistrictID: u.dist,
		DesignationID: designationROWID[rankToDesignation(rank)],
		KGID: generateKGID(employeeID),
		EmployeeDOB: formatDate(dob),
		GenderID: gender,
		BloodGroupID: pickBloodGroup(RNG),
		PhysicallyChallenged: RNG() < 0.02 ? 1 : 0,
		AppointmentDate: formatDate(joined),
	});
}

const columns = ['EmployeeID', 'FirstName', 'KGID', 'RankID', 'DesignationID', 'UnitID', 'DistrictID', 'EmployeeDOB', 'GenderID', 'BloodGroupID', 'PhysicallyChallenged', 'AppointmentDate'];
const csvLines = [columns.join(',')];
for (const rec of records) {
	const line = columns.map(col => {
		const val = rec[col];
		if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
			return '"' + val.replace(/"/g, '""') + '"';
		}
		return val;
	}).join(',');
	csvLines.push(line);
}

fs.writeFileSync(path.join(DATA_DIR, 'Employee.csv'), csvLines.join('\n'), 'utf-8');
console.log(`Generated ${records.length} Employee records -> data/Employee.csv`);

const unitDist = {};
for (const rec of records) {
	const uid = Object.keys(unitMap).find(k => unitMap[k] === rec.UnitID);
	if (uid) {
		if (!unitDist[uid]) unitDist[uid] = 0;
		unitDist[uid]++;
	}
}
console.log(`Employees distributed across ${Object.keys(unitDist).length} units`);
