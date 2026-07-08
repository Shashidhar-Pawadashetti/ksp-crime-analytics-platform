'use strict';

const { normaliseName } = require('./normaliser');
const { generatePhoneticKey } = require('./phonetic');
const { computeScore } = require('./scorer');
const { classify } = require('./threshold');

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

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method === 'POST' && req.url === '/match') {
    try {
      const body = await parseBody(req);
      if (!body.person_a || !body.person_b) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'person_a and person_b are required' }));
        return;
      }
      const result = match(body.person_a, body.person_b);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result, null, 2));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  switch (req.url) {
    case '/':
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.write('<h1>Entity Matching Engine</h1><p>POST /match with { person_a: {}, person_b: {} }</p>');
      break;
    default:
      res.writeHead(404);
      res.write('Not found');
      break;
  }
  res.end();
};

module.exports.match = match;
module.exports.matchCandidates = matchCandidates;
