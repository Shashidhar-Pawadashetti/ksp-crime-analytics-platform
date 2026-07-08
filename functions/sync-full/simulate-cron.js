'use strict';

var pipeline = require('./pipeline');

async function main() {
  var isDryRun = process.argv.indexOf('--dry-run') !== -1 || process.argv.indexOf('--dryrun') !== -1;

  console.log('================================================================================');
  console.log('  FULL GRAPH REBUILD  \u2014  LOCAL SIMULATION' + (isDryRun ? ' (DRY RUN)' : ''));
  console.log('================================================================================');

  try {
    var result = await pipeline.run({ dryRun: isDryRun });
    console.log('\nPipeline completed successfully.');
    console.log('Status: ' + result.status);
    process.exit(0);
  } catch (err) {
    console.error('\nPipeline failed:', err.message);
    process.exit(1);
  }
}

main();
