'use strict';

/**
 * Build a single PersonMaster document from a cluster of matched source records.
 *
 * Input: matchGroup — array of enriched source records from Accused / Victim /
 * ComplainantDetails that the Entity Matching Engine has determined refer to
 * the same real-world person.
 *
 * This function is PURE — it performs NO Catalyst SDK calls. It only assembles
 * and returns a plain JSON object conforming to the Phase 4 LLD schema.
 *
 * @param {Array}  matchGroup  — array of matched source record objects
 * @param {Object} [options]   — optional overrides
 * @param {string} [options.person_id]           — pre-assigned person_id
 * @param {number} [options.confidence_score]    — pre-computed cluster confidence
 * @param {string} [options.resolution_method]   — default "phonetic_weighted_score_v1"
 * @param {string} [options.resolved_by]         — default "personmaster-writer-v1"
 * @param {string} [options.resolution_run_id]   — run identifier for audit
 * @returns {Object} PersonMaster document (plain JSON)
 */
function buildPersonMaster(matchGroup, options) {
  if (!Array.isArray(matchGroup) || matchGroup.length === 0) {
    throw new Error('matchGroup must be a non-empty array of source records');
  }

  var opts = options || {};

  /* ------------------------------------------------------------------ */
  /*  name_variants  — unique original names sorted alphabetically       */
  /* ------------------------------------------------------------------ */
  var nameSet = {};
  matchGroup.forEach(function (r) {
    var raw = r.name_as_recorded || r.name || '';
    if (raw) nameSet[raw] = true;
  });
  var nameVariants = Object.keys(nameSet).sort();

  /* ------------------------------------------------------------------ */
  /*  name_normalised  — most frequent normalised name                  */
  /* ------------------------------------------------------------------ */
  var nFreq = {};
  matchGroup.forEach(function (r) {
    var n = r.normalised_name || '';
    if (n) nFreq[n] = (nFreq[n] || 0) + 1;
  });
  var nEntries = Object.keys(nFreq).sort(function (a, b) {
    var diff = nFreq[b] - nFreq[a];
    if (diff !== 0) return diff;
    return b.length - a.length; // prefer longer (fuller) name on tie
  });
  var nameNormalised = nEntries.length > 0 ? nEntries[0]
    : (matchGroup[0].normalised_name || '');

  /* ------------------------------------------------------------------ */
  /*  name_phonetic_key  — most common phonetic key in cluster          */
  /* ------------------------------------------------------------------ */
  var kFreq = {};
  matchGroup.forEach(function (r) {
    var k = r.phonetic_key || '';
    if (k) kFreq[k] = (kFreq[k] || 0) + 1;
  });
  var kEntries = Object.keys(kFreq).sort(function (a, b) {
    return kFreq[b] - kFreq[a];
  });
  var namePhoneticKey = kEntries.length > 0 ? kEntries[0]
    : (matchGroup[0].phonetic_key || '');

  /* ------------------------------------------------------------------ */
  /*  Age  — median estimate + min/max range                            */
  /* ------------------------------------------------------------------ */
  var ages = [];
  matchGroup.forEach(function (r) {
    var a = r.age_as_recorded != null ? r.age_as_recorded : r.age;
    if (a != null && typeof a === 'number' && !isNaN(a)) ages.push(a);
  });
  ages.sort(function (a, b) { return a - b; });

  var ageEstimate = null;
  if (ages.length > 0) {
    var mid = Math.floor(ages.length / 2);
    if (ages.length % 2 === 1) {
      ageEstimate = ages[mid];
    } else {
      ageEstimate = Math.round((ages[mid - 1] + ages[mid]) / 2);
    }
  }
  var ageRange = ages.length > 0
    ? { min: ages[0], max: ages[ages.length - 1] }
    : { min: null, max: null };

  /* ------------------------------------------------------------------ */
  /*  Gender  — majority vote                                           */
  /* ------------------------------------------------------------------ */
  var gFreq = {};
  matchGroup.forEach(function (r) {
    var g = r.gender || '';
    if (g) gFreq[g] = (gFreq[g] || 0) + 1;
  });
  var gEntries = Object.keys(gFreq).sort(function (a, b) {
    return gFreq[b] - gFreq[a];
  });
  var gender = gEntries.length > 0 ? gEntries[0] : null;

  /* ------------------------------------------------------------------ */
  /*  source_records  — one entry per raw source row                    */
  /* ------------------------------------------------------------------ */
  var sourceRecords = matchGroup.map(function (r) {
    return {
      table: r.source_table || r.table || '',
      row_id: r.source_id || r.row_id || '',
      case_id: r.case_id || r.CaseMasterID || '',
      name_as_recorded: r.name_as_recorded || r.name || '',
      age_as_recorded: r.age_as_recorded != null ? r.age_as_recorded : (r.age || null),
      date_of_offence: r.date_of_offence || r.IncidentFromDate || null,
      unit_id: r.unit_id || r.PoliceStationID || null,
      district_id: r.district_id || r.DistrictID || null
    };
  });

  /* ------------------------------------------------------------------ */
  /*  roles_summary                                                     */
  /* ------------------------------------------------------------------ */
  var accusedCount = 0;
  var victimCount = 0;
  var complainantCount = 0;

  matchGroup.forEach(function (r) {
    var t = r.source_table || r.table || '';
    if (t === 'Accused') accusedCount++;
    else if (t === 'Victim') victimCount++;
    else if (t === 'ComplainantDetails') complainantCount++;
  });

  /* -- unique case appearances -- */
  var caseIdSet = {};
  matchGroup.forEach(function (r) {
    var cid = r.case_id || r.CaseMasterID || '';
    if (cid) caseIdSet[cid] = true;
  });
  var uniqueCaseIds = Object.keys(caseIdSet);
  var totalCaseAppearances = uniqueCaseIds.length > 0 ? uniqueCaseIds.length : matchGroup.length;

  var dates = matchGroup
    .map(function (r) { return r.date_of_offence || r.IncidentFromDate || null; })
    .filter(Boolean)
    .sort();
  var firstAppearance = dates.length > 0 ? dates[0] : null;
  var lastAppearance = dates.length > 0 ? dates[dates.length - 1] : null;

  var arrestDates = matchGroup
    .map(function (r) { return r.arrest_date || null; })
    .filter(Boolean)
    .sort();
  var lastArrestDate = arrestDates.length > 0
    ? arrestDates[arrestDates.length - 1] : null;

  /* ------------------------------------------------------------------ */
  /*  confidence_score  — aggregate across the cluster                  */
  /* ------------------------------------------------------------------ */
  var confidenceScore = opts.confidence_score;
  if (confidenceScore == null) {
    var scores = matchGroup
      .map(function (r) { return r.confidence; })
      .filter(function (c) { return c != null && typeof c === 'number' && !isNaN(c); });
    confidenceScore = scores.length > 0
      ? Math.round((scores.reduce(function (a, b) { return a + b; }, 0) / scores.length) * 100) / 100
      : null;
  }

  /* ------------------------------------------------------------------ */
  /*  flags                                                             */
  /* ------------------------------------------------------------------ */
  var repeatOffender = accusedCount >= 2;

  /* ------------------------------------------------------------------ */
  /*  meta  — timestamps and provenance                                 */
  /* ------------------------------------------------------------------ */
  var now = new Date().toISOString();

  /* ------------------------------------------------------------------ */
  /*  Assemble document                                                 */
  /* ------------------------------------------------------------------ */
  var doc = {
    person_id: opts.person_id || null,
    schema_version: 1,

    name_variants: nameVariants,
    name_normalised: nameNormalised,
    name_phonetic_key: namePhoneticKey,

    age_estimate: ageEstimate,
    age_range: ageRange,
    gender: gender,

    source_records: sourceRecords,

    roles_summary: {
      accused_count: accusedCount,
      victim_count: victimCount,
      complainant_count: complainantCount,
      total_case_appearances: totalCaseAppearances,
      first_appearance: firstAppearance,
      last_appearance: lastAppearance,
      last_arrest_date: lastArrestDate
    },

    confirmed_edges: [],
    unconfirmed_edges: [],

    confidence_score: confidenceScore,
    resolution_method: opts.resolution_method || 'phonetic_weighted_score_v1',

    flags: {
      repeat_offender: repeatOffender,
      supervisor_review_pending: false
    },

    meta: {
      created_at: now,
      last_resolved_at: now,
      resolved_by: opts.resolved_by || 'personmaster-writer-v1',
      resolution_run_id: opts.resolution_run_id || null
    }
  };

  return doc;
}

module.exports = { buildPersonMaster: buildPersonMaster };
