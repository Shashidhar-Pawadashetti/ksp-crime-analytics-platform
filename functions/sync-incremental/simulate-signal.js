'use strict';

var signalHandler = require('./signalHandler');

function generateSyntheticAccused() {
  var rnd = Math.floor(Math.random() * 10000);
  return {
    source_table: 'Accused',
    source_id: 'A-SIM-' + rnd,
    name: 'TestPerson_' + rnd,
    age: 20 + (rnd % 50),
    gender: rnd % 2 === 0 ? 'M' : 'F',
    case_id: 'SIM_CASE_' + rnd
  };
}

function findExistingAccused(records, index) {
  if (index >= records.length) return null;
  var record = records[index];
  return {
    source_table: 'Accused',
    source_id: record.source_id,
    name: record.name,
    age: record.age,
    gender: record.gender,
    case_id: record.case_id
  };
}

function printUsage() {
  console.log('Usage: node simulate-signal.js [mode]');
  console.log('');
  console.log('Modes:');
  console.log('  synthetic    Generate a random new person (default)');
  console.log('  existing N   Use the Nth source record from PM_000001');
  console.log('               (simulates an UPDATE to an existing record)');
  console.log('  help         Show this help');
  console.log('');
  console.log('Examples:');
  console.log('  node simulate-signal.js synthetic');
  console.log('  node simulate-signal.js existing 0');
  process.exit(0);
}

async function main() {
  var args = process.argv.slice(2);
  var mode = 'synthetic';
  var argIdx = 0;

  if (args.length > 0) {
    mode = args[0];
    if (mode === 'help' || mode === '--help') printUsage();
    if (args.length > 1) argIdx = parseInt(args[1], 10) || 0;
  }

  var record;

  if (mode === 'existing') {
    var documents = JSON.parse(
      require('fs').readFileSync(
        require('path').join(__dirname, '..', 'personmaster-builder', 'output', 'personmaster_documents.json'),
        'utf8'
      )
    );

    var doc = documents[0];
    if (!doc || !doc.source_records || argIdx >= doc.source_records.length) {
      console.error('Error: PM_000001 has ' +
        (doc ? doc.source_records.length : 0) + ' source_records, cannot access index ' + argIdx);
      process.exit(1);
    }

    var sr = doc.source_records[argIdx];
    var sourceData = require('../personmaster-builder/documentBuilder').loadSourceData();
    var fullRecord = sourceData.sourceByKey[sr.table + ':' + sr.source_id];

    if (!fullRecord) {
      console.error('Error: Could not find source record ' + sr.table + ':' + sr.source_id);
      process.exit(1);
    }

    record = {
      source_table: fullRecord.table,
      source_id: fullRecord.source_id,
      name: fullRecord.name,
      age: fullRecord.age,
      gender: fullRecord.gender,
      case_id: fullRecord.case_id
    };

    console.log('Using EXISTING record: ' + record.source_table + ':' + record.source_id +
      ' ("' + record.name + '") from ' + doc.person_id + '\n');
  } else {
    record = generateSyntheticAccused();
    console.log('Using SYNTHETIC record: ' + record.source_table + ':' + record.source_id +
      ' ("' + record.name + '", age ' + record.age + ', ' + record.gender + ')\n');
  }

  try {
    var result = await signalHandler.processSignal('SIMULATED_' + mode.toUpperCase(), record);

    console.log('\nSignal processing complete.');
    console.log('Result: ' + (result.matched ? 'MATCHED' : 'NEW PERSON CREATED'));
    console.log('PersonMaster ID: ' + result.personId);
  } catch (err) {
    console.error('\nError during signal processing:', err);
    process.exit(1);
  }
}

main();
