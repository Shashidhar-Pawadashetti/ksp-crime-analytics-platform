'use strict';

function printDocumentStats(documents) {
  var aliasCounts = documents.map(function(d) { return d.aliases.length; });
  var sourceRecordCounts = documents.map(function(d) { return d.source_records.length; });
  var totalAliases = aliasCounts.length > 0
    ? aliasCounts.reduce(function(a, b) { return a + b; })
    : 0;
  var avgAliases = documents.length > 0
    ? (totalAliases / documents.length).toFixed(1)
    : '0.0';
  var maxAliases = aliasCounts.length > 0
    ? Math.max.apply(null, aliasCounts)
    : 0;
  var maxSourceRecords = sourceRecordCounts.length > 0
    ? Math.max.apply(null, sourceRecordCounts)
    : 0;
  var avgSourceRecords = documents.length > 0
    ? (sourceRecordCounts.reduce(function(a, b) { return a + b; }) / documents.length).toFixed(1)
    : '0.0';

  var totalAccused = 0;
  var totalVictim = 0;
  var totalComplainant = 0;
  for (var di = 0; di < documents.length; di++) {
    totalAccused += documents[di].roles_summary.accused_count;
    totalVictim += documents[di].roles_summary.victim_count;
    totalComplainant += documents[di].roles_summary.complainant_count;
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('  PERSONMASTER DOCUMENT BUILDER  \u2014  STATISTICS');
  console.log('='.repeat(60));
  console.log('  Documents generated:        ' + documents.length);
  console.log('  Average aliases per doc:    ' + avgAliases);
  console.log('  Largest alias set:          ' + maxAliases);
  console.log('  Largest source_record set:  ' + maxSourceRecords);
  console.log('  Avg source records per doc: ' + avgSourceRecords);
  console.log('');
  console.log('  Total source records:       ' + (totalAccused + totalVictim + totalComplainant));
  console.log('    Accused:                  ' + totalAccused);
  console.log('    Victim:                   ' + totalVictim);
  console.log('    ComplainantDetails:       ' + totalComplainant);
  console.log('='.repeat(60));
}

module.exports = { printDocumentStats };
