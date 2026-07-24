'use strict';

const https = require('https');
const catalyst = require('zcatalyst-sdk-node');

const QUICKML_URL = process.env.QUICKML_URL || 'https://api.catalyst.zoho.in/quickml/v1/project/47995000000013046/glm/chat';
const RAG_ANSWER_URL = process.env.RAG_ANSWER_URL || 'https://api.catalyst.zoho.in/quickml/v1/project/47995000000013046/rag/answer';
const QUICKML_MODEL = process.env.QUICKML_MODEL || 'crm-di-glm47b_30b_it';
const CATALYST_ORG = process.env.CATALYST_ORG || '60073929329';
const CACHE_SEGMENT = 'session';
const GENDER_MAP = { '1': 'Male', '2': 'Female', '3': 'Other' };
const SESSION_TTL_HOURS = 1;

const ALLOWED_ZCQL_TABLES = {};
const ALLOWED_TABLE_NAMES = [
	'CaseMaster', 'Accused', 'Victim', 'ComplainantDetails',
	'CrimeHead', 'CrimeSubHead', 'Unit', 'District',
	'State', 'Employee', 'CaseStatusMaster', 'CaseCategory',
	'GravityOffence', 'Court', 'Rank', 'Designation',
	'UnitType', 'ReligionMaster', 'CasteMaster', 'OccupationMaster',
	'Act', 'Section', 'ActSectionAssociation', 'CrimeHeadActSection',
	'ChargesheetDetails', 'ArrestSurrender'
];
ALLOWED_TABLE_NAMES.forEach(function(t) { ALLOWED_ZCQL_TABLES[t.toUpperCase()] = true; });

const STRUCTURED_PATTERNS = /\b(how many|count|total|list\s+\w+|show\s+(me|all|the|FIR)|find\s+\w+|get\s+(me|all|the)|cases?\s+(in|registered|filed|reported)|FIR\s+details?|accused\s+details?|victim\s+details?|officer\s+|section\s+\w+|IPC|CrPC|charge\s+sheet)\b/i;
const NARRATIVE_PATTERNS = /\b(describe|what\s+happened|tell\s+me\s+about|modus\s+operandi|summary\s+of|overview\s+of|details?\s+about\s+case|brief\s+facts|incident\s+details?|sequence\s+of\s+events)\b/i;
const NETWORK_PATTERNS = /\b(associates?|linked\s+to|connected|co-accused|network|relationships?)\b/i;
const RISK_PATTERNS = /\b(risk\s+score|high-risk|repeat\s+offender|risk\s+level|dangerous|threat\s+level)\b/i;
const FORECAST_PATTERNS = /\b(predict|forecast|next\s+month|hotspot|trend(?:s|ing)?|pattern(?:s)?|seasonal|analysis|analytics|statistics?|breakdown|compare|most\s+common|crime\s+(?:trends?|analysis|statistics?|pattern|data|overview))\b/i;
const PM_TABLE_NAME = 'PersonMaster';
var _pmCache = null;

async function ensurePersonMasterCache(app) {
	if (_pmCache && _pmCache.loaded) return _pmCache;

	var persons = {};
	var edges = [];

	try {
		var noSql = app.nosql();
		var table = await noSql.getTable(PM_TABLE_NAME);
		var { NoSQLItem, NoSQLEnum, NoSQLMarshall } = require('zcatalyst-sdk-node/lib/no-sql');
		var { NoSQLOperator } = NoSQLEnum;

		var queryBody = {
			key_condition: {
				attribute: ['person_id'],
				operator: NoSQLOperator.BEGINS_WITH,
				value: NoSQLMarshall.makeString('PM_')
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
						var typeKeys = ['co_accused', 'accused_to_victim', 'shared_location', 'unconfirmed_matches'];
						for (var ti = 0; ti < typeKeys.length; ti++) {
							var list = doc.adjacency[typeKeys[ti]] || [];
							for (var ei = 0; ei < list.length; ei++) {
								edges.push({
									edge_id: list[ei].edge_id,
									source: doc.person_id,
									target: list[ei].person_id,
									edge_type: typeKeys[ti] === 'co_accused' ? 'CO_ACCUSED' :
										typeKeys[ti] === 'accused_to_victim' ? 'ACCUSED_TO_VICTIM' :
										typeKeys[ti] === 'shared_location' ? 'SHARED_LOCATION' : 'UNCONFIRMED_MATCH',
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
		console.error('Failed to load PersonMaster cache: ' + err.message);
	}

	_pmCache = { persons: persons, edges: edges, loaded: true };
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
			canonical_name: person ? person.canonical_name : 'Unknown',
			roles_summary: person ? person.roles_summary : {},
			degree: computeDegreeFromEdges(current.personId, edges),
			hop_distance: current.hopDistance
		});

		if (current.hopDistance >= maxHops) continue;

		var nodeEdges = [];
		for (var ei = 0; ei < edges.length; ei++) {
			var e = edges[ei];
			if (e.source !== current.personId && e.target !== current.personId) continue;
			if (e.edge_type === 'UNCONFIRMED_MATCH') continue;
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

const SCHEMA_DESCRIPTION = `
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

CRITICAL: Two paths to CrimeHead — choose based on query intent:
1. CrimeMajorHeadID → CrimeHead (DIRECT path) — Use when query asks about crime TYPE/GROUP/CATEGORY (CrimeGroupName column). Example: "theft cases", "murder cases", "crime types by count", "crimes against body". JOIN: INNER JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.ROWID. Returns CrimeGroupName like "Crimes Against Body".
2. CrimeMinorHeadID → CrimeSubHead → CrimeHead (VIA CrimeSubHead) — Use ONLY when query asks about SPECIFIC crime SUB-HEAD/SUB-TYPE (CrimeHeadName column). Example: "pickpocketing", "dacoity". JOIN: INNER JOIN CrimeSubHead cs ON cm.CrimeMinorHeadID = cs.ROWID INNER JOIN CrimeHead ch ON cs.CrimeHeadID = ch.ROWID. Returns CrimeHeadName.
RULE: If query asks about crime GROUP/COUNT/TREND by type, use Path 1 (direct). ONLY use Path 2 if query explicitly asks about sub-types or needs CrimeHeadName.
`;

function sendJson(res, status, data) {
	res.writeHead(status, {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization'
	});
	res.end(JSON.stringify(data));
}

function sendError(res, status, errorCode, message) {
	sendJson(res, status, {
		status: 'error',
		error_code: errorCode,
		message,
		fallback_answer: 'I was unable to process your request at this time.'
	});
}

function getBody(req) {
	return new Promise((resolve) => {
		let body = '';
		req.on('data', (chunk) => (body += chunk));
		req.on('end', () => {
			try {
				resolve(body ? JSON.parse(body) : {});
			} catch {
				resolve({});
			}
		});
	});
}

function parseUrl(reqUrl) {
	const idx = reqUrl.indexOf('?');
	const path = idx === -1 ? reqUrl : reqUrl.slice(0, idx);
	const qs = idx === -1 ? '' : reqUrl.slice(idx + 1);
	const params = {};
	if (qs) {
		qs.split('&').forEach((p) => {
			const [k, v] = p.split('=');
			params[decodeURIComponent(k)] = decodeURIComponent(v || '');
		});
	}
	return { path, params };
}

function uuid() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
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
			reject(new Error('QUICKML_TOKEN not configured'));
			return;
		}

		const body = JSON.stringify({
			model: QUICKML_MODEL,
			messages: [{ role: 'user', content: prompt }],
			temperature: options.temperature ?? 0.1,
			max_tokens: options.max_tokens ?? 500,
			chat_template_kwargs: { enable_thinking: false },
		});

		const urlObj = new URL(QUICKML_URL);
		const opts = {
			hostname: urlObj.hostname,
			path: urlObj.pathname,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Zoho-oauthtoken ${token}`,
				'CATALYST-ORG': CATALYST_ORG,
				'Content-Length': Buffer.byteLength(body),
			},
			timeout: 20000,
		};

		const req = https.request(opts, (res) => {
			let data = '';
			res.on('data', (chunk) => (data += chunk));
			res.on('end', () => {
				try {
					resolve(JSON.parse(data));
				} catch {
					reject(new Error('Failed to parse GLM response'));
				}
			});
		});

		req.on('timeout', () => { req.destroy(); reject(new Error('GLM request timed out')); });
		req.on('error', reject);
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
	if (NETWORK_PATTERNS.test(query)) return { intent: 'network', confidence: 0.95 };
	if (RISK_PATTERNS.test(query)) return { intent: 'risk', confidence: 0.95 };
	if (NARRATIVE_PATTERNS.test(query)) return { intent: 'narrative', confidence: 0.85 };
	if (FORECAST_PATTERNS.test(query)) return { intent: 'analytical', confidence: 0.95 };
	if (STRUCTURED_PATTERNS.test(query)) return { intent: 'structured', confidence: 0.85 };
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
		const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
		return JSON.parse(cleaned);
	} catch {
		return null;
	}
}

async function translateToZCQL(query, turns) {
	var previousQuery = null;
	var previousSQL = null;
	if (turns && turns.length > 0) {
		for (var ti = turns.length - 1; ti >= 0; ti--) {
			var t = turns[ti];
			if (t.role === 'user' && !previousQuery) {
				previousQuery = String(t.content || '');
			}
			if (t.role === 'assistant' && t.query_context && !previousSQL) {
				previousSQL = String(t.query_context || '');
			}
		}
	}

	var contextInjection = '';
	if (previousQuery && previousSQL) {
		contextInjection = '\n\nCONTEXT — The user\'s new query "' + query + '" is a FOLLOW-UP to their previous query "' + previousQuery.substring(0, 80) + '". The previous query used filters from: ' + previousSQL.substring(0, 120) + '. You MUST apply the same filters to the new query unless the user explicitly changes them. For example, if previous was "list theft cases" and new is "how many in Bengaluru", the new query means "how many theft cases in Bengaluru" — carry forward the crime type filter.';
	}

	const prompt = `You are a ZCQL V2 generator for the KSP crime database. This is NOT standard SQL — Catalyst ZCQL V2 has different syntax rules that MUST be followed.

${SCHEMA_DESCRIPTION}

ZCQL V2 Rules (MANDATORY — standard SQL rules do NOT apply):
1. Return ONLY JSON: {"sql": "SELECT ...", "explanation": "..."}
2. SELECT only — never DDL/DML
3. INNER JOIN ... ON through FK chains via ROWID (every table used MUST be joined, comma joins are NOT supported)
4. Never SELECT * — name columns explicitly (max 20)
5. Always qualify columns with table alias (e.g., cm.CaseMasterID)
6. LIKE wildcard: * not % (e.g., LIKE '*theft*' NOT LIKE '%theft%')
7. COUNT(alias.Col) not COUNT(*) (e.g., COUNT(cm.CaseMasterID) NOT COUNT(*))
8. No column aliases — never use AS in SELECT (e.g., COUNT(cm.CaseMasterID) is fine, COUNT(cm.CaseMasterID) AS cnt is WRONG)
9. String values in single quotes; IS for null checks (IS NULL / IS NOT NULL)
10. Use ONLY columns listed in the schema above. NEVER invent column names.
11. Every table alias MUST appear in a JOIN clause before being used in WHERE/SELECT
12. GenderID: 1=Male, 2=Female, 3=Other
13. GROUP BY/ORDER BY/HAVING supported
14. LIMIT syntax: LIMIT count (not LIMIT count OFFSET offset)
15. No semicolon at end
16. Dates: 'YYYY-MM-DD' format in single quotes
17. District name matching: use LIKE for partial matching (e.g., d.DistrictName LIKE '*Bengaluru*' matches 'Bengaluru Urban') — never exact equality on district names since users type partial names

Template:
Query: "list FIRs for theft in Bengaluru Urban"
SQL PATH 1 (direct via CrimeMajorHeadID — for crime GROUP queries): SELECT cm.CaseMasterID, cm.CrimeNo, cm.CrimeRegisteredDate, ch.CrimeGroupName, d.DistrictName FROM CaseMaster cm INNER JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.ROWID INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID INNER JOIN District d ON u.DistrictID = d.ROWID WHERE ch.CrimeGroupName LIKE '*theft*' AND d.DistrictName LIKE '*Bengaluru*' ORDER BY cm.CrimeRegisteredDate DESC LIMIT 50
SQL PATH 2 (via CrimeMinorHeadID → CrimeSubHead — for crime SUB-TYPE queries): SELECT cm.CaseMasterID, cm.CrimeNo, cm.CrimeRegisteredDate, cs.CrimeHeadName, d.DistrictName FROM CaseMaster cm INNER JOIN CrimeSubHead cs ON cm.CrimeMinorHeadID = cs.ROWID INNER JOIN CrimeHead ch ON cs.CrimeHeadID = ch.ROWID INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID INNER JOIN District d ON u.DistrictID = d.ROWID WHERE cs.CrimeHeadName LIKE '*theft*' AND d.DistrictName LIKE '*Bengaluru*' ORDER BY cm.CrimeRegisteredDate DESC LIMIT 50
PREFER Path 1 unless query explicitly asks for sub-head names.

Query: "${query}"${contextInjection}

Respond ONLY with JSON.`;

	const response = await callQuickML(prompt, { temperature: 0.1, max_tokens: 300 });
	const content = extractGLMContent(response);
	if (!content) throw new Error('Empty response from GLM');
	const cleaned = content.replace(/```sql\s*/gi, '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
	const parsed = JSON.parse(cleaned);
	if (!parsed.sql) throw new Error('No SQL generated');
	return parsed;
}

function validateSQL(sql) {
	const FORBIDDEN = ['DROP', 'DELETE', 'INSERT', 'UPDATE', 'TRUNCATE', 'ALTER', 'CREATE', 'EXEC', 'EXECUTE', 'MERGE', 'REPLACE', 'GRANT', 'REVOKE', 'CALL', 'LOAD', 'RENAME'];

	var upper = sql.toUpperCase();
	var noStrings = upper.replace(/'[^']*'/g, '');
	noStrings = noStrings.replace(/--.*$/gm, '');

	if (!/^\s*SELECT\b/.test(noStrings)) {
		throw new Error('UNSAFE_SQL: Only SELECT queries are allowed');
	}

	if ((noStrings.match(/;/g) || []).length > 0) {
		throw new Error('UNSAFE_SQL: Multiple statements detected');
	}

	for (var i = 0; i < FORBIDDEN.length; i++) {
		if (new RegExp('\\b' + FORBIDDEN[i] + '\\b').test(noStrings)) {
			throw new Error('UNSAFE_SQL: ' + FORBIDDEN[i] + ' not allowed');
		}
	}

	var tableRefs = noStrings.match(/(?:FROM|JOIN)\s+(\w+)/g) || [];
	for (var ti = 0; ti < tableRefs.length; ti++) {
		var parts = tableRefs[ti].split(/\s+/);
		var tableName = parts[1];
		if (tableName && tableName !== 'FROM' && tableName !== 'JOIN' && tableName.length > 3) {
			if (!ALLOWED_ZCQL_TABLES[tableName]) {
				throw new Error('UNSAFE_SQL: Table "' + tableName + '" is not in the allowed whitelist');
			}
		}
	}
}

function cleanZCQL(sql) {
	return sql.replace(/\bAS\s+\w+\b/gi, '');
}

async function executeZCQL(app, sql) {
	validateSQL(sql);
	return await app.zcql().executeZCQLQuery(sql);
}

function extractKeywords(query) {
	const stopWords = new Set(['the', 'a', 'an', 'in', 'of', 'for', 'on', 'to', 'at', 'by', 'with', 'from', 'is', 'was', 'are', 'were', 'what', 'how', 'show', 'tell', 'describe', 'give', 'find', 'about', 'me', 'and', 'or', 'but', 'not']);
	const words = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
	return words.slice(0, 5);
}

function flatRows(rows) {
	return rows.map(r => {
		const flat = {};
		for (const key of Object.keys(r)) {
			const val = r[key];
			if (val && typeof val === 'object' && !Array.isArray(val)) {
				Object.assign(flat, val);
			} else {
				flat[key] = val;
			}
		}
		return flat;
	}).filter(Boolean);
}

function gender(val) {
	return GENDER_MAP[String(val)] || val || '';
}

async function expandKeywords(query) {
	const prompt = `Extract key search terms from this police crime query. Return ONLY a JSON array of strings. Do not include stop words or very common words. Focus on crime types, locations, person names, and case-specific terms.

Query: "${query}"

Return ONLY a JSON array like: ["theft", "Bengaluru", "2024"]`;

	try {
		const response = await callQuickML(prompt, { temperature: 0.1, max_tokens: 200 });
		const content = extractGLMContent(response);
		if (!content) return [];
		const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
		const parsed = JSON.parse(cleaned);
		if (Array.isArray(parsed)) {
			return parsed.filter(k => k.length > 2).slice(0, 8);
		}
		return [];
	} catch {
		return [];
	}
}

async function getKeywords(query) {
	const basic = extractKeywords(query);
	try {
		const expanded = await expandKeywords(query);
		const all = [...new Set([...basic, ...expanded])];
		return all.slice(0, 8);
	} catch {
		return basic;
	}
}

const MAX_EXCERPTS = 3;

async function searchBriefFacts(app, keywords) {
	if (keywords.length === 0) return [];

	const conditions = keywords.slice(0, 5).map(k => `cm.BriefFacts LIKE '*${k}*'`);
	const sql = `SELECT cm.ROWID, cm.CaseMasterID, cm.CrimeNo, cm.BriefFacts, cm.IncidentFromDate, cm.CrimeMajorHeadID, d.DistrictName, ch.CrimeGroupName, u.UnitName
FROM CaseMaster cm
INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID
INNER JOIN District d ON u.DistrictID = d.ROWID
LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.ROWID
WHERE (${conditions.join(' OR ')}) 
AND cm.BriefFacts IS NOT NULL 
ORDER BY cm.IncidentFromDate DESC
LIMIT 15`;

	try {
		const rows = await app.zcql().executeZCQLQuery(sql);
		const flat = flatRows(rows);
		return flat.map(row => {
			const text = (row.BriefFacts || '').toLowerCase();
			const matches = keywords.filter(k => text.includes(k.toLowerCase()));
			return { ...row, _score: matches.length, _source: 'briefFacts' };
		}).sort((a, b) => b._score - a._score || new Date(b.IncidentFromDate || 0) - new Date(a.IncidentFromDate || 0))
		.slice(0, MAX_EXCERPTS);
	} catch {
		return [];
	}
}

async function searchPersons(app, keywords) {
	if (keywords.length === 0) return [];

	const queries = [
		{ sql: (kw) => `SELECT CaseMasterID, AccusedName FROM Accused WHERE AccusedName LIKE '*${kw}*' LIMIT 15`, role: 'ACCUSED' },
		{ sql: (kw) => `SELECT CaseMasterID, VictimName FROM Victim WHERE VictimName LIKE '*${kw}*' LIMIT 15`, role: 'VICTIM' },
		{ sql: (kw) => `SELECT CaseMasterID, ComplainantName FROM ComplainantDetails WHERE ComplainantName LIKE '*${kw}*' LIMIT 15`, role: 'COMPLAINANT' },
	];

	const caseRowIds = new Set();
	const personInfo = {}; // CaseMasterROWID -> [{name, role}]

	for (const kw of keywords) {
		for (const q of queries) {
			try {
				const rows = flatRows(await app.zcql().executeZCQLQuery(q.sql(kw)));
				for (const r of rows) {
					const rid = r.CaseMasterID;
					caseRowIds.add(rid);
					if (!personInfo[rid]) personInfo[rid] = [];
					const name = r.AccusedName || r.VictimName || r.ComplainantName || r.person_name || 'unknown';
					personInfo[rid].push({ name, role: r.role || q.role || 'UNKNOWN' });
				}
			} catch {
				continue;
			}
		}
	}

	if (caseRowIds.size === 0) return [];

	const caseIds = Array.from(caseRowIds);
	const ids = caseIds.map(id => `'${id}'`).join(',');
	const caseSql = `SELECT cm.ROWID, cm.CaseMasterID, cm.CrimeNo, cm.BriefFacts, cm.IncidentFromDate
FROM CaseMaster cm
WHERE cm.ROWID IN (${ids}) AND cm.BriefFacts IS NOT NULL
LIMIT 15`;

	let caseRows = [];
	try {
		caseRows = flatRows(await app.zcql().executeZCQLQuery(caseSql));
	} catch {
		return [];
	}

	return caseRows.map(r => {
		const persons = personInfo[r.ROWID] || [];
		const pmap = new Map();
		for (const p of persons) {
			const key = `${p.role}:${p.name}`;
			if (!pmap.has(key)) pmap.set(key, p);
		}
		return {
			...r,
			_matchedPersons: Array.from(pmap.values()),
			_score: Array.from(pmap.values()).length * 2,
			_source: 'person',
		};
	}).sort((a, b) => b._score - a._score || new Date(b.IncidentFromDate || 0) - new Date(a.IncidentFromDate || 0))
	.slice(0, MAX_EXCERPTS);
}

async function enrichMatches(app, matches) {
	if (matches.length === 0) return [];

	const rowids = matches.map(m => m.ROWID).filter(Boolean);
	if (rowids.length === 0) return matches;

	const ids = rowids.map(id => `'${id}'`).join(',');
	const enrichSql = `SELECT cm.ROWID, cs.CaseStatusName, ct.CourtName
FROM CaseMaster cm
LEFT JOIN CaseStatusMaster cs ON cm.CaseStatusID = cs.ROWID
LEFT JOIN Court ct ON cm.CourtID = ct.ROWID
WHERE cm.ROWID IN (${ids})`;

	const sectionSql = `SELECT a.CaseMasterID, act.ShortName, act.ActDescription, sec.SectionCode
FROM ActSectionAssociation a
LEFT JOIN Act act ON a.ActID = act.ROWID
LEFT JOIN Section sec ON a.SectionID = sec.ROWID
WHERE a.CaseMasterID IN (${ids})`;

	let enrichRows = [];
	let sectionRows = [];
	try {
		enrichRows = flatRows(await app.zcql().executeZCQLQuery(enrichSql));
	} catch {}
	try {
		sectionRows = flatRows(await app.zcql().executeZCQLQuery(sectionSql));
	} catch {}

	const enrichMap = new Map(enrichRows.map(r => [r.ROWID, r]));
	const sectionMap = new Map();
	for (const s of sectionRows) {
		const key = s.CaseMasterID;
		if (!sectionMap.has(key)) sectionMap.set(key, []);
		const label = s.ShortName || s.ActDescription || '';
		const code = s.SectionCode || '';
		const full = code ? `${label} ${code}` : label;
		if (full) sectionMap.get(key).push(full);
	}

	for (const m of matches) {
		const e = enrichMap.get(m.ROWID);
		if (e) {
			m.CaseStatusName = e.CaseStatusName;
			m.CourtName = e.CourtName;
		}
		const secs = sectionMap.get(m.ROWID);
		if (secs && secs.length > 0) m.Sections = secs.join(', ');
	}

	return matches;
}

function buildContext(matches) {
	return matches.map((m, i) => {
		const lines = [];
		lines.push(`[Case ${i + 1}] CaseMasterID: ${m.CaseMasterID || 'N/A'}, CrimeNo: ${m.CrimeNo || 'N/A'}`);
		if (m.DistrictName) lines.push(`  District: ${m.DistrictName}`);
		if (m.UnitName) lines.push(`  Station: ${m.UnitName}`);
		if (m.CrimeGroupName) lines.push(`  Crime Type: ${m.CrimeGroupName}`);
		if (m.CaseStatusName) lines.push(`  Status: ${m.CaseStatusName}`);
		if (m.CourtName) lines.push(`  Court: ${m.CourtName}`);
		if (m.IncidentFromDate) lines.push(`  Date: ${m.IncidentFromDate}`);
		if (m.Sections) lines.push(`  Sections: ${m.Sections}`);
		if (m._matchedPersons && m._matchedPersons.length > 0) {
			const persons = m._matchedPersons.map(p => `${p.role}: ${p.name}`).join(', ');
			lines.push(`  Persons Matched: ${persons}`);
		}
		lines.push(`  BriefFacts: ${m.BriefFacts || 'No details available'}`);
		return lines.join('\n');
	}).join('\n\n');
}

async function generateRAGAnswer(query, matches) {
	if (matches.length === 0) {
		return 'I could not find any case records matching your query.';
	}

	const contextBlock = buildContext(matches);

	const prompt = `You are a crime analysis assistant for Karnataka State Police. 

The user asked: "${query}"

Below are relevant case records from the police database. Answer the user's question based ONLY on these records.

${contextBlock}

Rules:
1. Answer based ONLY on the provided records — never add external information
2. Cite the CaseMasterID for each piece of information you use like [CaseMasterID:123]
3. Be concise and factual
4. If the records don't fully answer the query, say "Based on available records, ..." and state what you can confirm
5. When multiple records are relevant, synthesize across them
6. If records are empty or irrelevant, say "I don't have enough information to answer that question."`;

	const response = await callQuickML(prompt, { temperature: 0.1, max_tokens: 500 });
	return extractGLMContent(response) || 'I was unable to generate an answer.';
}

async function queryRAGFallback(query) {
	const token = process.env.QUICKML_TOKEN;
	if (!token) return null;

	const body = JSON.stringify({ query });

	const urlObj = new URL(RAG_ANSWER_URL);

	return new Promise((resolve) => {
		const opts = {
			hostname: urlObj.hostname,
			path: urlObj.pathname,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Zoho-oauthtoken ${token}`,
				'CATALYST-ORG': CATALYST_ORG,
				'Content-Length': Buffer.byteLength(body),
			},
			timeout: 20000,
		};

		const req = https.request(opts, (res) => {
			let data = '';
			res.on('data', (chunk) => (data += chunk));
			res.on('end', () => {
				try {
					const parsed = JSON.parse(data);
					const answer = parsed.answer || parsed.response || parsed.result;
					resolve(answer || null);
				} catch {
					resolve(null);
				}
			});
		});

		req.on('timeout', () => { req.destroy(); resolve(null); });
		req.on('error', () => resolve(null));
		req.write(body);
		req.end();
	});
}

function formatZCQLResult(intent, result, sql) {
	const raw = result.rows || result;
	const flat = zcqlRows(raw);
	const isAgg = sql && /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(sql);
	if (isAgg && flat.length === 1) {
		const values = Object.values(flat[0]);
		const aggValue = values[0];
		return {
			intent,
			answer: `Result: ${aggValue}`,
			data: flat,
			source_refs: []
		};
	}
	return {
		intent,
		answer: `Found ${flat.length} record(s).`,
		data: flat,
		source_refs: []
	};
}

function formatNarrativeResult(intent, answer, excerpts) {
	return {
		intent,
		answer,
		source_refs: excerpts.map(e => `CaseMasterID:${e.CaseMasterID}`)
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
	const nameStopWords = new Set(['show','me','the','find','get','list','what','how','who','which','all','any','describe','tell','about','for','of','with','and','network','associates','connections','linked','connected','risk','score','trend','pattern','crime','cases','case','in','at','on','by','to','from','is','was','are','were','has','have','been','being','do','does','did','will','would','could','should','can','may','might','shall','not','no','nor','but','or','if','then','else','than','that','this','these','those','his','her','its','their','your','our','my','mine','yours','theirs','itself','himself','herself','myself','involved','crimes']);
	const patterns = [
		/(?:associates?|connected|linked|co-accused|network|find|search|about)\s+(?:of\s+)?(\w+(?:\s+\w+)?)/i,
		/(?:risk\s+)?score\s+(?:of\s+|for\s+)?(\w+(?:\s+\w+)?)/i,
		/(\w+(?:\s+\w+)?)(?:'s)?\s+(?:associates?|network|connections?|links?|relations?|risk\s+score)/i,
	];
	for (const p of patterns) {
		const m = query.match(p);
		if (m && m[1].length > 1) {
			const nameWords = m[1].split(/\s+/);
			if (nameWords.every(w => !nameStopWords.has(w.toLowerCase()))) return m[1].trim();
		}
	}
	const words = query.split(/\s+/);
	for (const w of words) {
		const cleaned = w.replace(/[^a-zA-Z]/g, '');
		if (cleaned && cleaned.length > 2 && !nameStopWords.has(cleaned.toLowerCase())) {
			return cleaned;
		}
	}
	return null;
}

function extractLocation(query) {
	const locMatch = query.match(/\b(in|of|at|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
	if (locMatch) return locMatch[2];
	const knownDistricts = ['Bengaluru','Bangalore','Mysuru','Mysore','Hubli','Dharwad','Belagavi','Belgaum','Mangaluru','Mangalore','Shivamogga','Shimoga','Tumakuru','Tumkur','Kalaburagi','Gulbarga','Ballari','Bellary','Vijayapura','Bijapur','Davanagere','Udupi','Hassan','Chitradurga','Raichur','Kolar','Bidar','Haveri','Mandya','Kodagu','Chikkamagaluru','Chikmagalur','Ramanagara','Chikkaballapur','Yadgir','Gadag'];
	for (const d of knownDistricts) {
		if (query.toLowerCase().includes(d.toLowerCase())) return d;
	}
	return null;
}

function extractTimePeriod(query) {
	const ql = query.toLowerCase();
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, '0');
	if (/\bthis\s+month\b/i.test(ql)) return { label: `This month (${now.toLocaleString('en-US', { month: 'long' })})`, since: `${y}-${m}-01` };
	if (/\blast\s+month\b/i.test(ql)) {
		const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
		const lm = String(d.getMonth() + 1).padStart(2, '0');
		return { label: `Last month (${d.toLocaleString('en-US', { month: 'long' })})`, since: `${d.getFullYear()}-${lm}-01` };
	}
	if (/\bthis\s+year\b/i.test(ql)) return { label: `This year (${y})`, since: `${y}-01-01` };
	if (/\blast\s+year\b/i.test(ql)) return { label: `Last year (${y - 1})`, since: `${y - 1}-01-01` };
	const yearMatch = ql.match(/\b(20\d{2})\b/);
	if (yearMatch) return { label: yearMatch[1], since: `${yearMatch[1]}-01-01` };
	return null;
}

function zcqlRows(rows) {
	if (!rows || rows.length === 0) return [];
	return rows.map(r => {
		const flat = {};
		for (const key of Object.keys(r)) {
			const val = r[key];
			if (val && typeof val === 'object' && !Array.isArray(val)) {
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
		return { intent: 'network', answer: 'Please specify a person name (e.g. "show associates of Ravi").', data: [{ nodes: [], edges: [] }], source_refs: [] };
	}

	try {
		var cache = await ensurePersonMasterCache(app);
		if (!cache || !cache.loaded || Object.keys(cache.persons).length === 0) {
			return { intent: 'network', answer: 'PersonMaster data is not available. Please run sync-full first.', data: [{ nodes: [], edges: [] }], source_refs: [] };
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
			return { intent: 'network', answer: `No PersonMaster records found for "${name}". Try a different name or check if sync-full has been run.`, data: [{ nodes: [], edges: [] }], source_refs: [] };
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
			if (r.accused_count > 0) roles.push('accused');
			if (r.victim_count > 0) roles.push('victim');
			if (r.complainant_count > 0) roles.push('complainant');

			nodes.push({
				id: tn.person_id,
				name: tn.canonical_name,
				type: 'person',
				roles: roles,
				hop_distance: tn.hop_distance
			});
			personNodeCount++;
			sourceRefs.push(tn.canonical_name);
		}

		for (var ei = 0; ei < traversal.edges.length; ei++) {
			var te = traversal.edges[ei];
			var edgeKey = te.source + '-' + te.target + '-' + te.edge_type;
			if (seenNodeIds[edgeKey]) continue;
			seenNodeIds[edgeKey] = true;

			edges.push({
				from: te.source,
				to: te.target,
				label: te.edge_type === 'CO_ACCUSED' ? 'co-accused' :
					te.edge_type === 'ACCUSED_TO_VICTIM' ? 'accused_to_victim' :
					te.edge_type === 'SHARED_LOCATION' ? 'shared_location' : te.edge_type
			});
		}

		var answer = 'Found a network with ' + personNodeCount + ' person(s) connected across ' + edges.length + ' case(s).';

		return { intent: 'network', answer: answer, data: [{ nodes: nodes, edges: edges }], source_refs: sourceRefs };
	} catch (err) {
		console.error('handleNetwork error: ' + err.message);
		return { intent: 'network', answer: 'Unable to process network query. PersonMaster lookup failed.', data: [{ nodes: [], edges: [] }], source_refs: [] };
	}
}

async function handleRisk(app, query) {
	const name = extractPersonName(query);
	if (!name) {
		return { intent: 'risk', answer: 'Please specify a person name (e.g. "risk score of Ravi").', risk_score: null, factors: [], source_refs: [] };
	}

	const accusedRows = zcqlRows(await app.zcql().executeZCQLQuery(
		`SELECT a.ROWID, a.AccusedName, a.CaseMasterID, cm.CrimeRegisteredDate, ch.CrimeGroupName
FROM Accused a INNER JOIN CaseMaster cm ON a.CaseMasterID = cm.ROWID INNER JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.ROWID
WHERE a.AccusedName LIKE '*${name}*' LIMIT 100`
	).catch(() => []));

	if (accusedRows.length === 0) {
		return { intent: 'risk', answer: `No criminal history found for "${name}".`, risk_score: 0, factors: ['No prior cases'], source_refs: [] };
	}

	const uniqueCaseCount = new Set(accusedRows.map(r => r.CaseMasterID)).size;
	const uniqueCrimeTypes = new Set(accusedRows.map(r => r.CrimeGroupName).filter(Boolean));
	const recidivism = uniqueCaseCount > 1;

	const score = Math.min(10, Math.round((uniqueCaseCount * 2.5 + (recidivism ? 2 : 0) + Math.min(uniqueCrimeTypes.size, 3)) * 10) / 10);
	const factors = [
		`${uniqueCaseCount} case(s) as accused`,
		...(recidivism ? ['Repeat offender'] : ['First-time offender']),
		...(uniqueCrimeTypes.size > 0 ? [`${uniqueCrimeTypes.size} distinct crime type(s): ${[...uniqueCrimeTypes].slice(0, 3).join(', ')}`] : [])
	];
	const severity = score >= 7 ? 'High' : score >= 4 ? 'Medium' : 'Low';
	const answer = `${name} has a risk score of ${score}/10 (${severity}). ${factors.join('. ')}.`;

	return { intent: 'risk', answer, risk_score: score, factors, severity, source_refs: [] };
}

async function translateAnalyticalZCQL(query) {
	const prompt = `Generate a ZCQL V2 aggregation query for the KSP crime database. This is NOT standard SQL — Catalyst ZCQL V2 has different syntax rules.

${SCHEMA_DESCRIPTION}

ZCQL V2 Rules (MANDATORY):
- GROUP BY + COUNT for aggregation
- LIKE wildcard: * not % (NOT the SQL % wildcard)
- COUNT(alias.col) not COUNT(*)
- No AS aliases in SELECT (ZCQL ignores AS)
- Single quotes for strings, never double quotes
- Max 4 JOINs, 1 condition per JOIN
- Every table alias MUST be joined before use
- Use ONLY columns from schema
- No semicolon at end
- Return ONLY JSON: {"sql": "SELECT ...", "explanation": "what this computes"}

Example:
Query: "most common crime type"
SQL: SELECT ch.CrimeGroupName, COUNT(cm.CaseMasterID) FROM CaseMaster cm INNER JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.ROWID GROUP BY ch.CrimeGroupName ORDER BY COUNT(cm.CaseMasterID) DESC LIMIT 10
Explanation: Counts cases per crime type, ordered by frequency

Query: "${query}"

Respond ONLY with JSON.`;

	const response = await callQuickML(prompt, { temperature: 0.1, max_tokens: 300 });
	const content = extractGLMContent(response);
	if (!content) throw new Error('Empty response from GLM');
	const cleaned = content.replace(/```[a-z]*\s*/gi, '').replace(/```\s*/g, '').trim();
	const braceIdx = cleaned.indexOf('{');
	const parsed = JSON.parse(braceIdx >= 0 ? cleaned.slice(braceIdx) : cleaned);
	if (!parsed.sql) throw new Error('No SQL generated');
	return parsed;
}

async function handleAnalytical(app, query) {
	try {
		const translation = await translateAnalyticalZCQL(query);
		let rows;
		let lastError;
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				const cleanedSQL = cleanZCQL(translation.sql);
				validateSQL(cleanedSQL);
				rows = await app.zcql().executeZCQLQuery(cleanedSQL);
				break;
			} catch (err) {
				lastError = err.message;
				if (attempt === 0) {
					const fixPrompt = `The following ZCQL V2 query failed: "${lastError}". Fix it. Rules: LIKE uses * not %, no column aliases, no DATEDIFF, max 4 JOINs, max 5 WHERE, every alias MUST be joined. Return ONLY {"sql": "SELECT ...", "explanation": "..."}.\n\nFailing SQL: ${translation.sql}\n\nOriginal request: ${query}`;
					const response = await callQuickML(fixPrompt, { temperature: 0, max_tokens: 200 });
					const content = extractGLMContent(response);
					if (content) {
						const cleaned = content.replace(/```sql\s*/gi, '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
						translation.sql = JSON.parse(cleaned).sql;
					}
				}
			}
		}
		if (!rows) throw new Error(lastError || 'SQL execution failed');
		const flat = zcqlRows(rows);
		const isAgg = /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(translation.sql);
		let answer;
		if (isAgg && flat.length <= 10) {
			if (flat.length === 1) {
				const vals = Object.values(flat[0]).filter(v => v != null);
				if (vals.length === 1) {
					answer = `${translation.explanation}: ${vals[0]}`;
				} else {
					answer = translation.explanation;
				}
			} else {
				const parts = flat.slice(0, 10).map(r => {
					const vals = Object.values(r).filter(v => v != null);
					return '- ' + vals.slice(0, 2).join(': ');
				});
				answer = translation.explanation + '\n' + parts.join('\n');
			}
		} else {
			answer = translation.explanation + ` (${flat.length} rows)`;
		}
		return { intent: 'analytical', answer, data: flat.slice(0, 20), source_refs: [] };
	} catch {
		return handleAnalyticalFallback(app, query);
	}
}

async function handleAnalyticalFallback(app, query) {
	const location = extractLocation(query);
	const period = extractTimePeriod(query);
	const parts = [];

	if (location) parts.push(`in ${location}`);
	if (period) parts.push(period.label);
	const contextLabel = parts.length > 0 ? parts.join(' ') : 'overall';

	const whereClauses = [];
	if (location) {
		whereClauses.push(`d.DistrictName LIKE '*${location}*'`);
	}
	if (period) {
		whereClauses.push(`cm.CrimeRegisteredDate >= '${period.since}'`);
	}

	const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

	const [crimeTypeRows, monthlyRows, locationRows] = await Promise.all([
		app.zcql().executeZCQLQuery(
			`SELECT ch.CrimeGroupName, COUNT(cm.CaseMasterID)
FROM CaseMaster cm INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID INNER JOIN District d ON u.DistrictID = d.ROWID INNER JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.ROWID
${whereSQL}
GROUP BY ch.CrimeGroupName ORDER BY COUNT(cm.CaseMasterID) DESC LIMIT 10`
		).catch(() => []),
		app.zcql().executeZCQLQuery(
			`SELECT cm.CrimeRegisteredDate, COUNT(cm.CaseMasterID)
FROM CaseMaster cm INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID INNER JOIN District d ON u.DistrictID = d.ROWID
${whereSQL}
GROUP BY cm.CrimeRegisteredDate ORDER BY cm.CrimeRegisteredDate DESC LIMIT 12`
		).catch(() => []),
		app.zcql().executeZCQLQuery(
			`SELECT d.DistrictName, COUNT(cm.CaseMasterID)
FROM CaseMaster cm INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID INNER JOIN District d ON u.DistrictID = d.ROWID
${whereSQL}
GROUP BY d.DistrictName ORDER BY COUNT(cm.CaseMasterID) DESC LIMIT 10`
		).catch(() => [])
	]);

	const crimeTypes = zcqlRows(crimeTypeRows);
	const monthly = zcqlRows(monthlyRows);
	const byLocation = zcqlRows(locationRows);

	function getAggCount(row) {
		const vals = Object.values(row);
		for (const v of vals) {
			if (v != null && !isNaN(Number(v))) return Number(v);
		}
		return 0;
	}

	const total = crimeTypes.reduce((s, r) => s + getAggCount(r), 0);
	const topCrime = crimeTypes.length > 0 ? crimeTypes[0].CrimeGroupName : 'N/A';
	const topCrimeCount = crimeTypes.length > 0 ? getAggCount(crimeTypes[0]) : 0;
	const topLocation = byLocation.length > 0 ? byLocation[0].DistrictName : 'N/A';
	const trend = monthly.length >= 2
		? (getAggCount(monthly[0]) > getAggCount(monthly[monthly.length - 1]) ? 'increasing' : 'decreasing')
		: 'stable';

	const answer = `Crime analysis ${contextLabel}: ${total} total case(s). Top crime type: ${topCrime} (${topCrimeCount} case(s)). Highest crime district: ${topLocation}. Trend: ${trend}.`;

	return {
		intent: 'analytical',
		answer,
		source_refs: []
	};
}

async function getOrCreateSession(app, employeeId, sessionId) {
	const seg = app.cache().segment(CACHE_SEGMENT);
	const cacheKey = 's:' + sessionId;

	let raw;
	try {
		raw = await seg.getValue(cacheKey);
	} catch {
		raw = null;
	}
	if (raw) {
		try { return JSON.parse(raw); } catch { raw = null; }
	}

	const session = {
		session_id: sessionId,
		employee_id: employeeId,
		rank_hierarchy: null,
		unit_hierarchy: null,
		unit_id: null,
		district_id: null,
		turns: []
	};

	try {
		const empIdNum = Number(employeeId);
		const empIdSafe = isNaN(empIdNum) ? "'" + String(employeeId).replace(/'/g, "''") + "'" : String(empIdNum);
		const empRow = extractRow(await queryFirst(app,
			'SELECT EmployeeID, RankID, UnitID, DistrictID FROM Employee WHERE EmployeeID = ' + empIdSafe
		));

		if (!empRow) {
			console.warn('Employee not found for employee_id: ' + employeeId + ' — proceeding without RBAC scope');
		} else {
			if (empRow.RankID) {
				const rankRow = extractRow(await queryFirst(app,
					`SELECT Hierarchy FROM Rank WHERE ROWID = ${String(empRow.RankID)}`
				));
				if (rankRow) {
					session.rank_hierarchy = rankRow.Hierarchy ? Number(rankRow.Hierarchy) : null;
				}
			}

			if (empRow.UnitID) {
				const unitRow = extractRow(await queryFirst(app,
					`SELECT UnitID, TypeID FROM Unit WHERE ROWID = ${String(empRow.UnitID)}`
				));
				if (unitRow) {
					session.unit_id = unitRow.UnitID ? Number(unitRow.UnitID) : session.unit_id;

					if (unitRow.TypeID) {
						const utRow = extractRow(await queryFirst(app,
							`SELECT UnitTypeID FROM UnitType WHERE ROWID = ${String(unitRow.TypeID)}`
						));
						if (utRow) {
							session.unit_hierarchy = utRow.UnitTypeID ? Number(utRow.UnitTypeID) : null;
						}
					}
				}
			}

			if (empRow.DistrictID) {
				const distRow = extractRow(await queryFirst(app,
					`SELECT DistrictID FROM District WHERE ROWID = ${String(empRow.DistrictID)}`
				));
				if (distRow) {
					session.district_id = distRow.DistrictID ? Number(distRow.DistrictID) : session.district_id;
				}
			}
		}
	} catch (err) {
		throw err;
	}

	await seg.put(cacheKey, JSON.stringify(session), SESSION_TTL_HOURS);
	return session;
}

async function appendTurn(app, employeeId, sessionId, turn) {
	const seg = app.cache().segment(CACHE_SEGMENT);
	const cacheKey = 's:' + sessionId;
	let raw;
	try {
		raw = await seg.getValue(cacheKey);
	} catch {
		raw = null;
	}
	if (!raw) return false;

	let session;
	try { session = JSON.parse(raw); } catch { return false; }

	turn.turn_id = session.turns.length + 1;
	turn.timestamp = turn.timestamp || new Date().toISOString();
	session.turns.push(turn);

	await seg.put(cacheKey, JSON.stringify(session), SESSION_TTL_HOURS);
	return true;
}

async function requireAuth(app) {
	try {
		const user = await app.userManagement().getCurrentUser();
		return user;
	} catch {
		return null;
	}
}

module.exports = async (req, res) => {
	let app;
	try {
		app = catalyst.initialize(req);
	} catch {
		sendError(res, 500, 'INIT_FAILED', 'Failed to initialize Catalyst SDK');
		return;
	}

	const { path, params } = parseUrl(req.url);
	const method = req.method.toUpperCase();

	if (method === 'OPTIONS') {
		res.writeHead(204, {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization',
			'Access-Control-Max-Age': '86400'
		});
		res.end();
		return;
	}

	if (method === 'GET' && path === '/') {
		sendJson(res, 200, { status: 'ok', service: 'pipeline', version: '1.0.0' });
		return;
	}

	if (method !== 'POST' || path !== '/query') {
		sendError(res, 404, 'NOT_FOUND', 'Route not found');
		return;
	}

	const authUser = await requireAuth(app);
	if (!authUser) {
		console.warn('Pipeline: unauthenticated request (dev mode or missing session)');
	}
	const body = await getBody(req);
	const { query, employee_id, session_id } = body;

	if (!query || typeof query !== 'string') {
		sendError(res, 400, 'MISSING_QUERY', 'query field is required');
		return;
	}

	if (!employee_id) {
		sendError(res, 400, 'MISSING_EMPLOYEE_ID', 'employee_id is required');
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
				kwResult = { intent: 'structured', confidence: 0.5, fallback: true };
			}
		}

		let result;
		switch (kwResult.intent) {
			case 'structured': {
		const translation = await translateToZCQL(query, session.turns);
				let rows;
				let lastError;
				for (let attempt = 0; attempt < 2; attempt++) {
					try {
						rows = await executeZCQL(app, translation.sql);
						break;
					} catch (err) {
						lastError = err.message;
						if (attempt === 0) {
							const fixPrompt = `The following ZCQL query failed with error: "${lastError}". Fix it and return ONLY the corrected JSON: {"sql": "SELECT ...", "explanation": "..."}. Use ONLY columns from the schema. Every table alias MUST be joined.\n\nFailing query: ${translation.sql}\n\nOriginal request: ${query}`;
							const response = await callQuickML(fixPrompt, { temperature: 0, max_tokens: 200 });
							const content = extractGLMContent(response);
							if (content) {
								const cleaned = content.replace(/```sql\s*/gi, '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
								translation.sql = JSON.parse(cleaned).sql;
							}
						}
					}
				}
				if (!rows) throw new Error(lastError || 'SQL execution failed');
				result = formatZCQLResult('structured', rows, translation.sql);
				result.explanation = translation.explanation;
				result.sql = translation.sql;
				break;
			}
			case 'narrative': {
				const keywords = await getKeywords(query);
				if (keywords.length === 0) {
					result = formatNarrativeResult('narrative', 'I could not find any case records matching your query.', []);
					break;
				}
				const [bfResults, personResults] = await Promise.all([
					searchBriefFacts(app, keywords),
					searchPersons(app, keywords),
				]);
				const seen = new Set();
				const merged = [];
				for (const r of [...bfResults, ...personResults]) {
					if (seen.has(r.ROWID)) continue;
					seen.add(r.ROWID);
					merged.push(r);
				}
				const enriched = await enrichMatches(app, merged);
				const maxScore = Math.max(...enriched.map(e => e._score || 0), 0);
				let answer = await generateRAGAnswer(query, enriched);
				if (enriched.length === 0 || maxScore <= 1) {
					const ragAnswer = await queryRAGFallback(query);
					if (ragAnswer) answer = ragAnswer;
				}
				result = formatNarrativeResult('narrative', answer, enriched);
				break;
			}
			case 'network':
				result = await handleNetwork(app, query);
				break;
			case 'risk':
				result = await handleRisk(app, query);
				break;
			case 'analytical':
				result = await handleAnalytical(app, query);
				break;
			default:
				result = formatIntentResult('structured');
		}

		await appendTurn(app, employee_id, sid, {
			role: 'user',
			content: query,
			intent: kwResult.intent
		});

		await appendTurn(app, employee_id, sid, {
			role: 'assistant',
			content: result.answer || result.message || '',
			intent: kwResult.intent,
			source_refs: result.source_refs || [],
			query_context: (result.sql || '') + ' — ' + (result.explanation || '')
		});

		sendJson(res, 200, {
			status: 'ok',
			data: {
				...result,
				confidence: kwResult.confidence,
				fallback: kwResult.fallback || false,
				session_id: sid
			}
		});
	} catch (err) {
		sendError(res, 500, 'PIPELINE_ERROR', err.message || 'Pipeline execution failed');
	}
};
