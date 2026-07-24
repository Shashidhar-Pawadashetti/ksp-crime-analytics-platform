# UAT Test Queries — Phase 1 (Chat UI)

Use these queries in the chat UI to verify all intents work. Test in order for follow-up chains.

---

## 1. Structured Data Retrieval

| Query | Expected Result |
|-------|----------------|
| `list theft cases` | 50 records, CrimeGroupName = "Theft" |
| `show FIRs for murder in Bengaluru` | Cases with CrimeGroupName matching murder, DistrictName matching Bengaluru |
| `list kidnapping cases in Vijayapura` | Kidnapping cases in Vijayapura district |
| `count of cases in Bengaluru Urban` | Single count value (Result: NNN) |

### Follow-up Chain

| Step | Query | Expected |
|------|-------|----------|
| 1 | `list murder cases` | 50 records of murder cases |
| 2 | `how many in Bengaluru` | Count scoped to murder cases in Bengaluru (NOT all Bengaluru cases) |
| 3 | `list them` | Lists murder cases in Bengaluru |

| Step | Query | Expected |
|------|-------|----------|
| 1 | `list theft cases` | 50 theft records |
| 2 | `how many in Bengaluru` | Theft cases in Bengaluru only (not all crime types) |

---

## 2. Narrative / RAG

| Query | Expected Result |
|-------|----------------|
| `tell me about theft in Bengaluru` | Narrative answer with case descriptions, source CaseMasterIDs cited |
| `describe kidnapping cases` | Narrative from BriefFacts with 2-3 case excerpts |
| `what happened in the murder case` | Narrative with case details and citations |

---

## 3. Risk Scoring

| Query | Expected Result |
|-------|----------------|
| `risk score for Chandrika Singh` | 9/10 High — 2 cases, Counterfeiting + Riots |
| `risk score for Akash Sharma` | Score with case count and crime types |
| `risk score for John Doe` | "No criminal history found" |

---

## 4. Analytical / Trends

| Query | Expected Result |
|-------|----------------|
| `crime trends` | Top 10 crime types with counts |
| `monthly breakdown of crimes` | Cases grouped by date (300 rows) |
| `crime trend for Bengaluru last year` | (May fall back to global trend if location not applied) |

### Follow-up Chain

| Step | Query | Expected |
|------|-------|----------|
| 1 | `crime trends` | Top 10 crime types |
| 2 | `for Bengaluru` | Trends scoped to Bengaluru |

---

## 5. Error Handling

| Query | Expected Result |
|-------|----------------|
| (empty query, click send) | 400 error or client-side validation |
| `risk score for nonexistentperson123456` | "No criminal history found" |

---

## 6. Session Persistence

| Step | Action | Expected |
|------|--------|----------|
| 1 | Type `list theft cases` | Results returned with session_id |
| 2 | Refresh the page | Messages should reappear from localStorage |
| 3 | Type `how many in Bengaluru` | Follow-up context carries theft filter forward |

---

## 7. Network (if sync-full has been run)

| Query | Expected Result |
|-------|----------------|
| `show associates of Chandrika Singh` | Graph nodes/edges or "PersonMaster data not available" |
| `who is linked to Akash Sharma` | Network visualization or fallback message |
