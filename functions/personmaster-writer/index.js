'use strict';

var fs = require('fs');
var path = require('path');
var writer = require('./writer');
var validator = require('./validator');

var SCRIPT_DIR = __dirname;
var BUILDER_OUTPUT_DIR = path.resolve(SCRIPT_DIR, '..', 'personmaster-builder', 'output');
var DOCUMENTS_PATH = path.resolve(BUILDER_OUTPUT_DIR, 'personmaster_documents.json');
var EDGES_PATH = path.resolve(BUILDER_OUTPUT_DIR, 'personmaster_edges.json');

var BATCH_SIZE = parseInt(process.env.PM_WRITER_BATCH_SIZE, 10) || 75;

async function buildAndWrite(options) {
  console.log('=== PersonMaster Catalyst NoSQL Writer ===\n');

  console.log('Reading PersonMaster documents...');
  if (!fs.existsSync(DOCUMENTS_PATH)) {
    throw new Error('Documents file not found: ' + DOCUMENTS_PATH);
  }
  var documents = JSON.parse(fs.readFileSync(DOCUMENTS_PATH, 'utf8'));
  console.log('  Documents loaded: ' + documents.length);

  if (documents.length === 0) {
    console.log('\nNo documents to write.');
    return { inserted: 0, updated: 0, failed: 0 };
  }

  console.log('Reading PersonMaster edges...');
  if (!fs.existsSync(EDGES_PATH)) {
    throw new Error('Edges file not found: ' + EDGES_PATH);
  }
  var edgeData = JSON.parse(fs.readFileSync(EDGES_PATH, 'utf8'));
  var edges = edgeData.edges || [];
  console.log('  Edges loaded: ' + edges.length + ' (nodes: ' + (edgeData.nodes || 0) + ')');

  var writeOpts = Object.assign({}, options, { batchSize: BATCH_SIZE });

  if (writeOpts.dryRun) {
    console.log('\nDRY RUN MODE - Building adjacency only (no Catalyst write)\n');
  } else {
    console.log('\nWriting to Catalyst NoSQL (PersonMaster table)...');
  }

  var t0 = Date.now();
  var stats = await writer.writeDocuments(documents, edges, writeOpts);
  var totalTime = ((Date.now() - t0) / 1000).toFixed(1);

  var avgBatchDuration = stats.total_batches > 0
    ? ((Date.now() - t0) / stats.total_batches).toFixed(0)
    : '0';

  console.log('\n' + '='.repeat(60));
  console.log('  CATALYST NOSQL WRITER  \u2014  STATISTICS');
  console.log('='.repeat(60));
  console.log('  Mode:                ' + (writeOpts.dryRun ? 'DRY RUN' : 'LIVE'));
  console.log('  Documents inserted:  ' + stats.inserted);
  console.log('  Documents updated:   ' + stats.updated);
  console.log('  Failed writes:       ' + stats.failed);
  console.log('  Total batches:       ' + stats.total_batches);
  console.log('  Elapsed time:        ' + totalTime + 's');
  console.log('  Avg batch duration:  ' + avgBatchDuration + 'ms');
  console.log('='.repeat(60));

  if (!writeOpts.dryRun) {
    await validator.validateWrite(documents, options);
  } else {
    console.log('\n  (Skipped NoSQL validation in dry-run mode)');
  }

  return stats;
}

async function handler(req, res) {
  try {
    var stats = await buildAndWrite();
    var status = stats.failed > 0 ? 207 : 200;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: stats.failed > 0 ? 'partial' : 'success',
      stats: stats,
      message: stats.failed > 0
        ? stats.failed + ' documents failed to write'
        : 'All ' + stats.inserted + ' documents written successfully'
    }));
  } catch (err) {
    console.error('Writer error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

if (require.main === module) {
  var isDryRun = process.argv.indexOf('--dry-run') !== -1 || process.argv.indexOf('--dryrun') !== -1;

  buildAndWrite({ dryRun: isDryRun }).then(function(stats) {
    console.log('\nDone.');
    process.exit(stats.failed > 0 ? 1 : 0);
  }).catch(function(err) {
    console.error('\nFatal error:', err.message);
    process.exit(1);
  });
}

module.exports = handler;
module.exports.buildAndWrite = buildAndWrite;
