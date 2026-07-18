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

**File:** `functions/entity-matching-engine/blocking.js` (125 lines)

Blocking reduces the O(n^2) comparison space by grouping records that share
a common key. The engine uses a single blocking strategy per the LLD specification.

### LLD Strategy: lldPhoneticBlockKey (sole active strategy)

Groups records whose first token (first name) produces the same phonetic key.

**Key format:** `{Soundex} {Indian Metaphone}` of first token

**Example:** `Ramesh Kumar` and `Ramesh K` both produce `R520 RMX`

This single-strategy approach was adopted per the LLD specification after
analysis showed it provides the best balance of recall vs. precision for
the KSP dataset. The old multi-strategy approach (4 parallel strategies
including lastTokenPhoneticKey, firstInitialSurnameKey, surnameAgeBandKey,
and surnameDistrictKey) was removed during Phase 4 refactoring.

### MultiStrategyBlocker

The `generateUniquePairs` function:

1. Builds blocks (hash map of key -> records) using the sole strategy
2. For each block with 2+ records, generates all unique pairs
3. Deduplicates across strategies using `source_id::source_id` set

### Coverage Analysis

| Strategy | Blocks on | Catches |
|----------|-----------|---------|
| lldPhoneticBlockKey | First name sound | Name variations, typos in first name |

### Supporting Function

`generateUniquePairsWithStrategy(records, strategies)` allows callers to
pass a custom strategy array (e.g., for calibration or testing purposes).

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
POST /detect  (change detection)
  │
  ▼
index.js — detectChanges():
  ┌─ Load existing PersonMaster documents from NoSQL
  ├─ Build source-to-person index
  ├─ Load current source records from Data Store (Accused, Victim, ComplainantDetails)
  ├─ Build current records index
  ├─ Compare checksums per PersonMaster document
  │    └─ Changed vs unchanged vs orphaned records
  └─ Detect new records (present in Data Store, not in PersonMaster)
  │
  ▼
POST /reconcile  (detect + resolve in one call)
  │
  ▼
index.js → incrementalResolver.js — incrementalResolve():
  ┌─ Step 1: Load existing PersonMaster documents
  ├─ Step 2: Build affected-case scope from changed persons
  ├─ Step 3: Load affected source records (by case IDs)
  ├─ Step 4: Normalise + phoneticize + entity matching
  │    └─ Uses entity-matching-engine blocking.js, scorer.js, threshold.js
  ├─ Step 5: Map clusters to PersonMaster docs (Union-Find DSU)
  ├─ Step 6: Handle orphaned records (remove deleted sources, mark empty docs for deletion)
  ├─ Step 7-8: Merge orphan-handled docs into rebuilt docs
  ├─ Step 9: Regenerate edges via edgeGenerator + edgePersistence
  └─ Step 10: Persist to Catalyst NoSQL (upsert full docs, edge-only updates for shared-case persons)
```

### Files

| File | Lines | Purpose |
|------|-------|---------|
| `index.js` | 524 | Change detection (POST /detect), orchestration (POST /reconcile), health check |
| `incrementalResolver.js` | 889 | Full incremental resolution pipeline: load, match, cluster, rebuild, edge-gen, persist |
| `test_change_detection.js` | — | Test suite for change detection |
| `test_incremental_resolver.js` | — | Test suite for incremental resolver |

### Key Design

- **Change detection** uses checksum comparison (hash of name|age|case_id|unit_id|district_id) to determine which PersonMaster documents have changed.
- **Entity matching** is re-run only on affected cases (targeted scope, not full graph rebuild).
- **Union-Find DSU** clusters newly matched pairs into connected components.
- **Deterministic person IDs** are computed via CRC32 of sorted source keys (`table:id` concatenation) — same algorithm as `personmaster-writer/builder.js`.
- **Edge regeneration** uses `generateConfirmedEdges()` and `generateCandidateMatchEdges()` from `personmaster-writer/edgeGenerator.js`, persisted via `mergeEdgesIntoDocument()`.
- **NoSQL persistence** uses upsert (insert-or-update) with batch size 75. Edge-only updates are applied to shared-case persons without rebuilding their full documents.

---

## Stage 11: Full Graph Rebuild

**Directory:** `functions/sync-full/`

### Overview

`sync-full` is a lightweight HTTP-triggered function that delegates the
full reconciliation to `personmaster-writer/resolve`. It does NOT contain
an inline pipeline — the entire entity resolution + building + writing
process lives in `personmaster-writer`.

### Flow

```
POST / (trigger full reconciliation)
  │
  ▼
index.js — callResolveEndpoint():
  └─ POST /server/personmaster-writer/resolve
       with { records_per_table: 50000, run_id: 'FULL-NIGHTLY-...' }
       │
       ▼
  personmaster-writer runs its full resolve pipeline:
  1. Load source records from Data Store (all Accused, Victim, ComplainantDetails)
  2. Normalise names
  3. Generate phonetic keys
  4. Block + score + threshold
  5. Cluster via Union-Find (DSU)
  6. Build PersonMaster documents
  7. Generate edges
  8. Persist to Catalyst NoSQL (batch writes, size 75)
```

### Files

| File | Lines | Purpose |
|------|-------|---------|
| `index.js` | 99 | Entry point — POST / triggers reconcile, GET / returns health check |
