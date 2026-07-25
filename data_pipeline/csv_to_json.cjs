'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ZIP_DIR = 'C:\\Users\\samru\\Documents\\projects\\crime_ai\\zips';
const JSON_DIR = path.join(__dirname, 'kb_export');

const CATALYST_COLS = ['CREATORID', 'CREATEDTIME', 'MODIFIEDTIME'];

const TABLES = [
  'State', 'District', 'CaseCategory', 'GravityOffence', 'CrimeHead',
  'Act', 'Section', 'CrimeSubHead', 'CrimeHeadActSection',
  'ReligionMaster', 'CasteMaster', 'OccupationMaster', 'CaseStatusMaster',
  'UnitType', 'Rank', 'Designation', 'Employee', 'Unit', 'Court',
  'CaseMaster', 'ComplainantDetails', 'Victim', 'Accused',
  'ActSectionAssociation', 'ChargesheetDetails', 'ArrestSurrender',
];

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
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function stripCatalystCols(headers, vals) {
  const catIdx = new Set();
  for (let i = 0; i < headers.length; i++) {
    if (CATALYST_COLS.includes(headers[i])) catIdx.add(i);
  }
  return {
    headers: headers.filter((_, i) => !catIdx.has(i)),
    vals: vals.map(arr => arr.filter((_, i) => !catIdx.has(i))),
  };
}

function cleanVal(v) {
  return v.replace(/\r$/, '');
}

function csvToRowsFromZip(filePath, csvName) {
  const raw = execSync(`tar -xzf "${filePath}" -O "${csvName}"`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  if (!raw || !raw.trim()) return null;
  const lines = raw.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(cleanVal);
  const allVals = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]).map(cleanVal);
    if (vals.length <= 1 && vals[0] === '') continue;
    allVals.push(vals);
  }
  const stripped = stripCatalystCols(headers, allVals);
  const rows = stripped.vals.map(v => {
    const row = {};
    for (let h = 0; h < stripped.headers.length && h < v.length; h++) {
      row[stripped.headers[h]] = v[h];
    }
    return row;
  });
  return { headers: stripped.headers, rows };
}

function findZipForTable(zipDir, tableName) {
  const csvName = `Table-${tableName}.csv`;
  const files = fs.readdirSync(zipDir).filter(f => f.endsWith('.zip'));
  for (const f of files) {
    const fp = path.join(zipDir, f);
    const listing = execSync(`tar -tzf "${fp}"`, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
    if (listing.split('\n').map(l => l.trim()).includes(csvName)) {
      return { zipPath: fp, csvName };
    }
  }
  return null;
}

function main() {
  if (!fs.existsSync(ZIP_DIR)) {
    console.log(`ZIP directory not found: ${ZIP_DIR}`);
    console.log('Please make sure Catalyst exports are downloaded to this directory.');
    return;
  }
  fs.mkdirSync(JSON_DIR, { recursive: true });

  let converted = 0;
  let missing = 0;

  for (const name of TABLES) {
    const jsonPath = path.join(JSON_DIR, `${name}.json`);
    const found = findZipForTable(ZIP_DIR, name);

    if (!found) {
      console.log(`  SKIP: ${name} — no ZIP with Table-${name}.csv found`);
      missing++;
      continue;
    }

    const result = csvToRowsFromZip(found.zipPath, found.csvName);
    if (!result || result.rows.length === 0) {
      console.log(`  SKIP: ${name} — empty CSV in ZIP`);
      missing++;
      continue;
    }

    const jsonOut = JSON.stringify({
      table: name,
      columns: result.headers,
      rows: result.rows,
    }, null, 2);

    fs.writeFileSync(jsonPath, jsonOut, 'utf8');
    console.log(`  OK:   ${name}.json (${result.rows.length} rows)`);
    converted++;
  }

  console.log(`\nDone: ${converted} converted, ${missing} missing`);
}

main();
