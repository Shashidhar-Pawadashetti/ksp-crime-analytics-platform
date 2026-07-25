'use strict';

/*
 * deploy-prep.js — Build-time dependency bundling for sync-full-job.
 *
 * Copies fullReconciler.js and its vendor dependencies from sync-full
 * so sync-full-job can call fullReconcile() directly.
 *
 * The fullReconciler.js is copied to the function root (NOT into vendor/)
 * because its vendorRequire resolves paths relative to its own location
 * using './vendor/entity-matching-engine/...'.
 *
 * After bundling, verifies every required runtime dependency exists.
 *
 * Run BEFORE `catalyst deploy --only "functions:sync-full-job"`:
 *   node deploy-prep.js
 */

var fs = require('fs');
var path = require('path');

var jobDir = __dirname;
var syncFullDir = path.join(__dirname, '..', 'sync-full');

/* ------------------------------------------------------------------ */
/*  Copy fullReconciler.js to function root                           */
/* ------------------------------------------------------------------ */

fs.copyFileSync(
  path.join(syncFullDir, 'fullReconciler.js'),
  path.join(jobDir, 'fullReconciler.js')
);
console.log('  \u2713 fullReconciler.js');

/* ------------------------------------------------------------------ */
/*  Copy entire vendor tree from sync-full                            */
/* ------------------------------------------------------------------ */

var srcVendor = path.join(syncFullDir, 'vendor');
var destVendor = path.join(jobDir, 'vendor');

function copyRecursive(src, dest) {
  var entries = fs.readdirSync(src, { withFileTypes: true });
  fs.mkdirSync(dest, { recursive: true });
  entries.forEach(function (e) {
    var s = path.join(src, e.name);
    var d = path.join(dest, e.name);
    if (e.isDirectory()) copyRecursive(s, d);
    else fs.copyFileSync(s, d);
  });
}

if (fs.existsSync(srcVendor)) {
  copyRecursive(srcVendor, destVendor);
  console.log('  \u2713 vendor/ (entity-matching-engine, personmaster-writer)');
} else {
  console.log('  ! vendor/ not found in sync-full — run sync-full deploy-prep first');
}

/* ------------------------------------------------------------------ */
/*  Build verification — fail fast if any dependency is missing       */
/* ------------------------------------------------------------------ */

var requiredFiles = [
  'fullReconciler.js',
  'vendor/entity-matching-engine/normaliser.js',
  'vendor/entity-matching-engine/phonetic.js',
  'vendor/entity-matching-engine/blocking.js',
  'vendor/entity-matching-engine/scorer.js',
  'vendor/entity-matching-engine/threshold.js',
  'vendor/personmaster-writer/documentBuilder.js',
  'vendor/personmaster-writer/edgeGenerator.js',
  'vendor/personmaster-writer/edgePersistence.js',
  'vendor/personmaster-writer/edgeModel.js',
  'vendor/personmaster-writer/edgeTypes.js',
  'vendor/personmaster-writer/resolution-audit-log.js'
];

var allOk = true;
requiredFiles.forEach(function (f) {
  var fullPath = path.join(jobDir, f);
  if (!fs.existsSync(fullPath)) {
    console.error('  \u2717 BUILD FAIL: Missing ' + f);
    allOk = false;
  }
});

if (!allOk) {
  console.error('[deploy-prep] BUILD FAILED — missing required dependencies');
  process.exit(1);
}

console.log('[deploy-prep] Build verification: all ' + requiredFiles.length + ' dependencies present');
console.log('[deploy-prep] sync-full-job vendor bundle complete');
