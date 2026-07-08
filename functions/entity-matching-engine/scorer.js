'use strict';

const NAME_WEIGHT = 0.45;
const AGE_WEIGHT = 0.20;
const GENDER_WEIGHT = 0.20;
const LOCATION_WEIGHT = 0.15;

const AGE_TOLERANCE_SOFT = 5;
const AGE_TOLERANCE_HARD = 10;

const LOCATION_PROXIMITY_CLOSE_KM = 5;
const LOCATION_PROXIMITY_MID_KM = 20;

function jaroWinkler(s1, s2) {
  const len1 = s1.length;
  const len2 = s2.length;

  if (len1 === 0 && len2 === 0) return 1.0;
  if (len1 === 0 || len2 === 0) return 0.0;

  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;

  const matches1 = new Array(len1).fill(false);
  const matches2 = new Array(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (matches2[j]) continue;
      if (s1[i] !== s2[j]) continue;
      matches1[i] = true;
      matches2[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!matches1[i]) continue;
    while (!matches2[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

  let prefix = 0;
  const maxPrefix = Math.min(4, len1, len2);
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

function tokenSortRatio(s1, s2) {
  const tokens1 = s1.trim().split(/\s+/).filter(t => t.length > 0).sort().join(' ');
  const tokens2 = s2.trim().split(/\s+/).filter(t => t.length > 0).sort().join(' ');
  return jaroWinkler(tokens1, tokens2);
}

function computeNameScore(nameA, nameB) {
  const jw = jaroWinkler(nameA, nameB);
  const tsr = tokenSortRatio(nameA, nameB);
  return Math.max(jw, tsr);
}

function computeAgeScore(ageA, ageB) {
  if (ageA == null || ageB == null) return 0.5;
  if (typeof ageA !== 'number' || typeof ageB !== 'number') return 0.5;

  const delta = Math.abs(ageA - ageB);

  if (delta === 0) return 1.0;
  if (delta <= 2) return 0.9;
  if (delta <= AGE_TOLERANCE_SOFT) return 0.7;
  if (delta <= AGE_TOLERANCE_HARD) return 0.4;
  return 0.0;
}

function computeGenderScore(genderA, genderB) {
  if (genderA == null || genderB == null) return 0.5;
  const a = String(genderA).toUpperCase().trim();
  const b = String(genderB).toUpperCase().trim();

  if (a === '' || b === '' || a === 'NULL' || b === 'NULL' || a === 'UNKNOWN' || b === 'UNKNOWN') return 0.5;
  if (a === b) return 1.0;
  return 0.0;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function computeLocationScore(locA, locB) {
  if (!locA || !locB) return 0.0;

  if (locA.unit_id && locB.unit_id && locA.unit_id === locB.unit_id) return 1.0;

  if (locA.district_id && locB.district_id && locA.district_id === locB.district_id) return 0.6;

  if (locA.lat != null && locA.lon != null && locB.lat != null && locB.lon != null) {
    const dist = haversine(locA.lat, locA.lon, locB.lat, locB.lon);
    if (dist <= LOCATION_PROXIMITY_CLOSE_KM) return 0.8;
    if (dist <= LOCATION_PROXIMITY_MID_KM) return 0.4;
  }

  return 0.0;
}

function computeCompositeScore(scores) {
  return (
    (scores.name_score * NAME_WEIGHT) +
    (scores.age_score * AGE_WEIGHT) +
    (scores.gender_score * GENDER_WEIGHT) +
    (scores.location_score * LOCATION_WEIGHT)
  );
}

function computeScore(personA, personB) {
  const nameA = personA.normalised_name || personA.name || '';
  const nameB = personB.normalised_name || personB.name || '';

  const name_score = computeNameScore(nameA, nameB);
  const age_score = computeAgeScore(personA.age, personB.age);
  const gender_score = computeGenderScore(personA.gender, personB.gender);
  const location_score = computeLocationScore(
    { unit_id: personA.unit_id, district_id: personA.district_id, lat: personA.lat, lon: personA.lon },
    { unit_id: personB.unit_id, district_id: personB.district_id, lat: personB.lat, lon: personB.lon }
  );

  const score_breakdown = {
    name_score: Math.round(name_score * 100) / 100,
    age_score: Math.round(age_score * 100) / 100,
    gender_score: Math.round(gender_score * 100) / 100,
    location_score: Math.round(location_score * 100) / 100
  };

  const confidence = Math.round(computeCompositeScore(score_breakdown) * 100) / 100;

  return { score_breakdown, confidence };
}

module.exports = {
  jaroWinkler,
  tokenSortRatio,
  computeNameScore,
  computeAgeScore,
  computeGenderScore,
  haversine,
  computeLocationScore,
  computeCompositeScore,
  computeScore,
  NAME_WEIGHT,
  AGE_WEIGHT,
  GENDER_WEIGHT,
  LOCATION_WEIGHT,
  AGE_TOLERANCE_SOFT,
  AGE_TOLERANCE_HARD,
  LOCATION_PROXIMITY_CLOSE_KM,
  LOCATION_PROXIMITY_MID_KM
};
