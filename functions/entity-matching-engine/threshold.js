'use strict';

const THRESHOLD = 0.78;
const CANDIDATE_MIN = 0.55;

const CONFIRMED = 'CONFIRMED';
const UNCONFIRMED = 'UNCONFIRMED';
const DISCARD = 'DISCARD';

function classify(compositeScore) {
  let label;
  if (typeof compositeScore !== 'number' || isNaN(compositeScore)) {
    label = DISCARD;
  } else if (compositeScore >= THRESHOLD) {
    label = CONFIRMED;
  } else if (compositeScore >= CANDIDATE_MIN) {
    label = UNCONFIRMED;
  } else {
    label = DISCARD;
  }
  return { label, matched: label === CONFIRMED || label === UNCONFIRMED };
}

module.exports = { THRESHOLD, CANDIDATE_MIN, CONFIRMED, UNCONFIRMED, DISCARD, classify };
