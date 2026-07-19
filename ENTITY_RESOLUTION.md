# Entity Resolution — KSP Crime Analytics Platform

## Overview

The entity resolution system solves the problem of identifying the same
real-world person across multiple source tables (Accused, Victim,
ComplainantDetails) even when their name is spelled differently, uses
different scripts (Kannada, Devanagari, Latin), or includes honorific
variations. It produces **PersonMaster** clusters — unified person profiles
with alias lists, role summaries, and demographic snapshots.

## Pipeline Overview

```
Source Records (Accused/Victim/Complainant CSV)
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ Stage 1: Normaliser        normaliser.js (249 lines)     │
│ Stage 2: Phonetic          phonetic.js (114 lines)       │
│ Stage 3: Blocking          blocking.js (160 lines)       │
│ Stage 4: Scorer            scorer.js (180 lines)         │
│ Stage 5: Threshold         threshold.js (24 lines)       │
└───────────┬──────────────────────────────────────────────┘
            │ matched pairs
            ▼
┌──────────────────────────────────────────────────────────┐
│ Stage 6: Clustering        clusterBuilder.js (98 lines)  │
│ Stage 7: Document Building documentBuilder.js            │
│ Stage 8: Edge Building     edgeBuilder.js                │
│ Stage 9: NoSQL Writer      writer.js (203 lines)         │
│ Stage 10: Incremental Sync sync-incremental/              │
│ Stage 11: Full Graph Rebuild sync-full/                   │
└──────────────────────────────────────────────────────────┘
            │ PersonMaster documents + edges
            ▼
       Catalyst NoSQL / Graph Service
```

---

## Stage 1: Name Normalization

**File:** `functions/entity-matching-engine/normaliser.js` (249 lines)

### Unicode NFC Normalization

All input names are normalized via `String.normalize('NFC')` to ensure
consistent Unicode representation before any processing.

### Multi-Script Transliteration

Three Indian scripts are transliterated to Latin phonemes using character
maps:

#### Kannada Transliteration

31 base consonants, 12 vowel signs, 13 independent vowels:

```
ಕ→ka ಖ→kha ಗ→ga ಘ→gha ಙ→nga
ಚ→ca ಛ→cha ಜ→ja ಝ→jha ಞ→nya
ಟ→ta ಠ→tha ಡ→da ಢ→dha ಣ→na
ತ→ta ಥ→tha ದ→da ಧ→dha ನ→na
ಪ→pa ಫ→pha ಬ→ba ಭ→bha ಮ→ma
ಯ→ya ರ→ra ಱ→ra ಲ→la ವ→va
ಶ→sha ಷ→sha ಸ→sa ಹ→ha ಳ→la
ಕ್ಷ→ksha ಜ್ಞ→jna
```

Vowel signs (`ಾ ಿ ೀ ು ೂ ೃ ೆ ೇ ೈ ೊ ೋ ೌ`) are appended to the base
consonant, replacing the inherent 'a'. The halant (್) suppresses the
inherent vowel. Anusvara (ಂ) produces 'm'. Visarga (ಃ) produces 'h'.

#### Devanagari Transliteration

34 base consonants, 12 vowel signs, 14 independent vowels. Same structure
as Kannada:

```
क→ka ख→kha ग→ga ... क्ष→ksha ज्ञ→jna
ड़→ra ढ़→rha (extra retroflex flapped consonants)
```

#### Transliteration Algorithm

The `transliterateScript()` function processes character-by-character:

1. If current char is a base consonant, look up its transliteration
2. Check next char: halant (suppress vowel), vowel sign (replace vowel),
   anusvara (append 'm'), or normal (keep inherent 'a')
3. Handle edge cases: conjuncts (halant sequence), combined marks
4. Non-script characters pass through unchanged

#### Final 'a' Stripping

After transliteration, trailing 'a' on consonants is stripped for Indian
script text only:

```
"raMa" → "ram"
"venkaTa" → "venkat"
```

#### Salutation Stripping

Removes leading honorifics:

```
sri, shri, smt, srimati, mr, mrs, dr, late
```

#### Suffix Stripping

Strips common suffixes, but only if at least 2 tokens remain:

```
kumar, bai, devi, amma, gowda, swamy, reddy
```

#### Final Cleanup

1. Lowercase
2. Remove non-alpha chars (`[^a-z\s]`)
3. Collapse whitespace
4. Trim

#### Examples

| Input | Normalized |
|-------|------------|
| `Shri Ramesh Kumar` | `ramesh kumar` |
| `Smt. Lakshmi Devi` | `lakshmi devi` |
| `ಶ್ರೀ ರಮೇಶ್ ಕುಮಾರ` | `ramesh kumar` |
| `Mr. Venkatesh Gowda` | `venkatesh` |
| `Dr. Rajesh` | `rajesh` |

---

## Stage 2: Phonetic Matching 

**File:** `functions/entity-matching-engine/phonetic.js` (114 lines)

Two phonetic algorithms are combined for robust matching of Indian names.

### Soundex

Standard Soundex algorithm adapted for Indian names:

1. Keep first letter
2. Replace consonants with digits: B,F,P,V→1, C,G,J,K,Q,S,X,Z→2,
   D,T→3, L→4, M,N→5, R→6
3. Remove consecutive duplicates, strip vowels
4. Pad/truncate to 4 characters

**Soundex examples:**
- `ramesh` → `R520`
- `kumar` → `K560`
- `venkatesh` → `V523`

### Indian Metaphone

A custom metaphone algorithm optimized for Indian language phonetics:

1. Handle digraphs first: SH→X, TH→T, KH→K, GH→K, CH→X, PH→F
2. Skip vowels (A, E, I, O, U, Y)
3. Map consonants with Indian-specific rules: C→X, V→F, W→F, Z→S
4. Skip H
5. Remove consecutive duplicates
6. Output as uppercase letters

**Indian Metaphone examples:**
- `ramesh` → `RMX`
- `kumar` → `KMR`
- `venkatesh` → `FNKTX`

### Combined Key

`generatePhoneticKey` produces a combined key from the **first token** only:

```
soundexToken(firstToken) + ' ' + indianMetaphoneToken(firstToken)
```

**Examples:**
- `Ramesh Kumar` → `R520 RMX`
- `Venkatesh Gowda` → `V523 FNKTX`

This combined key is used as a blocking strategy input.

---

## Stage 3: Blocking

**File:** `functions/entity-matching-engine/blocking.js` (160 lines)

Blocking reduces the O(n^2) comparison space by grouping records that share
a common key. The engine uses 4 blocking strategies in parallel.

### Strategy 1: firstTokenPhoneticKey

Groups records whose first name (first token) sounds similar.

**Key format:** `{Soundex} {Indian Metaphone}` of first token

**Example:** `Ramesh Kumar` and `Ramesh K` both produce `R520 RMX`

### Strategy 2: lastTokenPhoneticKey

Groups records whose last name (last token) sounds similar.

**Key format:** `{Soundex} {Indian Metaphone}` of last token

**Example:** `Ramesh Kumar` and `Suresh Kumar` both produce `K560 KMR`

### Strategy 3: firstInitialSurnameKey

Groups records with same first initial and phonetically similar surname.

**Key format:** `{FirstInitial}:{Soundex of last token}`

**Example:** `Ramesh Kumar` and `Ravi K` → `R:K560`

### Strategy 4: surnameAgeBandKey

Groups records with phonetically similar surname and age within 5-year band.

**Key format:** `{Soundex of last token}:{age_band}`

**Example:** `Kumar (age 32)` and `Kumar (age 34)` → `K560:30`

### Strategy 5: surnameDistrictKey (not used in STRATEGIES array)

Groups records with phonetically similar surname and same district.

**Key format:** `{Soundex of last token}:{district_id}`

This strategy is exported but not included in the active strategy set.

### MultiStrategyBlocker

The `generateUniquePairs` function:

1. For each strategy, builds blocks (hash map of key -> records)
2. For each block with 2+ records, generates all unique pairs
3. Deduplicates across strategies using `source_id::source_id` set

### Coverage Analysis

| Strategy | Blocks on | Catches |
|----------|-----------|---------|
| firstTokenPhoneticKey | First name sound | Name variations, typos in first name |
| lastTokenPhoneticKey | Last name sound | Name variations in surname |
| firstInitialSurnameKey | Initial + surname | Abbreviated first name |
| surnameAgeBandKey | Surname + age band | Same person, different first name variants |

---

## Stage 4: Scoring

**File:** `functions/entity-matching-engine/scorer.js` (180 lines)

### Composite Scoring Formula

```
composite = name_score * 0.45 +
            age_score * 0.20 +
            gender_score * 0.20 +
            location_score * 0.15
```

### Name Score (weight: 0.45)

Uses two string similarity metrics and takes the maximum:

**Jaro-Winkler distance** (lines 14–61):
- Character-level similarity with transposition counting
- Winkler prefix boost: +0.1 per matching character in first 4, scaled by
  `(1 - jaro)`
- Returns 0.0–1.0

**Token sort ratio** (lines 63–67):
- Sort tokens alphabetically, join with space, then compute Jaro-Winkler
- Handles "Kumar Ramesh" vs "Ramesh Kumar" (token order invariance)

### Age Score (weight: 0.20)

| Age Delta | Score |
|-----------|-------|
| 0 | 1.0 |
| 1-2 | 0.9 |
| 3-5 | 0.7 |
| 6-10 | 0.4 |
| >10 | 0.0 |
| null/missing | 0.5 (neutral) |

### Gender Score (weight: 0.20)

| Gender Match | Score |
|-------------|-------|
| Same gender | 1.0 |
| Different gender | 0.0 |
| Unknown/missing | 0.5 (neutral) |

### Location Score (weight: 0.15)

| Condition | Score |
|-----------|-------|
| Same unit_id (police station) | 1.0 |
| Same district_id | 0.6 |
| Within 5km (via Haversine) | 0.8 |
| Within 20km | 0.4 |
| No match | 0.0 |

The Haversine formula (lines 102–111) calculates great-circle distance
between latitude/longitude coordinates.

### Weight Configuration

| Parameter | Value | File |
|-----------|-------|------|
| `NAME_WEIGHT` | 0.45 | scorer.js:3 |
| `AGE_WEIGHT` | 0.20 | scorer.js:4 |
| `GENDER_WEIGHT` | 0.20 | scorer.js:5 |
| `LOCATION_WEIGHT` | 0.15 | scorer.js:6 |
| `AGE_TOLERANCE_SOFT` | 5 years | scorer.js:8 |
| `AGE_TOLERANCE_HARD` | 10 years | scorer.js:9 |
| `LOCATION_PROXIMITY_CLOSE_KM` | 5 km | scorer.js:11 |
| `LOCATION_PROXIMITY_MID_KM` | 20 km | scorer.js:12 |

---

## Stage 5: Thresholding

**File:** `functions/entity-matching-engine/threshold.js` (24 lines)

### Classification

```
>= 0.78  → CONFIRMED  (auto-merge, matched=true)
>= 0.55  → UNCONFIRMED (manual review, matched=true)
<  0.55  → DISCARD     (matched=false)
```

### Rationale for THRESHOLD = 0.78

The threshold was calibrated using `calibrate-threshold.cjs` against dummy
test pairs (8 same-person, 7 different-person). The calibration evaluates
precision, recall, and F1 across thresholds from 0.55 to 0.90:

| Threshold | Precision | Recall | F1 |
|-----------|-----------|--------|-----|
| 0.55 | 0.5714 | 1.0000 | 0.7273 |
| 0.75 | 0.8889 | 1.0000 | 0.9412 |
| **0.78** | **1.0000** | **1.0000** | **1.0000** |
| 0.85 | 1.0000 | 0.7500 | 0.8571 |

The current threshold of 0.78 achieves perfect precision and recall on the
dummy dataset. For production, calibration should be re-run against the full
`ground_truth_identities.csv`.

### Calibration Tools

| File | Purpose |
|------|---------|
| `calibrate-threshold.cjs` | Threshold sweep with precision/recall/F1 |
| `calibrate-enhanced.cjs` | Enhanced with per-strategy performance analysis |
| `test-threshold.js` | 148 lines, 15 dummy pairs, metrics computation |

---

## Stage 6: Clustering (Union-Find)

**File:** `functions/personmaster-builder/clusterBuilder.js` (98 lines)

### Algorithm: Disjoint Set Union (Union-Find)

- **`makeSet(x)`** — Creates a new set with element x
- **`find(x)`** — Returns root of x's set (with path compression)
- **`union(x, y)`** — Merges sets containing x and y (union by rank)

### Path Compression

`this.parent[x] = this.find(this.parent[x])` flattens the tree during
find operations, giving amortized near-constant time.

### Union by Rank

The smaller tree is attached under the root of the larger tree, maintaining
O(log n) tree height.

### Cluster Creation

For each CONFIRMED or UNCONFIRMED pair:
```
memberKey = source_table + ':' + source_id
union(memberKey_a, memberKey_b)
```

### Results

- **481 clusters** total (groups of matched persons)
- **10,487 members** across all clusters

---

## Stage 7: Document Building

**File:** `functions/personmaster-builder/documentBuilder.js`

For each cluster, a PersonMaster document is created:

### PersonMaster ID

Format: `PM_XXXXXX` (6-digit zero-padded, sequential)

### Canonical Name Selection

`chooseCanonicalName`:
- Selects the most frequent name in the cluster
- Prefers full names (more tokens) over short forms
- Falls back to any name if tie

### Aliases

All unique names from source records are collected as aliases.

### Demographics Merging

`computeDemographics`:
- **Gender:** Majority vote across source records
- **Age:** Median or average of available ages
- **District:** First non-null district encountered
- **Unit:** First non-null unit encountered

### Roles Summary

`computeRolesSummary`:
- `accused_count`: number of source records with role='accused'
- `victim_count`: number with role='victim'
- `complainant_count`: number with role='complainant'

### Confidence Scoring

- `cluster_size`: number of source records in cluster
- `avg_match_score`: average of all pairwise match scores

---

## Stage 8: Edge Building

**File:** `functions/personmaster-builder/edgeBuilder.js`

Four edge types represent relationships between PersonMaster nodes:

### Edge Type 1: CO_ACCUSED

**Source:** Two persons accused in the same case.

- **Direction:** Undirected
- **Weight:** Number of shared cases
- **Deduplication:** `occurrence_count` increments on duplicate pair

### Edge Type 2: ACCUSED_TO_VICTIM

**Source:** Person A is accused in a case where Person B is victim.

- **Direction:** Directed (accused → victim)
- **Weight:** 1 per case
- **Deduplication:** Aggregated by case

### Edge Type 3: SHARED_LOCATION

**Source:** Two persons involved in cases at the same police station.

- **Direction:** Undirected
- **Weight:** Number of shared stations
- **Deduplication:** `occurrence_count` per station pair

### Edge Type 4: UNCONFIRMED_MATCH

**Source:** Entity match scores below CONFIRMED threshold but above
CANDIDATE_MIN (0.55–0.777).

- **Direction:** Undirected
- **Weight:** Match score * 100
- **Purpose:** Allows manual review of uncertain matches

### Edge Format

```json
{
  "edge_id": "E-000001",
  "source": "PM_000001",
  "target": "PM_000015",
  "edge_type": "CO_ACCUSED",
  "weight": 1,
  "metadata": {
    "occurrence_count": 2,
    "case_ids": ["C-201", "C-305"]
  }
}
```

### Edge Deduplication Strategy

When building edges, the system uses `occurrence_count` to track multiple
relationships between the same pair rather than creating duplicate edges.

---

## Stage 9: NoSQL Writer

**File:** `functions/personmaster-writer/writer.js` (203 lines)

### Write Process

1. **Build adjacency map** — For each person, build lists by edge type
2. **Batch writes** — BATCH_SIZE = 75 documents per batch
3. **Retry with exponential backoff** — MAX_RETRIES = 3, backoff formula:
   `delay = initialDelay * 2^attempt` (ms)

### Adjacency Map Structure

```json
{
  "PM_000001": {
    "co_accused": ["PM_000015", "PM_000042"],
    "accused_to_victim": ["PM_000100"],
    "shared_location": ["PM_000200"],
    "unconfirmed_matches": []
  }
}
```

### Validation

`validator.js` checks:
- Required fields: person_id, canonical_name, roles_summary
- Valid person_id format (PM_XXXXXX)
- Minimum data requirements

---

## Stage 10: Incremental Sync

**Directory:** `functions/sync-incremental/`

Handles real-time signal-based updates when new records are added to source
tables (Accused, Victim, ComplainantDetails).

### Flow

```
Signal received (new/updated record)
  │
  ▼
candidateLoader.js:
  prepareRecord(name, age, gender, case_id, source_table, source_id)
  computeBlockingKeys() — uses STRATEGIES from blocking.js
  precomputeBlockingIndex() — builds blocking index across all PM docs
  findCandidates() — finds candidate PMs via blocking key intersection
  │
  ▼
incrementalResolver.js:
  For each candidate PM, compute composite score
    (max of pairwise matches against all source_records using
     entity-matching-engine scorer)
  Sort by score descending
  Return best match if score >= THRESHOLD
  │
  ▼
personUpdater.js:
  applyMatch() — merges new record into existing PM
    dedup records + aliases
    recompute demographics, roles_summary, canonical_name
  createNew() — creates fresh PM document with PM_XXXXXX ID
  │
  ▼
edgeUpdater.js:
  recomputeEdgesForPM() — identifies affected cases
    rebuilds CO_ACCUSED/ACCUSED_TO_VICTIM/SHARED_LOCATION edges
    preserves UNCONFIRMED_MATCH edges
    deduplicates by occurrence_count
  extractAdjacencyForPM()
```

### Files

| File | Lines | Purpose |
|------|-------|---------|
| `signalHandler.js` | 124 | Main flow orchestration |
| `candidateLoader.js` | 118 | Blocking index, candidate retrieval |
| `incrementalResolver.js` | 94 | Score-based resolution |
| `personUpdater.js` | 129 | PersonMaster create/update |
| `edgeUpdater.js` | 143 | Edge recomputation |
| `simulate-signal.js` | 111 | CLI simulation tool |

### Simulation Tool

`node simulate-signal.js` supports two modes:

- **`synthetic`** — Creates a random new person and processes it
- **`existing N`** — Re-processes the Nth record from PersonMaster PM_000001

---

## Stage 11: Full Graph Rebuild

**Directory:** `functions/sync-full/`

### Pipeline

`pipeline.js` (475 lines) runs the complete 8-stage process:

1. Load CSVs from `data_pipeline/data/` (Accused, Victim, ComplainantDetails)
2. Normalize all names (normaliser.js)
3. Generate phonetic keys (phonetic.js)
4. Block on 4 strategies (blocking.js)
5. Score all candidate pairs (scorer.js)
6. Threshold classification (threshold.js)
7. Cluster via Union-Find (clusterBuilder.js)
8. Build PersonMaster documents (documentBuilder.js)
9. Build edges (edgeBuilder.js)
10. Write to Catalyst NoSQL (writer.js)

### Files

| File | Purpose |
|------|---------|
| `index.js` | Entry point |
| `pipeline.js` | Full pipeline orchestration (475 lines) |
| `cronHandler.js` | Cron/interval trigger handler |
| `statistics.js` | Pipeline run statistics |
| `simulate-cron.js` | Local simulation |
