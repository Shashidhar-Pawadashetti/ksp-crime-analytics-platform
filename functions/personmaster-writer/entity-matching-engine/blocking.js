'use strict';

var normaliser = require('./normaliser');
var phonetic = require('./phonetic');

var normaliseName = normaliser.normaliseName;
var soundexToken = phonetic.soundexToken;
var indianMetaphoneToken = phonetic.indianMetaphoneToken;

/**
 * LLD §3.2 — Single phonetic block key strategy.
 *
 * Block key = soundex(first_token) + " " + IM(first_token)
 *
 * Only records in the same bucket are compared pairwise.
 * This is the ONLY blocking strategy used (per LLD specification).
 */
function lldPhoneticBlockKey(rec) {
  var tokens = (rec.normalised_name || '').trim().split(/\s+/);
  if (tokens.length === 0 || !tokens[0]) return '';
  var first = tokens[0];
  return soundexToken(first) + ' ' + indianMetaphoneToken(first);
}

var STRATEGIES = [
  { name: 'lld_phonetic_block_key', fn: lldPhoneticBlockKey }
];

function buildBlocks(records, keyFn) {
  var blocks = {};
  for (var ri = 0; ri < records.length; ri++) {
    var rec = records[ri];
    var key = keyFn(rec);
    if (!key) continue;
    if (!blocks[key]) blocks[key] = [];
    blocks[key].push(rec);
  }
  return blocks;
}

function generateUniquePairs(records) {
  var pairSet = {};
  var pairs = [];

  for (var si = 0; si < STRATEGIES.length; si++) {
    var strat = STRATEGIES[si];
    var blocks = buildBlocks(records, strat.fn);

    for (var bk in blocks) {
      var group = blocks[bk];
      if (group.length < 2) continue;

      for (var i = 0; i < group.length; i++) {
        for (var j = i + 1; j < group.length; j++) {
          var a = group[i];
          var b = group[j];

          if (a.source_id === b.source_id && a.source_table === b.source_table) continue;

          var pairKey;
          if (a.source_id < b.source_id) {
            pairKey = a.source_id + '::' + b.source_id;
          } else {
            pairKey = b.source_id + '::' + a.source_id;
          }

          if (!pairSet[pairKey]) {
            pairSet[pairKey] = true;
            pairs.push({ a: a, b: b });
          }
        }
      }
    }
  }

  return pairs;
}

function generateUniquePairsWithStrategy(records, strategies) {
  var pairSet = {};
  var pairs = [];

  var strats = strategies || STRATEGIES;

  for (var si = 0; si < strats.length; si++) {
    var strat = strats[si];
    var blocks = buildBlocks(records, strat.fn);

    for (var bk in blocks) {
      var group = blocks[bk];
      if (group.length < 2) continue;

      for (var i = 0; i < group.length; i++) {
        for (var j = i + 1; j < group.length; j++) {
          var a = group[i];
          var b = group[j];

          if (a.source_id === b.source_id && a.source_table === b.source_table) continue;

          var pairKey;
          if (a.source_id < b.source_id) {
            pairKey = a.source_id + '::' + b.source_id;
          } else {
            pairKey = b.source_id + '::' + a.source_id;
          }

          if (!pairSet[pairKey]) {
            pairSet[pairKey] = true;
            pairs.push({ a: a, b: b });
          }
        }
      }
    }
  }

  return pairs;
}

module.exports = {
  STRATEGIES: STRATEGIES,
  lldPhoneticBlockKey: lldPhoneticBlockKey,
  buildBlocks: buildBlocks,
  generateUniquePairs: generateUniquePairs,
  generateUniquePairsWithStrategy: generateUniquePairsWithStrategy
};
