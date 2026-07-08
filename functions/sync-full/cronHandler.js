'use strict';

var pipeline = require('./pipeline');

async function handleCron(event) {
  console.log('Catalyst Cron triggered:', JSON.stringify(event || {}));

  var t0 = Date.now();

  try {
    var result = await pipeline.run({ dryRun: false });
    var elapsed = Date.now() - t0;

    return {
      status: 'SUCCESS',
      documents: result.documents,
      edges: result.edges,
      elapsed_ms: elapsed
    };
  } catch (err) {
    var elapsed = Date.now() - t0;
    console.error('Cron job failed after ' + elapsed + 'ms:', err.message);

    return {
      status: 'FAILED',
      error: err.message,
      elapsed_ms: elapsed
    };
  }
}

module.exports = { handleCron };
