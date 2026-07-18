'use strict';

const express = require('express');
const helmet = require('helmet');

const { normaliseName } = require('./normaliser');
const { generatePhoneticKey } = require('./phonetic');
const { computeScore } = require('./scorer');
const { classify } = require('./threshold');

const app = express();

app.use(helmet());
app.use(express.json({ limit: '10mb' }));

function match(personA, personB) {
  const nameA = (personA && (personA.normalised_name || personA.name || '')) || '';
  const nameB = (personB && (personB.normalised_name || personB.name || '')) || '';

  const normalisedA = normaliseName(nameA);
  const normalisedB = normaliseName(nameB);

  const personANormalised = { ...personA, normalised_name: normalisedA, name: normalisedA };
  const personBNormalised = { ...personB, normalised_name: normalisedB, name: normalisedB };

  const phoneticKeyA = generatePhoneticKey(normalisedA);
  const phoneticKeyB = generatePhoneticKey(normalisedB);

  const { score_breakdown, confidence } = computeScore(personANormalised, personBNormalised);

  const { label: classification, matched } = classify(confidence);

  return {
    person_a: {
      original_name: personA && personA.name ? personA.name : nameA,
      normalised_name: normalisedA,
      phonetic_key: phoneticKeyA
    },
    person_b: {
      original_name: personB && personB.name ? personB.name : nameB,
      normalised_name: normalisedB,
      phonetic_key: phoneticKeyB
    },
    score_breakdown,
    confidence,
    classification,
    matched
  };
}

function matchCandidates(targetPerson, candidateArray) {
  return candidateArray
    .map(candidate => {
      const result = match(targetPerson, candidate);
      return { person: candidate, score: result.confidence };
    })
    .sort((a, b) => b.score - a.score);
}

app.get('/', (req, res) => {
  res.status(200).send('<h1>Entity Matching Engine</h1><p>POST /match with { person_a:{}, person_b:{} }</p>');
});

app.post('/match', (req, res) => {
  const { person_a, person_b } = req.body;

  if (!person_a || !person_b) {
    return res.status(400).json({
      status: 'error',
      error_code: 'PARAM_MISMATCH',
      message: 'Parameters person_a and person_b are required.',
      fallback_answer: 'Unable to process identity resolution due to missing parameters.'
    });
  }

  try {
    const result = match(person_a, person_b);
    res.json({
      status: 'ok',
      data: result
    });
  } catch (e) {
    res.status(500).json({
      status: 'error',
      error_code: 'INTERNAL_ENGINE_ERROR',
      message: e.message,
      fallback_answer: 'An unexpected error occurred while computing identity metrics.'
    });
  }
});

app.use((err, req, res, next) => {
  res.status(500).json({
    status: 'error',
    error_code: 'INTERNAL_ENGINE_ERROR',
    message: err.message,
    fallback_answer: 'An unexpected error occurred while computing identity metrics.'
  });
});

const handler = (req, res) => {
  app(req, res);
};

handler.match = match;
handler.matchCandidates = matchCandidates;

module.exports = handler;
