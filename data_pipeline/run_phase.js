import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdir } from 'fs/promises';
import { writeCSV } from './src/helpers/csv.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const MAPPING_SCRIPT = join(__dirname, 'generate_rowid_mappings.js');

const PHASES = {
  phase1: {
    label: 'Phase 1: Independent Lookup Tables',
    generators: [
      'state', 'district', 'caseCategory', 'gravityOffence',
      'crimeHead', 'act', 'section', 'crimeSubHead',
      'crimeHeadActSection', 'religionMaster', 'casteMaster',
      'occupationMaster', 'caseStatusMaster', 'unitType',
      'rank', 'designation',
    ],
  },
};

let _phaseLog = [];

function log(...args) {
  const msg = args.join(' ');
  _phaseLog.push(msg);
  console.log(msg);
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
      process.stdout.write(d);
    });
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `Exit code ${code}`));
    });
    proc.on('error', reject);
  });
}

function parseJobId(output) {
  const match =
    output.match(/[Jj]ob\s*[Ii][Dd]\s*:?\s*(\S+)/) ||
    output.match(/[Jj]ob[_-][Ii][Dd]\s*:?\s*(\S+)/) ||
    output.match(/job_id[": ]+(\S+)/);
  return match ? match[1] : null;
}

async function waitForImport(jobId) {
  for (let attempts = 0; attempts < 60; attempts++) {
    const output = await runCommand('catalyst', ['ds:status', 'write', jobId]);
    if (/completed|success/i.test(output)) return;
    if (/failed|error/i.test(output)) {
      throw new Error(`Import job ${jobId} failed: ${output}`);
    }
    await delay(5000);
  }
  throw new Error(`Import job ${jobId} timed out after 5 minutes`);
}

async function generateCSV(genName) {
  const mod = await import(`./src/generators/${genName}.js`);
  const result = await writeCSV(DATA_DIR, mod);
  return { module: mod, result };
}

async function importToCatalyst(csvPath, tableName) {
  log(`  Importing ${tableName}...`);
  const output = await runCommand('catalyst', [
    'ds:import', csvPath, '--table', tableName,
  ]);
  const jobId = parseJobId(output);
  if (jobId) {
    log(`  Job ${jobId} in progress...`);
    await waitForImport(jobId);
  }
  log(`  ✓ ${tableName} imported`);
}

async function generateMappings() {
  log(`\n--- Generating ROWID mappings ---`);
  await runCommand('node', [MAPPING_SCRIPT]);
  log(`  ✓ Mappings generated`);
}

async function runPhaseTable(genName) {
  log(`\n--- ${genName} ---`);

  const { module: mod } = await generateCSV(genName);

  const csvPath = join(DATA_DIR, mod.FILE_NAME);
  await importToCatalyst(csvPath, mod.TABLE_NAME);

  return mod.TABLE_NAME;
}

async function main() {
  const phaseName = process.argv[2];
  if (!phaseName || !PHASES[phaseName]) {
    log(
      `Usage: node run_phase.js <phase>\n` +
      `Available: ${Object.keys(PHASES).join(', ')}`
    );
    process.exit(1);
  }

  const phase = PHASES[phaseName];
  log(`\n=== ${phase.label} ===`);
  await mkdir(DATA_DIR, { recursive: true });

  const imported = [];

  for (const genName of phase.generators) {
    const tableName = await runPhaseTable(genName);
    imported.push(tableName);
  }

  if (imported.length > 0) {
    await generateMappings();
  }

  log(`\n=== ${phase.label} Complete ===`);
  log(`Tables processed: ${imported.length}`);
}

main().catch((err) => {
  console.error(`\n✗ Failed: ${err.message}`);
  process.exit(1);
});
