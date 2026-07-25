# Data Pipeline — KSP Crime Analytics Platform

## Purpose

Generate synthetic yet realistic crime data for the 24+ table KSP database.
The data is used to develop and test the conversational AI platform, entity
resolution system, and graph analytics without access to real police records.

## Technology

- **Faker.js** (`@faker-js/faker` v10) for realistic Indian names, addresses,
  dates, and text
- **csv-writer** for CSV output
- **Node.js** with mixed ESM (`src/index.js`) and CJS (`generate_*.cjs`)
  scripts
- **zcatalyst-sdk-node** for importing CSVs into Catalyst Data Store

## Generation Phases

```
Phase 1: 16 Lookup Tables (ESM generators)
  State, District, CaseCategory, GravityOffence, CrimeHead,
  CrimeSubHead, Act, Section, CrimeHeadActSection,
  ReligionMaster, CasteMaster, OccupationMaster,
  CaseStatusMaster, UnitType, Rank, Designation
       │
       ▼
Phase 2b: Unit Hierarchy + Court (generate_phase2b.cjs)
  ~150 police stations, ~10 courts
       │
       ▼
Employee: 1000 Employee Records (generate_employee.cjs)
  Distributed across units by type with weighted rank selection
       │
       ▼
Phase 4: CaseMaster (generate_phase4.cjs)
  3000 cases with FK resolution to all lookup ROWIDs
       │
       ▼
Phase 5: Entities (generate_phase5.cjs)
  ComplainantDetails (~3000), Victim (~3500),
  Accused (~5000), ActSectionAssociation, ChargesheetDetails
       │
       ▼
Phase 6: Arrest/Surrender (generate_phase6.cjs)
  ~252 lines; linked to accused records
       │
       ▼
ROWID Mapping: generate_rowid_mappings.js
  Fetches Catalyst ROWIDs for all 24 tables after import
```

### Phase 1: Independent Lookup Tables

**File:** `data_pipeline/src/index.js` (67 lines)

Orchestrates 16 ES module generators, each following the same pattern:

```javascript
// Example: state.js
export const TABLE_NAME = 'State';
export const FILE_NAME = 'State.csv';
export const COLUMNS = [
  { id: 'StateID', title: 'StateID' },
  { id: 'StateName', title: 'StateName' },
  { id: 'NationalityID', title: 'NationalityID' },
  { id: 'Active', title: 'Active' },
];

export async function generate() {
  return [
    { StateID: 1, StateName: 'Karnataka', NationalityID: 1, Active: 'TRUE' },
  ];
}
```

Each generator exports `TABLE_NAME`, `FILE_NAME`, `COLUMNS`, and
`generate()`. This uniform interface allows the CSV writer helper
(`src/helpers/csv.js`) and import orchestrator (`run_phase.js`) to process
all tables identically.

**16 Generators:**

| Generator | Table | Records |
|-----------|-------|---------|
| `state.js` | State | 1 (Karnataka) |
| `district.js` | District | ~30 (Karnataka districts) |
| `caseCategory.js` | CaseCategory | ~10 categories |
| `gravityOffence.js` | GravityOffence | ~5 levels |
| `crimeHead.js` | CrimeHead | ~20 crime groups |
| `crimeSubHead.js` | CrimeSubHead | ~50 sub-heads |
| `act.js` | Act | ~15 IPC/CrPC acts |
| `section.js` | Section | ~100 sections |
| `crimeHeadActSection.js` | CrimeHeadActSection | Mappings |
| `religionMaster.js` | ReligionMaster | ~10 religions |
| `casteMaster.js` | CasteMaster | ~20 castes |
| `occupationMaster.js` | OccupationMaster | ~20 occupations |
| `caseStatusMaster.js` | CaseStatusMaster | ~10 statuses |
| `unitType.js` | UnitType | ~5 unit types |
| `rank.js` | Rank | ~15 police ranks |
| `designation.js` | Designation | ~15 designations |

### Phase 2b: Unit Hierarchy + Court

**File:** `data_pipeline/generate_phase2b.cjs` (314 lines)

Generates ~150 Unit records (police stations) with hierarchy:

- Commissionerates (Bengaluru, Mysuru, Hubballi, Mangaluru)
- Police Stations under each commissionerate
- Rural/CAR/IR/GRP units

And ~10 Court records distributed across districts.

### Employee Phase: 1000 Records

**File:** `data_pipeline/generate_employee.cjs` (215 lines)

Creates 1000 Employee records with:

- Realistic Indian names via Faker.js
- Weighted rank distribution (constable highest, senior officers lowest)
- Unit assignment matching unit type hierarchy
- Gender distribution (~85% male, ~15% female)
- Birth dates spanning 20–58 years ago

### Phase 4: CaseMaster

**File:** `data_pipeline/generate_phase4.cjs` (329 lines)

Generates 3000 CaseMaster records:

- **Incident dates:** Uniform distribution across 2024–2025
- **Crime types:** 20 types with weighted distribution:
  - Theft/Burglary: highest prevalence
  - Murder/Kidnapping: moderate
  - Cybercrime: lower but present
- **Geographic clustering:** 6 major hubs with Gaussian spread within 8km
  - Bengaluru: 35%
  - Mysuru: 15%
  - Hubballi: 15%
  - Mangaluru: 15%
  - Kalaburagi: 10%
  - Belagavi: 10%
- **BriefFacts:** Realistic narrative descriptions using Faker.js
  paragraph generation with crime-specific templates
- **FK resolution:** Maps lookup values to the actual Catalyst ROWIDs from
  mapping files

### Phase 5: Entities + Accused/Victim/Complainant

**File:** `data_pipeline/generate_phase5.cjs` (424 lines)

- **ComplainantDetails:** ~3000 records (one per case)
- **Victim:** ~3500 records (some cases have multiple victims)
- **Accused:** ~5000 records (some cases have multiple accused)
- **ActSectionAssociation:** Maps cases to IPC sections
- **ChargesheetDetails:** ~70% of cases have chargesheets

**Habitual Offenders:** 150 base identities with intentional name variations:

- Initials ("R. Kumar" vs "Ramesh Kumar")
- Typos ("Ramesh" vs "Ramehs")
- Truncated ("Venkatesh" vs "Venkatesh Gowda")
- Honorific differences ("Shri Ramesh" vs "Ramesh")

These variations test the entity matching engine's ability to correctly
resolve the same person across records.

### Phase 6: Arrest/Surrender

**File:** `data_pipeline/generate_phase6.cjs` (252 lines)

Generates Arrest/Surrender records linked to accused:
- ~60% arrests, ~30% surrender, ~10% both
- Linked to AccusedMasterID, PoliceStationID, CourtID
- Dates within the investigation window of the case

### Legacy Generator

**File:** `data_pipeline/generate_data.cjs` (414 lines)

An earlier all-in-one generator that produces:
- 3000 CaseMaster records with BriefFacts
- 5000 accused records with ~15% habitual repeats
- 150 habitual offenders with name variations
- 20 crime types
- Geographic clustering (same distribution)
- Ground truth identities CSV for entity matching validation

This script is being phased out in favor of the modular 9-phase approach.

## ROWID Mapping Strategy

### The Problem

Catalyst Data Store uses opaque alphanumeric ROWIDs as primary keys. The
generation scripts need to create foreign key references between tables
(e.g., CaseMaster.PoliceStationID → Unit.ROWID).

### Solution: Generate → Import → Map → Reference

1. **Generate** CSVs with business IDs (e.g., `StateID: 1`)
2. **Import** each CSV into Catalyst Data Store (Catalyst generates ROWIDs)
3. **Fetch** ROWIDs using `generate_rowid_mappings.js` (ESM, 123 lines)
4. **Store** mappings as JSON files in `data_pipeline/mappings/`

### Mapping File Structure

Each mapping file maps business IDs to Catalyst ROWIDs:

```json
{
  "1": "47995000000013046",
  "2": "47995000000013047",
  "3": "47995000000013048"
}
```

### 20 Mapping Files

```
mappings/
|-- State.json
|-- District.json
|-- CaseCategory.json
|-- CrimeHead.json
|-- CrimeSubHead.json
|-- Act.json
|-- Section.json
|-- CaseStatusMaster.json
|-- Unit.json
|-- UnitType.json
|-- Court.json
|-- Rank.json
|-- Designation.json
|-- Employee.json
|-- OccupationMaster.json
|-- ReligionMaster.json
|-- CasteMaster.json
|-- GravityOffence.json
|-- CrimeHeadActSection.json
|-- EmployeeMapping.json
```

### Fetching ROWIDs

`generate_rowid_mappings.js` connects to Catalyst via SDK, runs ZCQL
queries against each table, and writes the mappings:

```javascript
// Simplified logic
for (const table of TABLES) {
  const result = await app.zcql().executeZCQLQuery(
    `SELECT ROWID, ${idColumn} FROM ${table}`
  );
  const mappings = {};
  for (const row of result) {
    const key = row[tableAlias][idColumn];
    const rowid = row[tableAlias].ROWID;
    mappings[key] = rowid;
  }
  writeFileSync(`mappings/${table}.json`, JSON.stringify(mappings));
}
```

## CSV Output Format

All CSV files are written to `data_pipeline/data/` with standard formatting:

- Comma-separated values
- Double-quoted strings containing commas or special characters
- Unix line endings (`\n`)
- UTF-8 encoding

## Ground Truth Identity Generation

During Phase 5 generation, a `ground_truth_identities.csv` file is produced.
This file maps each source record to its "true" person identity, enabling
entity matching validation:

```csv
source_table,source_id,base_profile_id,name,age,gender
Accused,A-101,BP-001,Ramesh Kumar,34,M
Accused,A-102,BP-001,Ramesh K,34,M
Victim,V-201,BP-002,Lakshmi Devi,40,F
```

- **base_profile_id:** The ground truth person identity
- **source_table + source_id:** The individual source record
- Same `base_profile_id` = same real-world person

## Import Process

The `run_phase.js` (147 lines) orchestrator automates CSV import:

1. Generates CSV for each table in the phase
2. Imports via `catalyst ds:import <csv> --table <name>`
3. Polls for job completion (5s interval, 5min timeout)
4. After all tables in a phase are imported, generates ROWID mappings

## Validation

Two validation scripts verify data integrity:

| Script | Purpose |
|--------|---------|
| `validate_mappings.cjs` (129 lines) | Validates FK ROWID correctness across CaseMaster |
| `validate_phase5.cjs` (136 lines) | Validates Phase 5 data integrity (FK references exist) |
