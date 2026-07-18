"use strict";

// index.js
var https = require("https");
var catalyst = require("zcatalyst-sdk-node");
var QUICKML_URL = process.env.QUICKML_URL || "https://api.catalyst.zoho.in/quickml/v1/project/47995000000013046/glm/chat";
var QUICKML_MODEL = process.env.QUICKML_MODEL || "crm-di-glm47b_30b_it";
var CATALYST_ORG = process.env.CATALYST_ORG || "60073929329";
var CACHE_SEGMENT = "session";
var SESSION_TTL_HOURS = 1;
var ALLOWED_ZCQL_TABLES = {
  CaseMaster: true,
  Accused: true,
  Victim: true,
  ComplainantDetails: true,
  CrimeHead: true,
  CrimeSubHead: true,
  Unit: true,
  District: true,
  State: true,
  Employee: true,
  CaseStatusMaster: true,
  CaseCategory: true,
  GravityOffence: true,
  Court: true,
  Rank: true,
  Designation: true,
  UnitType: true,
  ReligionMaster: true,
  CasteMaster: true,
  OccupationMaster: true,
  Act: true,
  Section: true,
  ActSectionAssociation: true,
  CrimeHeadActSection: true,
  ChargesheetDetails: true,
  ArrestSurrender: true
};
var STRUCTURED_PATTERNS = /\b(how many|count|total|list\s+\w+|show\s+(me|all|the|FIR)|find\s+\w+|get\s+(me|all|the)|cases?\s+(in|registered|filed|reported)|FIR\s+details?|accused\s+details?|victim\s+details?|officer\s+|section\s+\w+|IPC|CrPC|charge\s+sheet)\b/i;
var NARRATIVE_PATTERNS = /\b(describe|what\s+happened|tell\s+me\s+about|modus\s+operandi|summary\s+of|overview\s+of|details?\s+about\s+case|brief\s+facts|incident\s+details?|sequence\s+of\s+events)\b/i;
var NETWORK_PATTERNS = /\b(associates?|linked\s+to|connected|co-accused|network|relationships?)\b/i;
var RISK_PATTERNS = /\b(risk\s+score|high-risk|repeat\s+offender|risk\s+level|dangerous|threat\s+level)\b/i;
var FORECAST_PATTERNS = /\b(predict|forecast|next\s+month|hotspot|trend(?:s|ing)?|pattern(?:s)?|seasonal|analysis|analytics|statistics?|breakdown|compare|most\s+common|crime\s+(?:trends?|analysis|statistics?|pattern|data|overview))\b/i;
var PM_TABLE_NAME = "PersonMaster";
var _pmCache = null;
async function ensurePersonMasterCache(app) {
  if (_pmCache && _pmCache.loaded) return _pmCache;
  var persons = {};
  var edges = [];
  try {
    var noSql = app.nosql();
    var table = await noSql.getTable(PM_TABLE_NAME);
    var { NoSQLItem, NoSQLEnum, NoSQLMarshall } = require("zcatalyst-sdk-node/lib/no-sql");
    var { NoSQLOperator } = NoSQLEnum;
    var queryBody = {
      key_condition: {
        attribute: ["person_id"],
        operator: NoSQLOperator.BEGINS_WITH,
        value: NoSQLMarshall.makeString("PM_")
      }
    };
    var response = await table.queryTable(queryBody);
    var items = response.getResponseData();
    for (var di = 0; di < items.length; di++) {
      var data = items[di];
      if (data && data.item) {
        var doc = data.item.to();
        if (doc && doc.person_id) {
          persons[doc.person_id] = doc;
          if (doc.adjacency) {
            var typeKeys = ["co_accused", "accused_to_victim", "shared_location", "unconfirmed_matches"];
            for (var ti = 0; ti < typeKeys.length; ti++) {
              var list = doc.adjacency[typeKeys[ti]] || [];
              for (var ei = 0; ei < list.length; ei++) {
                edges.push({
                  edge_id: list[ei].edge_id,
                  source: doc.person_id,
                  target: list[ei].person_id,
                  edge_type: typeKeys[ti] === "co_accused" ? "CO_ACCUSED" : typeKeys[ti] === "accused_to_victim" ? "ACCUSED_TO_VICTIM" : typeKeys[ti] === "shared_location" ? "SHARED_LOCATION" : "UNCONFIRMED_MATCH",
                  weight: list[ei].weight || 1,
                  occurrence_count: list[ei].occurrence_count || 0
                });
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed to load PersonMaster cache: " + err.message);
  }
  _pmCache = { persons, edges, loaded: true };
  return _pmCache;
}
function computeDegreeFromEdges(personId, edges) {
  var degree = { total: 0, CO_ACCUSED: 0, ACCUSED_TO_VICTIM: 0, SHARED_LOCATION: 0, UNCONFIRMED_MATCH: 0 };
  for (var ei = 0; ei < edges.length; ei++) {
    var e = edges[ei];
    if (e.source === personId || e.target === personId) {
      degree.total++;
      if (degree.hasOwnProperty(e.edge_type)) degree[e.edge_type]++;
    }
  }
  return degree;
}
function bfsTraversePM(persons, edges, startId, maxHops) {
  var visitedNodeIds = {};
  var visitedEdgeIds = {};
  var resultNodes = [];
  var resultEdges = [];
  var queue = [{ personId: startId, hopDistance: 0 }];
  visitedNodeIds[startId] = true;
  while (queue.length > 0) {
    var current = queue.shift();
    var person = persons[current.personId];
    resultNodes.push({
      person_id: current.personId,
      canonical_name: person ? person.canonical_name : "Unknown",
      roles_summary: person ? person.roles_summary : {},
      degree: computeDegreeFromEdges(current.personId, edges),
      hop_distance: current.hopDistance
    });
    if (current.hopDistance >= maxHops) continue;
    var nodeEdges = [];
    for (var ei = 0; ei < edges.length; ei++) {
      var e = edges[ei];
      if (e.source !== current.personId && e.target !== current.personId) continue;
      if (e.edge_type === "UNCONFIRMED_MATCH") continue;
      if (visitedEdgeIds[e.edge_id]) continue;
      nodeEdges.push(e);
    }
    var neighbours = {};
    for (var vi = 0; vi < nodeEdges.length; vi++) {
      var ve = nodeEdges[vi];
      neighbours[ve.source === current.personId ? ve.target : ve.source] = true;
    }
    for (var nid in neighbours) {
      if (visitedNodeIds[nid]) continue;
      visitedNodeIds[nid] = true;
      queue.push({ personId: nid, hopDistance: current.hopDistance + 1 });
      for (var vi2 = 0; vi2 < nodeEdges.length; vi2++) {
        var ve2 = nodeEdges[vi2];
        var otherId = ve2.source === current.personId ? ve2.target : ve2.source;
        if (otherId === nid && !visitedEdgeIds[ve2.edge_id]) {
          visitedEdgeIds[ve2.edge_id] = true;
          resultEdges.push(ve2);
        }
      }
    }
  }
  return { nodes: resultNodes, edges: resultEdges };
}
var SCHEMA_DESCRIPTION = `
Tables:
- CaseMaster (CaseMasterID, CrimeNo, CaseNo, CrimeRegisteredDate, PolicePersonID, PoliceStationID, CaseCategoryID, GravityOffenceID, CrimeMajorHeadID, CrimeMinorHeadID, CaseStatusID, CourtID, IncidentFromDate, IncidentToDate, InfoReceivedPSDate, Latitude, Longitude, BriefFacts)
- Accused (AccusedMasterID, CaseMasterID, AccusedName, AgeYear, GenderID, PersonID)
- Victim (VictimMasterID, CaseMasterID, VictimName, AgeYear, GenderID, VictimPolice)
- ComplainantDetails (ComplainantID, CaseMasterID, ComplainantName, AgeYear, OccupationID, ReligionID, CasteID, GenderID)
- CrimeHead (CrimeHeadID, CrimeGroupName, Active)
- CrimeSubHead (CrimeSubHeadID, CrimeHeadID, CrimeHeadName, SeqID)
- ActSectionAssociation (CaseMasterID, ActID, SectionID, ActOrderID, SectionOrderID)
- CrimeHeadActSection (CrimeHeadID, ActCode, SectionCode)
- Act (ActCode, ActDescription, ShortName, Active)
- Section (ActCode, SectionCode, SectionDescription, Active)
- CaseCategory (CaseCategoryID, LookupValue)
- CaseStatusMaster (CaseStatusID, CaseStatusName)
- GravityOffence (GravityOffenceID, LookupValue)
- Court (CourtID, CourtName, DistrictID, StateID, Active)
- Unit (UnitID, UnitName, TypeID, ParentUnit, NationalityID, StateID, DistrictID, Active)
- District (DistrictID, DistrictName, StateID, Active)
- State (StateID, StateName, NationalityID, Active)
- UnitType (UnitTypeID, UnitTypeName, CityDistState, Hierarchy, Active)
- Rank (RankID, RankName, Hierarchy, Active)
- Designation (DesignationID, DesignationName, Active, SortOrder)
- Employee (EmployeeID, FirstName, KGID, RankID, DesignationID, UnitID, DistrictID, EmployeeDOB, GenderID, BloodGroupID, PhysicallyChallenged, AppointmentDate)
- ReligionMaster (ReligionID, ReligionName)
- CasteMaster (caste_master_id, caste_master_name)
- OccupationMaster (OccupationID, OccupationName)
- ChargesheetDetails (CSID, CaseMasterID, csdate, cstype, PolicePersonID)
- ArrestSurrender (ArrestSurrenderID, CaseMasterID, ArrestSurrenderTypeID, ArrestSurrenderDate, ArrestSurrenderStateId, ArrestSurrenderDistrictId, PoliceStationID, IOID, CourtID, AccusedMasterID, IsAccused, IsComplainantAccused)

IMPORTANT: All FK columns store the target table's Catalyst ROWID (a long alphanumeric string). JOIN using ROWID pseudo-column:
- CaseMaster.PoliceStationID = Unit.ROWID
- Unit.DistrictID = District.ROWID
- District.StateID = State.ROWID
- Unit.TypeID = UnitType.ROWID
- CaseMaster.PolicePersonID = Employee.ROWID
- CaseMaster.CrimeMajorHeadID = CrimeHead.ROWID
- CaseMaster.CrimeMinorHeadID = CrimeSubHead.ROWID
- CaseMaster.CaseStatusID = CaseStatusMaster.ROWID
- CaseMaster.CaseCategoryID = CaseCategory.ROWID
- CaseMaster.GravityOffenceID = GravityOffence.ROWID
- CaseMaster.CourtID = Court.ROWID
- ComplainantDetails.CaseMasterID = CaseMaster.ROWID
- ComplainantDetails.OccupationID = OccupationMaster.ROWID
- ComplainantDetails.ReligionID = ReligionMaster.ROWID
- ComplainantDetails.CasteID = CasteMaster.ROWID
- Accused.CaseMasterID = CaseMaster.ROWID
- Victim.CaseMasterID = CaseMaster.ROWID
- ActSectionAssociation.CaseMasterID = CaseMaster.ROWID
- ActSectionAssociation.ActID = Act.ROWID
- ActSectionAssociation.SectionID = Section.ROWID
- ChargesheetDetails.CaseMasterID = CaseMaster.ROWID
- ChargesheetDetails.PolicePersonID = Employee.ROWID
- ArrestSurrender.CaseMasterID = CaseMaster.ROWID
- ArrestSurrender.PoliceStationID = Unit.ROWID
- ArrestSurrender.IOID = Employee.ROWID
- ArrestSurrender.CourtID = Court.ROWID
- ArrestSurrender.AccusedMasterID = Accused.ROWID
- ArrestSurrender.ArrestSurrenderStateId = State.ROWID
- ArrestSurrender.ArrestSurrenderDistrictId = District.ROWID
- CrimeSubHead.CrimeHeadID = CrimeHead.ROWID
- CrimeHeadActSection.CrimeHeadID = CrimeHead.ROWID
- Court.DistrictID = District.ROWID
- Court.StateID = State.ROWID
- Employee.RankID = Rank.ROWID
- Employee.UnitID = Unit.ROWID
- Employee.DistrictID = District.ROWID
- Employee.DesignationID = Designation.ROWID
`;
function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}
function sendError(res, status, errorCode, message) {
  sendJson(res, status, {
    status: "error",
    error_code: errorCode,
    message,
    fallback_answer: "I was unable to process your request at this time."
  });
}
function getBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}
function parseUrl(reqUrl) {
  const idx = reqUrl.indexOf("?");
  const path = idx === -1 ? reqUrl : reqUrl.slice(0, idx);
  const qs = idx === -1 ? "" : reqUrl.slice(idx + 1);
  const params = {};
  if (qs) {
    qs.split("&").forEach((p) => {
      const [k, v] = p.split("=");
      params[decodeURIComponent(k)] = decodeURIComponent(v || "");
    });
  }
  return { path, params };
}
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : r & 3 | 8).toString(16);
  });
}
async function queryFirst(app, sql) {
  try {
    const rows = await app.zcql().executeZCQLQuery(sql);
    return rows && rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}
function extractRow(row) {
  if (!row) return null;
  const key = Object.keys(row)[0];
  return row[key] || null;
}
function callQuickML(prompt, options = {}) {
  return new Promise((resolve, reject) => {
    const token = process.env.QUICKML_TOKEN;
    if (!token) {
      reject(new Error("QUICKML_TOKEN not configured"));
      return;
    }
    const body = JSON.stringify({
      model: QUICKML_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: options.temperature ?? 0.1,
      max_tokens: options.max_tokens ?? 500,
      chat_template_kwargs: { enable_thinking: false }
    });
    const urlObj = new URL(QUICKML_URL);
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Zoho-oauthtoken ${token}`,
        "CATALYST-ORG": CATALYST_ORG,
        "Content-Length": Buffer.byteLength(body)
      },
      timeout: 2e4
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("Failed to parse GLM response"));
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("GLM request timed out"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
function extractGLMContent(response) {
  if (response.choices && response.choices[0] && response.choices[0].message) {
    return response.choices[0].message.content;
  }
  if (response.response) {
    return response.response;
  }
  return null;
}
function classifyByKeyword(query) {
  if (NETWORK_PATTERNS.test(query)) return { intent: "network", confidence: 0.95 };
  if (RISK_PATTERNS.test(query)) return { intent: "risk", confidence: 0.95 };
  if (NARRATIVE_PATTERNS.test(query)) return { intent: "narrative", confidence: 0.85 };
  if (FORECAST_PATTERNS.test(query)) return { intent: "analytical", confidence: 0.95 };
  if (STRUCTURED_PATTERNS.test(query)) return { intent: "structured", confidence: 0.85 };
  return null;
}
async function classifyWithLLM(query) {
  const prompt = `Classify this crime database query into exactly one of these intents:

- structured: asking for specific data, counts, lists, FIR details, statistics
- narrative: asking for descriptions, summaries, what happened in a case
- network: asking about relationships between people, associates
- risk: asking about risk scores, dangerous offenders
- analytical: asking for predictions, trends, forecasts, patterns

Query: "${query}"

Respond ONLY with JSON: {"intent": "...", "confidence": 0.0-1.0}`;
  try {
    const response = await callQuickML(prompt, { temperature: 0.1, max_tokens: 100 });
    const content = extractGLMContent(response);
    if (!content) return null;
    const cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}
async function translateToSQL(query) {
  const prompt = `You are a ZCQL V2 generator for the KSP crime database.

${SCHEMA_DESCRIPTION}

Rules:
1. Return ONLY JSON: {"sql": "SELECT ...", "explanation": "..."}
2. SELECT only \u2014 never DDL/DML
3. INNER JOIN ... ON through FK chains via ROWID (every table used MUST be joined)
4. Never SELECT * \u2014 name columns explicitly (max 20)
5. Always qualify columns with table alias
6. Text search: LIKE '*text*' \u2014 dates: 'YYYY-MM-DD'
7. GenderID: 1=Male, 2=Female, 3=Other
8. COUNT(alias.Col) not COUNT(*); GROUP BY/ORDER BY/HAVING supported
9. String values in single quotes; IS for null checks
10. Use ONLY columns listed in the schema above. NEVER invent column names.
11. Every table alias (cm, cs, ch, u, d, a, v, etc.) MUST appear in a JOIN clause before being used in WHERE/SELECT

Template:
Query: "list FIRs for theft in Bengaluru Urban"
SQL: SELECT cm.CaseMasterID, cm.CrimeNo, cm.CrimeRegisteredDate, d.DistrictName FROM CaseMaster cm INNER JOIN CrimeSubHead cs ON cm.CrimeMinorHeadID = cs.ROWID INNER JOIN CrimeHead ch ON cs.CrimeHeadID = ch.ROWID INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID INNER JOIN District d ON u.DistrictID = d.ROWID WHERE ch.CrimeGroupName LIKE '*theft*' AND d.DistrictName = 'Bengaluru Urban' ORDER BY cm.CrimeRegisteredDate DESC LIMIT 50

Query: "${query}"

Respond ONLY with JSON.

Query: "${query}"

Respond ONLY with JSON.`;
  const response = await callQuickML(prompt, { temperature: 0.1, max_tokens: 300 });
  const content = extractGLMContent(response);
  if (!content) throw new Error("Empty response from GLM");
  const cleaned = content.replace(/```sql\s*/gi, "").replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed.sql) throw new Error("No SQL generated");
  return parsed;
}
function validateSQL(sql) {
  const FORBIDDEN = ["DROP", "DELETE", "INSERT", "UPDATE", "TRUNCATE", "ALTER", "CREATE", "EXEC", "EXECUTE", "MERGE", "REPLACE", "GRANT", "REVOKE", "CALL", "LOAD", "RENAME"];
  var upper = sql.toUpperCase();
  var noStrings = upper.replace(/'[^']*'/g, "");
  noStrings = noStrings.replace(/--.*$/gm, "");
  if (!/^\s*SELECT\b/.test(noStrings)) {
    throw new Error("UNSAFE_SQL: Only SELECT queries are allowed");
  }
  if ((noStrings.match(/;/g) || []).length > 0) {
    throw new Error("UNSAFE_SQL: Multiple statements detected");
  }
  for (var i = 0; i < FORBIDDEN.length; i++) {
    if (new RegExp("\\b" + FORBIDDEN[i] + "\\b").test(noStrings)) {
      throw new Error("UNSAFE_SQL: " + FORBIDDEN[i] + " not allowed");
    }
  }
  var tableRefs = noStrings.match(/(?:FROM|JOIN)\s+(\w+)/g) || [];
  for (var ti = 0; ti < tableRefs.length; ti++) {
    var parts = tableRefs[ti].split(/\s+/);
    var tableName = parts[1];
    if (tableName && tableName !== "FROM" && tableName !== "JOIN" && tableName.length > 3) {
      if (!ALLOWED_ZCQL_TABLES[tableName]) {
        throw new Error('UNSAFE_SQL: Table "' + tableName + '" is not in the allowed whitelist');
      }
    }
  }
}
async function executeSQL(app, sql) {
  validateSQL(sql);
  return await app.zcql().executeZCQLQuery(sql);
}
function extractKeywords(query) {
  const stopWords = /* @__PURE__ */ new Set(["the", "a", "an", "in", "of", "for", "on", "to", "at", "by", "with", "from", "is", "was", "are", "were", "what", "how", "show", "tell", "describe", "give", "find", "about", "me", "and", "or", "but", "not"]);
  const words = query.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));
  return words.slice(0, 5);
}
async function searchBriefFacts(app, query) {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];
  const conditions = keywords.map((k) => `cm.BriefFacts LIKE '*${k}*'`);
  const sql = `SELECT cm.CaseMasterID, cm.CrimeNo, cm.BriefFacts, cm.IncidentFromDate, d.DistrictName 
FROM CaseMaster cm INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID INNER JOIN District d ON u.DistrictID = d.ROWID
WHERE (${conditions.join(" OR ")}) 
AND cm.BriefFacts IS NOT NULL 
ORDER BY cm.IncidentFromDate DESC 
LIMIT 3`;
  try {
    const rows = await app.zcql().executeZCQLQuery(sql);
    return rows.map((r) => {
      const flat = {};
      for (const key of Object.keys(r)) {
        const val = r[key];
        if (val && typeof val === "object" && !Array.isArray(val)) {
          Object.assign(flat, val);
        } else {
          flat[key] = val;
        }
      }
      return flat;
    }).filter(Boolean);
  } catch {
    return [];
  }
}
async function generateRAGAnswer(query, excerpts) {
  if (excerpts.length === 0) {
    return "I could not find any case records matching your query.";
  }
  const contextBlock = excerpts.map(
    (e, i) => `[Case ${i + 1}] CaseMasterID: ${e.CaseMasterID}, CrimeNo: ${e.CrimeNo || "N/A"}, District: ${e.DistrictName || "N/A"}, Date: ${e.IncidentFromDate || "N/A"}
BriefFacts: ${e.BriefFacts || "No details available"}`
  ).join("\n\n");
  const prompt = `The user asked: "${query}"

Relevant case excerpts from the police database:
${contextBlock}

Answer based ONLY on the excerpts. Cite CaseMasterIDs. Be concise.`;
  const response = await callQuickML(prompt, { temperature: 0.1, max_tokens: 500 });
  return extractGLMContent(response) || "I was unable to generate an answer.";
}
function formatSQLResult(intent, result, sql) {
  const rows = result.rows || result;
  const isAgg = sql && /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(sql);
  if (isAgg && rows.length === 1) {
    const flat = zcqlRows(rows);
    const values = Object.values(flat[0]);
    const aggValue = values[0];
    return {
      intent,
      answer: `Result: ${aggValue}`,
      data: flat,
      source_refs: []
    };
  }
  const count = rows.length;
  return {
    intent,
    answer: `Found ${count} record(s).`,
    data: rows,
    source_refs: []
  };
}
function formatNarrativeResult(intent, answer, excerpts) {
  return {
    intent,
    answer,
    source_refs: excerpts.map((e) => `CaseMasterID:${e.CaseMasterID}`)
  };
}
function formatIntentResult(intent, message) {
  return {
    intent,
    answer: message || null,
    source_refs: []
  };
}
function extractPersonName(query) {
  const nameStopWords = /* @__PURE__ */ new Set(["show", "me", "the", "find", "get", "list", "what", "how", "who", "which", "all", "any", "describe", "tell", "about", "for", "of", "with", "and", "network", "associates", "connections", "linked", "connected", "risk", "score", "trend", "pattern", "crime", "cases", "case", "in", "at", "on", "by", "to", "from", "is", "was", "are", "were", "has", "have", "been", "being", "do", "does", "did", "will", "would", "could", "should", "can", "may", "might", "shall", "not", "no", "nor", "but", "or", "if", "then", "else", "than", "that", "this", "these", "those", "his", "her", "its", "their", "your", "our", "my", "mine", "yours", "theirs", "itself", "himself", "herself", "myself"]);
  const patterns = [
    /(?:associates?|connected|linked|co-accused|network|find|search|about)\s+(?:of\s+)?(\w+)/i,
    /(?:risk\s+)?score\s+(?:of\s+|for\s+)?(\w+)/i,
    /(\w+)(?:'s)?\s+(?:associates?|network|connections?|links?|relations?|risk\s+score)/i
  ];
  for (const p of patterns) {
    const m = query.match(p);
    if (m && m[1].length > 1 && !nameStopWords.has(m[1].toLowerCase())) return m[1];
  }
  const words = query.split(/\s+/);
  for (const w of words) {
    const cleaned = w.replace(/[^a-zA-Z]/g, "");
    if (cleaned && cleaned.length > 2 && /^[A-Z]/.test(cleaned) && !nameStopWords.has(cleaned.toLowerCase())) {
      return cleaned;
    }
  }
  return null;
}
function extractLocation(query) {
  const locMatch = query.match(/\b(in|of|at|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  if (locMatch) return locMatch[2];
  const knownDistricts = ["Bengaluru", "Bangalore", "Mysuru", "Mysore", "Hubli", "Dharwad", "Belagavi", "Belgaum", "Mangaluru", "Mangalore", "Shivamogga", "Shimoga", "Tumakuru", "Tumkur", "Kalaburagi", "Gulbarga", "Ballari", "Bellary", "Vijayapura", "Bijapur", "Davanagere", "Udupi", "Hassan", "Chitradurga", "Raichur", "Kolar", "Bidar", "Haveri", "Mandya", "Kodagu", "Chikkamagaluru", "Chikmagalur", "Ramanagara", "Chikkaballapur", "Yadgir", "Gadag"];
  for (const d of knownDistricts) {
    if (query.toLowerCase().includes(d.toLowerCase())) return d;
  }
  return null;
}
function extractTimePeriod(query) {
  const ql = query.toLowerCase();
  const now = /* @__PURE__ */ new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  if (/\bthis\s+month\b/i.test(ql)) return { label: `This month (${now.toLocaleString("en-US", { month: "long" })})`, since: `${y}-${m}-01` };
  if (/\blast\s+month\b/i.test(ql)) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lm = String(d.getMonth() + 1).padStart(2, "0");
    return { label: `Last month (${d.toLocaleString("en-US", { month: "long" })})`, since: `${d.getFullYear()}-${lm}-01` };
  }
  if (/\bthis\s+year\b/i.test(ql)) return { label: `This year (${y})`, since: `${y}-01-01` };
  if (/\blast\s+year\b/i.test(ql)) return { label: `Last year (${y - 1})`, since: `${y - 1}-01-01` };
  const yearMatch = ql.match(/\b(20\d{2})\b/);
  if (yearMatch) return { label: yearMatch[1], since: `${yearMatch[1]}-01-01` };
  return null;
}
function zcqlRows(rows) {
  if (!rows || rows.length === 0) return [];
  return rows.map((r) => {
    const flat = {};
    for (const key of Object.keys(r)) {
      const val = r[key];
      if (val && typeof val === "object" && !Array.isArray(val)) {
        Object.assign(flat, val);
      } else {
        flat[key] = val;
      }
    }
    return flat;
  });
}
async function handleNetwork(app, query) {
  const name = extractPersonName(query);
  if (!name) {
    return { intent: "network", answer: 'Please specify a person name (e.g. "show associates of Ravi").', data: [{ nodes: [], edges: [] }], source_refs: [] };
  }
  try {
    var cache = await ensurePersonMasterCache(app);
    if (!cache || !cache.loaded || Object.keys(cache.persons).length === 0) {
      return { intent: "network", answer: "PersonMaster data is not available. Please run sync-full first.", data: [{ nodes: [], edges: [] }], source_refs: [] };
    }
    var nameLower = name.toLowerCase();
    var matchedPersonIds = [];
    var personIds = Object.keys(cache.persons);
    for (var pi = 0; pi < personIds.length; pi++) {
      var doc = cache.persons[personIds[pi]];
      var match = false;
      if (doc.canonical_name && doc.canonical_name.toLowerCase().indexOf(nameLower) !== -1) match = true;
      if (!match && doc.aliases) {
        for (var ai = 0; ai < doc.aliases.length; ai++) {
          if (doc.aliases[ai].toLowerCase().indexOf(nameLower) !== -1) {
            match = true;
            break;
          }
        }
      }
      if (match) matchedPersonIds.push(personIds[pi]);
    }
    if (matchedPersonIds.length === 0) {
      return { intent: "network", answer: `No PersonMaster records found for "${name}". Try a different name or check if sync-full has been run.`, data: [{ nodes: [], edges: [] }], source_refs: [] };
    }
    var primaryId = matchedPersonIds[0];
    var maxHops = matchedPersonIds.length > 1 ? 1 : 2;
    var traversal = bfsTraversePM(cache.persons, cache.edges, primaryId, maxHops);
    var nodes = [];
    var edges = [];
    var seenNodeIds = {};
    var sourceRefs = [];
    var personNodeCount = 0;
    var caseNodeCount = 0;
    for (var ni = 0; ni < traversal.nodes.length; ni++) {
      var tn = traversal.nodes[ni];
      if (seenNodeIds[tn.person_id]) continue;
      seenNodeIds[tn.person_id] = true;
      var r = tn.roles_summary || {};
      var roles = [];
      if (r.accused_count > 0) roles.push("accused");
      if (r.victim_count > 0) roles.push("victim");
      if (r.complainant_count > 0) roles.push("complainant");
      nodes.push({
        id: tn.person_id,
        name: tn.canonical_name,
        type: "person",
        roles,
        hop_distance: tn.hop_distance
      });
      personNodeCount++;
      sourceRefs.push(tn.canonical_name);
    }
    for (var ei = 0; ei < traversal.edges.length; ei++) {
      var te = traversal.edges[ei];
      var edgeKey = te.source + "-" + te.target + "-" + te.edge_type;
      if (seenNodeIds[edgeKey]) continue;
      seenNodeIds[edgeKey] = true;
      edges.push({
        from: te.source,
        to: te.target,
        label: te.edge_type === "CO_ACCUSED" ? "co-accused" : te.edge_type === "ACCUSED_TO_VICTIM" ? "accused_to_victim" : te.edge_type === "SHARED_LOCATION" ? "shared_location" : te.edge_type
      });
    }
    var answer = "Found a network with " + personNodeCount + " person(s) connected across " + edges.length + " case(s).";
    return { intent: "network", answer, data: [{ nodes, edges }], source_refs: sourceRefs };
  } catch (err) {
    console.error("handleNetwork error: " + err.message);
    return { intent: "network", answer: "Unable to process network query. PersonMaster lookup failed.", data: [{ nodes: [], edges: [] }], source_refs: [] };
  }
}
async function handleRisk(app, query) {
  const name = extractPersonName(query);
  if (!name) {
    return { intent: "risk", answer: 'Please specify a person name (e.g. "risk score of Ravi").', risk_score: null, factors: [], source_refs: [] };
  }
  const accusedRows = zcqlRows(await app.zcql().executeZCQLQuery(
    `SELECT a.ROWID, a.AccusedName, a.CaseMasterID, cm.CrimeRegisteredDate, ch.CrimeGroupName
FROM Accused a INNER JOIN CaseMaster cm ON a.CaseMasterID = cm.ROWID INNER JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.ROWID
WHERE LOWER(a.AccusedName) LIKE '*${name.toLowerCase()}*' LIMIT 100`
  ).catch(() => []));
  if (accusedRows.length === 0) {
    return { intent: "risk", answer: `No criminal history found for "${name}".`, risk_score: 0, factors: ["No prior cases"], source_refs: [] };
  }
  const uniqueCaseCount = new Set(accusedRows.map((r) => r.CaseMasterID)).size;
  const uniqueCrimeTypes = new Set(accusedRows.map((r) => r.CrimeGroupName).filter(Boolean));
  const recidivism = uniqueCaseCount > 1;
  const score = Math.min(10, Math.round((uniqueCaseCount * 2.5 + (recidivism ? 2 : 0) + Math.min(uniqueCrimeTypes.size, 3)) * 10) / 10);
  const factors = [
    `${uniqueCaseCount} case(s) as accused`,
    ...recidivism ? ["Repeat offender"] : ["First-time offender"],
    ...uniqueCrimeTypes.size > 0 ? [`${uniqueCrimeTypes.size} distinct crime type(s): ${[...uniqueCrimeTypes].slice(0, 3).join(", ")}`] : []
  ];
  const severity = score >= 7 ? "High" : score >= 4 ? "Medium" : "Low";
  const answer = `${name} has a risk score of ${score}/10 (${severity}). ${factors.join(". ")}.`;
  return { intent: "risk", answer, risk_score: score, factors, severity, source_refs: [] };
}
async function handleAnalytical(app, query) {
  const location = extractLocation(query);
  const period = extractTimePeriod(query);
  const parts = [];
  if (location) parts.push(`in ${location}`);
  if (period) parts.push(period.label);
  const contextLabel = parts.length > 0 ? parts.join(" ") : "overall";
  const whereClauses = [];
  if (location) {
    whereClauses.push(`LOWER(d.DistrictName) LIKE '*${location.toLowerCase()}*'`);
  }
  if (period) {
    whereClauses.push(`cm.CrimeRegisteredDate >= '${period.since}'`);
  }
  const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const [crimeTypeRows, monthlyRows, locationRows] = await Promise.all([
    app.zcql().executeZCQLQuery(
      `SELECT ch.CrimeGroupName, COUNT(cm.CaseMasterID) AS cnt
FROM CaseMaster cm INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID INNER JOIN District d ON u.DistrictID = d.ROWID INNER JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.ROWID
${whereSQL}
GROUP BY ch.CrimeGroupName ORDER BY cnt DESC LIMIT 10`
    ).catch(() => []),
    app.zcql().executeZCQLQuery(
      `SELECT cm.CrimeRegisteredDate, COUNT(cm.CaseMasterID) AS cnt
FROM CaseMaster cm INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID INNER JOIN District d ON u.DistrictID = d.ROWID
${whereSQL}
GROUP BY cm.CrimeRegisteredDate ORDER BY cm.CrimeRegisteredDate DESC LIMIT 12`
    ).catch(() => []),
    app.zcql().executeZCQLQuery(
      `SELECT d.DistrictName, COUNT(cm.CaseMasterID) AS cnt
FROM CaseMaster cm INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID INNER JOIN District d ON u.DistrictID = d.ROWID
${whereSQL}
GROUP BY d.DistrictName ORDER BY cnt DESC LIMIT 10`
    ).catch(() => [])
  ]);
  const crimeTypes = zcqlRows(crimeTypeRows);
  const monthly = zcqlRows(monthlyRows);
  const byLocation = zcqlRows(locationRows);
  const total = crimeTypes.reduce((s, r) => s + Number(r.cnt || 0), 0);
  const topCrime = crimeTypes.length > 0 ? crimeTypes[0].CrimeGroupName : "N/A";
  const topCrimeCount = crimeTypes.length > 0 ? crimeTypes[0].cnt : 0;
  const topLocation = byLocation.length > 0 ? byLocation[0].DistrictName : "N/A";
  const trend = monthly.length >= 2 ? Number(monthly[0].cnt || 0) > Number(monthly[monthly.length - 1].cnt || 0) ? "increasing" : "decreasing" : "stable";
  const answer = `Crime analysis ${contextLabel}: ${total} total case(s). Top crime type: ${topCrime} (${topCrimeCount} case(s)). Highest crime district: ${topLocation}. Trend: ${trend}.`;
  return {
    intent: "analytical",
    answer,
    trends: {
      total_cases: total,
      top_crime_type: topCrime,
      top_crime_count: topCrimeCount,
      top_district: topLocation,
      direction: trend,
      crime_type_breakdown: crimeTypes.slice(0, 5),
      monthly_trend: monthly,
      location_breakdown: byLocation.slice(0, 5)
    },
    source_refs: []
  };
}
async function getOrCreateSession(app, employeeId, sessionId) {
  const seg = app.cache().segment(CACHE_SEGMENT);
  const cacheKey = `session:${employeeId}:${sessionId}`;
  let raw;
  try {
    raw = await seg.getValue(cacheKey);
  } catch {
    raw = null;
  }
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  const session = {
    session_id: sessionId,
    employee_id: Number(employeeId),
    rank_hierarchy: null,
    unit_hierarchy: null,
    unit_id: null,
    district_id: null,
    turns: []
  };
  try {
    const empRow = extractRow(await queryFirst(
      app,
      `SELECT EmployeeID, RankID, UnitID, DistrictID FROM Employee WHERE EmployeeID = ${Number(employeeId)}`
    ));
    if (empRow) {
      if (empRow.RankID) {
        const rankRow = extractRow(await queryFirst(
          app,
          `SELECT Hierarchy FROM Rank WHERE ROWID = ${String(empRow.RankID)}`
        ));
        if (rankRow) {
          session.rank_hierarchy = rankRow.Hierarchy ? Number(rankRow.Hierarchy) : null;
        }
      }
      if (empRow.UnitID) {
        const unitRow = extractRow(await queryFirst(
          app,
          `SELECT UnitID, TypeID FROM Unit WHERE ROWID = ${String(empRow.UnitID)}`
        ));
        if (unitRow) {
          session.unit_id = unitRow.UnitID ? Number(unitRow.UnitID) : session.unit_id;
          if (unitRow.TypeID) {
            const utRow = extractRow(await queryFirst(
              app,
              `SELECT UnitTypeID FROM UnitType WHERE ROWID = ${String(unitRow.TypeID)}`
            ));
            if (utRow) {
              session.unit_hierarchy = utRow.UnitTypeID ? Number(utRow.UnitTypeID) : null;
            }
          }
        }
      }
      if (empRow.DistrictID) {
        const distRow = extractRow(await queryFirst(
          app,
          `SELECT DistrictID FROM District WHERE ROWID = ${String(empRow.DistrictID)}`
        ));
        if (distRow) {
          session.district_id = distRow.DistrictID ? Number(distRow.DistrictID) : session.district_id;
        }
      }
    }
  } catch {
  }
  await seg.put(cacheKey, JSON.stringify(session), SESSION_TTL_HOURS);
  return session;
}
async function appendTurn(app, employeeId, sessionId, turn) {
  const seg = app.cache().segment(CACHE_SEGMENT);
  const cacheKey = `session:${employeeId}:${sessionId}`;
  let raw;
  try {
    raw = await seg.getValue(cacheKey);
  } catch {
    raw = null;
  }
  if (!raw) return false;
  let session;
  try {
    session = JSON.parse(raw);
  } catch {
    return false;
  }
  turn.turn_id = session.turns.length + 1;
  turn.timestamp = turn.timestamp || (/* @__PURE__ */ new Date()).toISOString();
  session.turns.push(turn);
  await seg.put(cacheKey, JSON.stringify(session), SESSION_TTL_HOURS);
  return true;
}
module.exports = async (req, res) => {
  let app;
  try {
    app = catalyst.initialize(req);
  } catch {
    sendError(res, 500, "INIT_FAILED", "Failed to initialize Catalyst SDK");
    return;
  }
  const { path, params } = parseUrl(req.url);
  const method = req.method.toUpperCase();
  if (method === "GET" && path === "/") {
    sendJson(res, 200, { status: "ok", service: "pipeline", version: "1.0.0" });
    return;
  }
  if (method !== "POST" || path !== "/query") {
    sendError(res, 404, "NOT_FOUND", "Route not found");
    return;
  }
  const body = await getBody(req);
  const { query, employee_id, session_id } = body;
  if (!query || typeof query !== "string") {
    sendError(res, 400, "MISSING_QUERY", "query field is required");
    return;
  }
  if (!employee_id) {
    sendError(res, 400, "MISSING_EMPLOYEE_ID", "employee_id is required");
    return;
  }
  try {
    const sid = session_id || uuid();
    const session = await getOrCreateSession(app, employee_id, sid);
    let kwResult = classifyByKeyword(query);
    if (!kwResult || kwResult.confidence < 0.6) {
      const llmResult = await classifyWithLLM(query);
      if (llmResult && llmResult.confidence >= 0.6) {
        kwResult = llmResult;
      } else {
        kwResult = { intent: "structured", confidence: 0.5, fallback: true };
      }
    }
    let result;
    switch (kwResult.intent) {
      case "structured": {
        const translation = await translateToSQL(query);
        let rows;
        let lastError;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            rows = await executeSQL(app, translation.sql);
            break;
          } catch (err) {
            lastError = err.message;
            if (attempt === 0) {
              const fixPrompt = `The following ZCQL query failed with error: "${lastError}". Fix it and return ONLY the corrected JSON: {"sql": "SELECT ...", "explanation": "..."}. Use ONLY columns from the schema. Every table alias MUST be joined.

Failing query: ${translation.sql}

Original request: ${query}`;
              const response = await callQuickML(fixPrompt, { temperature: 0, max_tokens: 200 });
              const content = extractGLMContent(response);
              if (content) {
                const cleaned = content.replace(/```sql\s*/gi, "").replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
                translation.sql = JSON.parse(cleaned).sql;
              }
            }
          }
        }
        if (!rows) throw new Error(lastError || "SQL execution failed");
        result = formatSQLResult("structured", rows, translation.sql);
        result.explanation = translation.explanation;
        break;
      }
      case "narrative": {
        const excerpts = await searchBriefFacts(app, query);
        const answer = await generateRAGAnswer(query, excerpts);
        result = formatNarrativeResult("narrative", answer, excerpts);
        break;
      }
      case "network":
        result = await handleNetwork(app, query);
        break;
      case "risk":
        result = await handleRisk(app, query);
        break;
      case "analytical":
        result = await handleAnalytical(app, query);
        break;
      default:
        result = formatIntentResult("structured");
    }
    await appendTurn(app, employee_id, sid, {
      role: "user",
      content: query,
      intent: kwResult.intent
    });
    await appendTurn(app, employee_id, sid, {
      role: "assistant",
      content: result.answer || result.message || "",
      intent: kwResult.intent,
      source_refs: result.source_refs || []
    });
    sendJson(res, 200, {
      status: "ok",
      data: {
        ...result,
        confidence: kwResult.confidence,
        fallback: kwResult.fallback || false,
        session_id: sid
      }
    });
  } catch (err) {
    sendError(res, 500, "PIPELINE_ERROR", err.message || "Pipeline execution failed");
  }
};
