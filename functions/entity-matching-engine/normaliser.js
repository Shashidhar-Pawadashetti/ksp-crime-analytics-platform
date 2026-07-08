'use strict';

const KANNADA_BASE_CONSONANTS = {
  'ಕ': 'ka', 'ಖ': 'kha', 'ಗ': 'ga', 'ಘ': 'gha', 'ಙ': 'nga',
  'ಚ': 'ca', 'ಛ': 'cha', 'ಜ': 'ja', 'ಝ': 'jha', 'ಞ': 'nya',
  'ಟ': 'ta', 'ಠ': 'tha', 'ಡ': 'da', 'ಢ': 'dha', 'ಣ': 'na',
  'ತ': 'ta', 'ಥ': 'tha', 'ದ': 'da', 'ಧ': 'dha', 'ನ': 'na',
  'ಪ': 'pa', 'ಫ': 'pha', 'ಬ': 'ba', 'ಭ': 'bha', 'ಮ': 'ma',
  'ಯ': 'ya', 'ರ': 'ra', 'ಱ': 'ra', 'ಲ': 'la', 'ವ': 'va',
  'ಶ': 'sha', 'ಷ': 'sha', 'ಸ': 'sa', 'ಹ': 'ha', 'ಳ': 'la',
  'ಕ್ಷ': 'ksha', 'ಜ್ಞ': 'jna'
};

const KANNADA_VOWEL_SIGNS = {
  'ಾ': 'a', 'ಿ': 'i', 'ೀ': 'i', 'ು': 'u', 'ೂ': 'u',
  'ೃ': 'ru', 'ೆ': 'e', 'ೇ': 'e', 'ೈ': 'ai', 'ೊ': 'o', 'ೋ': 'o', 'ೌ': 'au'
};

const KANNADA_INDEPENDENT_VOWELS = {
  'ಅ': 'a', 'ಆ': 'a', 'ಇ': 'i', 'ಈ': 'i', 'ಉ': 'u', 'ಊ': 'u',
  'ಋ': 'ru', 'ಎ': 'e', 'ಏ': 'e', 'ಐ': 'ai', 'ಒ': 'o', 'ಓ': 'o', 'ಔ': 'au'
};

const KANNADA_HALANT = '್';
const KANNADA_ANUSVARA = 'ಂ';
const KANNADA_VISARGA = 'ಃ';

const KANNADA_ALL_LOOKUP = {};

for (const [k, v] of Object.entries(KANNADA_BASE_CONSONANTS)) {
  KANNADA_ALL_LOOKUP[k] = v;
}
for (const [k, v] of Object.entries(KANNADA_INDEPENDENT_VOWELS)) {
  KANNADA_ALL_LOOKUP[k] = v;
}
KANNADA_ALL_LOOKUP[KANNADA_ANUSVARA] = 'm';
KANNADA_ALL_LOOKUP[KANNADA_VISARGA] = 'h';

const KANNADA_REGEX = /[\u0C80-\u0CFF]/;

function isKannadaBaseConsonant(c) {
  return c in KANNADA_BASE_CONSONANTS;
}

function isKannadaVowelSign(c) {
  return c in KANNADA_VOWEL_SIGNS;
}

function isKannadaChar(c) {
  return c in KANNADA_ALL_LOOKUP || isKannadaVowelSign(c) || c === KANNADA_HALANT;
}

const DEVANAGARI_BASE_CONSONANTS = {
  'क': 'ka', 'ख': 'kha', 'ग': 'ga', 'घ': 'gha', 'ङ': 'nga',
  'च': 'ca', 'छ': 'cha', 'ज': 'ja', 'झ': 'jha', 'ञ': 'nya',
  'ट': 'ta', 'ठ': 'tha', 'ड': 'da', 'ढ': 'dha', 'ण': 'na',
  'त': 'ta', 'थ': 'tha', 'द': 'da', 'ध': 'dha', 'न': 'na',
  'प': 'pa', 'फ': 'pha', 'ब': 'ba', 'भ': 'bha', 'म': 'ma',
  'य': 'ya', 'र': 'ra', 'ल': 'la', 'व': 'va',
  'श': 'sha', 'ष': 'sha', 'स': 'sa', 'ह': 'ha', 'ळ': 'la',
  'क्ष': 'ksha', 'ज्ञ': 'jna',
  'ड़': 'ra', 'ढ़': 'rha'
};

const DEVANAGARI_VOWEL_SIGNS = {
  'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u',
  'ृ': 'ru', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au'
};

const DEVANAGARI_INDEPENDENT_VOWELS = {
  'अ': 'a', 'आ': 'a', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u',
  'ऋ': 'ru', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
  'ॐ': 'om', 'ऑ': 'o'
};

const DEVANAGARI_HALANT = '्';
const DEVANAGARI_ANUSVARA = 'ं';
const DEVANAGARI_VISARGA = 'ः';
const DEVANAGARI_CHANDRABINDU = 'ँ';

const DEVANAGARI_ALL_LOOKUP = {};

for (const [k, v] of Object.entries(DEVANAGARI_BASE_CONSONANTS)) {
  DEVANAGARI_ALL_LOOKUP[k] = v;
}
for (const [k, v] of Object.entries(DEVANAGARI_INDEPENDENT_VOWELS)) {
  DEVANAGARI_ALL_LOOKUP[k] = v;
}
DEVANAGARI_ALL_LOOKUP[DEVANAGARI_ANUSVARA] = 'm';
DEVANAGARI_ALL_LOOKUP[DEVANAGARI_VISARGA] = 'h';
DEVANAGARI_ALL_LOOKUP[DEVANAGARI_CHANDRABINDU] = 'm';

const DEVANAGARI_REGEX = /[\u0900-\u097F]/;

function isDevanagariBaseConsonant(c) {
  return c in DEVANAGARI_BASE_CONSONANTS;
}

function isDevanagariVowelSign(c) {
  return c in DEVANAGARI_VOWEL_SIGNS;
}

function isDevanagariChar(c) {
  return c in DEVANAGARI_ALL_LOOKUP || isDevanagariVowelSign(c) || c === DEVANAGARI_HALANT;
}

function transliterateKannada(text) {
  if (!KANNADA_REGEX.test(text)) return text;
  return transliterateScript(text, {
    isBaseConsonant: isKannadaBaseConsonant,
    isVowelSign: isKannadaVowelSign,
    isScriptChar: isKannadaChar,
    baseConsonants: KANNADA_BASE_CONSONANTS,
    vowelSigns: KANNADA_VOWEL_SIGNS,
    halant: KANNADA_HALANT,
    anusvara: KANNADA_ANUSVARA,
    visarga: KANNADA_VISARGA
  });
}

function transliterateDevanagari(text) {
  if (!DEVANAGARI_REGEX.test(text)) return text;
  return transliterateScript(text, {
    isBaseConsonant: isDevanagariBaseConsonant,
    isVowelSign: isDevanagariVowelSign,
    isScriptChar: isDevanagariChar,
    baseConsonants: DEVANAGARI_BASE_CONSONANTS,
    vowelSigns: DEVANAGARI_VOWEL_SIGNS,
    halant: DEVANAGARI_HALANT,
    anusvara: DEVANAGARI_ANUSVARA,
    visarga: DEVANAGARI_VISARGA
  });
}

function transliterateScript(text, script) {
  let result = '';
  let i = 0;

  while (i < text.length) {
    const c = text[i];

    if (script.isBaseConsonant(c)) {
      let syllable = script.baseConsonants[c];

      if (i + 1 < text.length) {
        const next = text[i + 1];
        if (next === script.halant) {
          syllable = syllable.slice(0, -1);
          i += 2;
          if (i < text.length && script.isBaseConsonant(text[i])) {
            result += syllable;
            continue;
          }
          result += syllable;
          continue;
        }
        if (script.isVowelSign(next)) {
          const vowel = script.vowelSigns[next];
          syllable = syllable.slice(0, -1) + vowel;
          i += 2;
          if (i < text.length && text[i] === script.anusvara) {
            syllable += 'm';
            i++;
          }
          result += syllable;
          continue;
        }
        if (next === script.anusvara) {
          syllable += 'm';
          i += 2;
          result += syllable;
          continue;
        }
      }

      i++;
      result += syllable;
      continue;
    }

    if (script.isVowelSign(c)) {
      result += script.vowelSigns[c];
      i++;
      continue;
    }

    if (c === script.anusvara) {
      result += 'm';
      i++;
      continue;
    }

    if (c === script.visarga) {
      result += 'h';
      i++;
      continue;
    }

    if (c === script.halant) {
      i++;
      continue;
    }

    result += c;
    i++;
  }

  return result;
}

function stripTransliteratedFinalA(text) {
  return text.replace(/([bcdfghjklmnpqrstvwxyz])a(?=\s|$)/gi, '$1');
}

const SALUTATIONS = /^(sri|shri|smt|srimati|mr|mrs|dr|late)\s+/i;

const SUFFIXES = /\s+(kumar|bai|devi|amma|gowda|swamy|reddy)$/i;

function normaliseName(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) return '';

  let name = raw.normalize('NFC');

  const hadIndicChars = KANNADA_REGEX.test(raw) || DEVANAGARI_REGEX.test(raw);

  name = transliterateKannada(name);
  name = transliterateDevanagari(name);

  if (hadIndicChars) {
    name = stripTransliteratedFinalA(name);
  }

  name = name.toLowerCase();

  name = name.replace(SALUTATIONS, '');

  const afterStrip = name.replace(SUFFIXES, '');
  if (afterStrip.trim().split(/\s+/).filter(t => t.length > 0).length >= 2) {
    name = afterStrip;
  }

  name = name.replace(/[^a-z\s]/g, '');
  name = name.replace(/\s+/g, ' ');
  name = name.trim();

  return name;
}

module.exports = { normaliseName };
