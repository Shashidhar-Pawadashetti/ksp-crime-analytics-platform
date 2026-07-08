'use strict';

var signalHandler = require('./signalHandler');

async function handler(req, res) {
  try {
    var body = await parseBody(req);

    if (!body.event || !body.record) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'event and record are required' }));
      return;
    }

    var result = await signalHandler.processSignal(body.event, body.record);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'success',
      matched: result.matched,
      person_id: result.personId,
      person_name: result.personName,
      source_records: result.sourceRecords,
      total_edges: result.totalEdges,
      elapsed: result.elapsed
    }, null, 2));
  } catch (err) {
    console.error('Sync handler error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function parseBody(req) {
  return new Promise(function(resolve, reject) {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

if (require.main === module) {
  console.log('Usage: node simulate-signal.js [mode]');
  console.log('  or:    node index.js (as Catalyst AdvancedIO function)');
}

module.exports = handler;
