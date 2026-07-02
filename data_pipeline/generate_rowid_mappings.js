import catalyst from 'zcatalyst-sdk-node';
import { readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAPPINGS_DIR = join(__dirname, 'mappings');
const PROJECT_ROOT = resolve(__dirname, '..');

function buildKeyFn(keyFields) {
  if (keyFields.length === 1) {
    const field = keyFields[0];
    return (record) => String(record[field]);
  }
  return (record) => keyFields.map((f) => record[f]).join('_');
}

const TABLES = [
  { name: 'State',              keyFields: ['StateID'] },
  { name: 'District',           keyFields: ['DistrictID'] },
  { name: 'CaseCategory',       keyFields: ['CaseCategoryID'] },
  { name: 'GravityOffence',     keyFields: ['GravityOffenceID'] },
  { name: 'CrimeHead',          keyFields: ['CrimeHeadID'] },
  { name: 'CrimeSubHead',       keyFields: ['CrimeSubHeadID'] },
  { name: 'Act',                keyFields: ['ActCode'] },
  { name: 'Section',            keyFields: ['ActCode', 'SectionCode'] },
  { name: 'CrimeHeadActSection', keyFields: ['CrimeHeadID', 'ActCode', 'SectionCode'] },
  { name: 'ReligionMaster',     keyFields: ['ReligionID'] },
  { name: 'CasteMaster',        keyFields: ['caste_master_id'] },
  { name: 'OccupationMaster',   keyFields: ['OccupationID'] },
  { name: 'CaseStatusMaster',   keyFields: ['CaseStatusID'] },
  { name: 'UnitType',           keyFields: ['UnitTypeID'] },
  { name: 'Rank',               keyFields: ['RankID'] },
  { name: 'Designation',        keyFields: ['DesignationID'] },
];

async function fetchTable({ name, keyFields }, dataStore) {
  const toKey = buildKeyFn(keyFields);
  const table = dataStore.table(name);

  const mapping = {};
  let count = 0;

  for await (const row of table.getIterableRows()) {
    const key = toKey(row);
    mapping[key] = String(row.ROWID);
    count++;
  }

  return { tableName: name, mapping, count };
}

async function writeMapping({ tableName, mapping, count }) {
  const filePath = join(MAPPINGS_DIR, `${tableName}.json`);
  await writeFile(filePath, JSON.stringify(mapping, null, 2));
  console.log(`✓ ${tableName} (${count} records)`);
}

function loadCatalystConfig() {
  const rcPath = join(PROJECT_ROOT, '.catalystrc');
  const rc = JSON.parse(readFileSync(rcPath, 'utf8'));
  const proj = rc.projects[rc.actives.project - 1];
  const envObj = proj.env[rc.actives.env - 1];
  const projectKey = process.env.CATALYST_PROJECT_KEY;
  if (!projectKey) {
    throw new Error(
      'CATALYST_PROJECT_KEY env var is not set. ' +
      'Get it from Catalyst Console > Project Settings > Project Key.'
    );
  }
  return {
    project_id: proj.id,
    project_key: projectKey,
    environment: envObj.name,
  };
}

async function main() {
  const appOptions = loadCatalystConfig();
  const app = catalyst.initializeApp(appOptions);
  const dataStore = app.datastore();

  await mkdir(MAPPINGS_DIR, { recursive: true });

  for (const config of TABLES) {
    try {
      const result = await fetchTable(config, dataStore);
      await writeMapping(result);
    } catch (err) {
      console.error(`✗ ${config.name}: ${err.message}`);
    }
  }

  console.log('\nMappings generated successfully.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
