import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeCSV } from './helpers/csv.js';

import * as StateGenerator from './generators/state.js';
import * as DistrictGenerator from './generators/district.js';
import * as CaseCategoryGenerator from './generators/caseCategory.js';
import * as GravityOffenceGenerator from './generators/gravityOffence.js';
import * as CrimeHeadGenerator from './generators/crimeHead.js';
import * as ActGenerator from './generators/act.js';
import * as SectionGenerator from './generators/section.js';
import * as CrimeSubHeadGenerator from './generators/crimeSubHead.js';
import * as CrimeHeadActSectionGenerator from './generators/crimeHeadActSection.js';
import * as ReligionMasterGenerator from './generators/religionMaster.js';
import * as CasteMasterGenerator from './generators/casteMaster.js';
import * as OccupationMasterGenerator from './generators/occupationMaster.js';
import * as CaseStatusMasterGenerator from './generators/caseStatusMaster.js';
import * as UnitTypeGenerator from './generators/unitType.js';
import * as RankGenerator from './generators/rank.js';
import * as DesignationGenerator from './generators/designation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

const PHASE_1_GENERATORS = [
  ['State', StateGenerator],
  ['District', DistrictGenerator],
  ['CaseCategory', CaseCategoryGenerator],
  ['GravityOffence', GravityOffenceGenerator],
  ['CrimeHead', CrimeHeadGenerator],
  ['Act', ActGenerator],
  ['Section', SectionGenerator],
  ['CrimeSubHead', CrimeSubHeadGenerator],
  ['CrimeHeadActSection', CrimeHeadActSectionGenerator],
  ['ReligionMaster', ReligionMasterGenerator],
  ['CasteMaster', CasteMasterGenerator],
  ['OccupationMaster', OccupationMasterGenerator],
  ['CaseStatusMaster', CaseStatusMasterGenerator],
  ['UnitType', UnitTypeGenerator],
  ['Rank', RankGenerator],
  ['Designation', DesignationGenerator],
];

async function runPhase() {
  console.log('=== Phase 1: Independent Lookup Tables ===\n');
  const results = [];

  for (const [name, generator] of PHASE_1_GENERATORS) {
    try {
      const result = await writeCSV(DATA_DIR, generator);
      results.push(result);
    } catch (err) {
      console.error(`  ERROR: ${name}: ${err.message}`);
    }
  }

  const total = results.reduce((sum, r) => sum + r.count, 0);
  console.log(`\n=== Phase 1 Complete ===`);
  console.log(`Tables generated: ${results.length}`);
  console.log(`Total records:    ${total}`);
  console.log(`Output directory: ${DATA_DIR}`);
}

runPhase().catch((err) => {
  console.error('Phase 1 failed:', err);
  process.exit(1);
});
