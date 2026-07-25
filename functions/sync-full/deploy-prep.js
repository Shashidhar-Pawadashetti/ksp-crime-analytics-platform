'use strict';

/*
 * deploy-prep.js — Build-time dependency bundling for sync-full.
 *
 * Copies the required cross-function modules into vendor/ subdirectories
 * so sync-full can be deployed independently on Catalyst.
 *
 * Canonical implementations remain in:
 *   entity-matching-engine/  (normaliser, phonetic, blocking, scorer, threshold)
 *   personmaster-writer/     (documentBuilder, edgeGenerator, edgePersistence,
 *                             resolution-audit-log, edgeModel, edgeTypes)
 *
 * Run BEFORE `catalyst deploy --only "functions:sync-full"`:
 *   node deploy-prep.js
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..', '..');               /* project root (where functions/ lives) */
var FUNCTIONS = path.resolve(ROOT, 'functions');
var VENDOR = path.resolve(__dirname, 'vendor');

/* ------------------------------------------------------------------ */
/*  Dependency map: { vendorRelPath → sourceRelativePath }            */
/* ------------------------------------------------------------------ */

var DEPS = {
  /* entity-matching-engine */
  'entity-matching-engine/normaliser.js':      'functions/entity-matching-engine/normaliser.js',
  'entity-matching-engine/phonetic.js':        'functions/entity-matching-engine/phonetic.js',
  'entity-matching-engine/blocking.js':        'functions/entity-matching-engine/blocking.js',
  'entity-matching-engine/scorer.js':          'functions/entity-matching-engine/scorer.js',
  'entity-matching-engine/threshold.js':       'functions/entity-matching-engine/threshold.js',

  /* personmaster-writer */
  'personmaster-writer/documentBuilder.js':       'functions/personmaster-writer/documentBuilder.js',
  'personmaster-writer/edgeGenerator.js':          'functions/personmaster-writer/edgeGenerator.js',
  'personmaster-writer/edgePersistence.js':        'functions/personmaster-writer/edgePersistence.js',
  'personmaster-writer/resolution-audit-log.js':   'functions/personmaster-writer/resolution-audit-log.js',
  'personmaster-writer/edgeModel.js':              'functions/personmaster-writer/edgeModel.js',
  'personmaster-writer/edgeTypes.js':              'functions/personmaster-writer/edgeTypes.js'
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return dest;
}

/* ------------------------------------------------------------------ */
/*  Main                                                              */
/* ------------------------------------------------------------------ */

var copied = 0;
var errors = [];

Object.keys(DEPS).forEach(function (relPath) {
  var sourceRel = DEPS[relPath];
  var src = path.resolve(ROOT, sourceRel);
  var dest = path.resolve(VENDOR, relPath);

  if (!fs.existsSync(src)) {
    errors.push('SOURCE NOT FOUND: ' + src);
    return;
  }

  copyFile(src, dest);
  copied++;
});

/* ------------------------------------------------------------------ */
/*  Report                                                            */
/* ------------------------------------------------------------------ */

console.log('=== sync-full deploy-prep ===');
console.log('  Vendor root: ' + VENDOR);

if (errors.length > 0) {
  console.log('  Errors:');
  errors.forEach(function (e) { console.log('    ! ' + e); });
}

console.log('  Files copied: ' + copied + ' / ' + Object.keys(DEPS).length);

if (errors.length > 0) {
  console.log('  *** Deployment may fail — missing dependencies ***');
  process.exit(1);
}

console.log('  Ready for catalyst deploy.');
