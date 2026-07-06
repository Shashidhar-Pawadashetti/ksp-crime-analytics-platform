'use strict';

var normaliser = require('./normaliser');
var phonetic = require('./phonetic');

var normaliseName = normaliser.normaliseName;
var soundexToken = phonetic.soundexToken;
var indianMetaphoneToken = phonetic.indianMetaphoneToken;

function firstTokenPhoneticKey(rec) {
  var tokens = (rec.normalised_name || '').trim().split(/\s+/);
  if (tokens.length === 0 || !tokens[0]) return '';
  var first = tokens[0];
  return soundexToken(first) + ' ' + indianMetaphoneToken(first);
}

function lastTokenPhoneticKey(rec) {
  var tokens = (rec.normalised_name || '').trim().split(/\s+/);
  if (tokens.length === 0) return '';
  var last = tokens[tokens.length - 1];
  if (!last) return '';
  return soundexToken(last) + ' ' + indianMetaphoneToken(last);
}

function firstInitialSurnameKey(rec) {
  var tokens = (rec.normalised_name || '').trim().split(/\s+/);
  if (tokens.length === 0) return '';
  var firstInitial = tokens[0] ? tokens[0][0] : '';
  var lastToken = tokens[tokens.length - 1];
  if (!firstInitial || !lastToken) return '';
  return firstInitial.toUpperCase() + ':' + soundexToken(lastToken);
}

function surnameAgeBandKey(rec) {
  var tokens = (rec.normalised_name || '').trim().split(/\s+/);
  if (tokens.length === 0) return '';
  var lastToken = tokens[tokens.length - 1];
  var age = rec.age;
  if (!lastToken || age == null) return '';
  var band = Math.floor(age / 5) * 5;
  return soundexToken(lastToken) + ':' + band;
}

function surnameDistrictKey(rec) {
  var tokens = (rec.normalised_name || '').trim().split(/\s+/);
  if (tokens.length === 0) return '';
  var lastToken = tokens[tokens.length - 1];
  var dist = rec.district_id;
  if (!lastToken || !dist) return '';
  return soundexToken(lastToken) + ':' + String(dist);
}

var STRATEGIES = [
  { name: 'first_token_phonetic', fn: firstTokenPhoneticKey },
  { name: 'last_token_phonetic', fn: lastTokenPhoneticKey },
  { name: 'first_initial_surname', fn: firstInitialSurnameKey },
  { name: 'surname_age_band', fn: surnameAgeBandKey }
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
  firstTokenPhoneticKey: firstTokenPhoneticKey,
  lastTokenPhoneticKey: lastTokenPhoneticKey,
  firstInitialSurnameKey: firstInitialSurnameKey,
  surnameAgeBandKey: surnameAgeBandKey,
  surnameDistrictKey: surnameDistrictKey,
  buildBlocks: buildBlocks,
  generateUniquePairs: generateUniquePairs,
  generateUniquePairsWithStrategy: generateUniquePairsWithStrategy
};
