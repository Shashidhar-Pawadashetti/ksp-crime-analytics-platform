'use strict';

async function handler(req, res) {
  try {
    var cronHandler = require('./cronHandler');
    var result = await cronHandler.handleCron({ triggeredBy: 'http' });

    var statusCode = result.status === 'SUCCESS' ? 200 : 500;
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Handler error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'FAILED',
      error: err.message
    }));
  }
}

if (require.main === module) {
  console.log('Usage: node simulate-cron.js [--dry-run]');
  console.log('  or:   node index.js (as Catalyst AdvancedIO function)');
}

module.exports = handler;
