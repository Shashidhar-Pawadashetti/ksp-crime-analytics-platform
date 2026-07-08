'use strict';

const SOUNDEX_LENGTH = 4;

const SOUNDEX_MAP = {
  'B': '1', 'F': '1', 'P': '1', 'V': '1',
  'C': '2', 'G': '2', 'J': '2', 'K': '2', 'Q': '2', 'S': '2', 'X': '2', 'Z': '2',
  'D': '3', 'T': '3',
  'L': '4',
  'M': '5', 'N': '5',
  'R': '6'
};

function soundexToken(token) {
  if (!token || token.length === 0) return '';

  const upper = token.toUpperCase();

  const first = upper[0];
  const coded = upper.slice(1).replace(/[AEIOUHWY]/g, '');

  let result = first;
  let prevCode = SOUNDEX_MAP[first] || '';

  for (let i = 0; i < coded.length; i++) {
    const code = SOUNDEX_MAP[coded[i]];
    if (code && code !== prevCode) {
      result += code;
      prevCode = code;
    }
    if (result.length >= SOUNDEX_LENGTH) break;
  }

  while (result.length < SOUNDEX_LENGTH) {
    result += '0';
  }

  return result;
}

function soundex(name) {
  if (!name || name.trim().length === 0) return '';

  const tokens = name.trim().split(/\s+/);
  return tokens.map(t => soundexToken(t)).join(' ');
}

const METAPHONE_MAP = {
  'B': 'B', 'C': 'X', 'D': 'J', 'F': 'F', 'G': 'K',
  'J': 'J', 'K': 'K', 'L': 'L', 'M': 'M', 'N': 'N',
  'P': 'P', 'Q': 'Q', 'R': 'R', 'S': 'S', 'T': 'T',
  'V': 'F', 'W': 'F', 'X': 'X', 'Y': 'Y', 'Z': 'S'
};

function indianMetaphoneToken(token) {
  if (!token || token.length === 0) return '';

  const upper = token.toUpperCase();
  let result = '';
  let i = 0;

  while (i < upper.length) {
    const ch = upper[i];
    const next = upper[i + 1] || '';

    const digraph = ch + next;
    if (digraph === 'SH') { result += 'X'; i += 2; continue; }
    if (digraph === 'TH') { result += 'T'; i += 2; continue; }
    if (digraph === 'KH') { result += 'K'; i += 2; continue; }
    if (digraph === 'GH') { result += 'K'; i += 2; continue; }
    if (digraph === 'CH') { result += 'X'; i += 2; continue; }
    if (digraph === 'PH') { result += 'F'; i += 2; continue; }

    if ('AEIOUY'.indexOf(ch) !== -1) { i++; continue; }

    const mapped = METAPHONE_MAP[ch];
    if (mapped) {
      const lastChar = result[result.length - 1] || '';
      if (mapped !== lastChar) {
        result += mapped;
      }
      i++;
      continue;
    }

    if (ch === 'H') { i++; continue; }

    i++;
  }

  return result;
}

function indianMetaphone(name) {
  if (!name || name.trim().length === 0) return '';

  const tokens = name.trim().split(/\s+/);
  return tokens.map(t => indianMetaphoneToken(t)).join(' ');
}

function generatePhoneticKey(name) {
  if (!name || name.trim().length === 0) return '';

  const normalised = name.trim().toLowerCase();
  const tokens = normalised.split(/\s+/);
  const firstToken = tokens[0];

  const soundexPart = soundexToken(firstToken);
  const metaphonePart = indianMetaphoneToken(firstToken);

  return soundexPart + ' ' + metaphonePart;
}

module.exports = { soundex, soundexToken, indianMetaphone, indianMetaphoneToken, generatePhoneticKey, SOUNDEX_LENGTH };
