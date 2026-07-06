'use strict';

const https = require('https');
const catalyst = require('zcatalyst-sdk-node');

const QUICKML_URL = process.env.QUICKML_URL || 'https://api.catalyst.zoho.in/quickml/v1/project/47995000000013046/glm/chat';
const QUICKML_MODEL = process.env.QUICKML_MODEL || 'crm-di-glm47b_30b_it';
const CATALYST_ORG = process.env.CATALYST_ORG || '60073929329';

const FORBIDDEN_KEYWORDS = ['DROP', 'DELETE', 'INSERT', 'UPDATE', 'TRUNCATE', 'ALTER', 'CREATE', 'EXEC', 'EXECUTE'];

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
`;

function sendJson(res, status, data) {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(data));
}

function sendError(res, status, errorCode, message) {
	sendJson(res, status, {
		status: 'error',
		error_code: errorCode,
		message,
		fallback_answer: 'I was unable to generate a query for that request.'
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
	return { path };
}

function validateGeneratedSQL(sql) {
	const upper = sql.toUpperCase();
	for (const kw of FORBIDDEN_KEYWORDS) {
		const re = new RegExp(`\\b${kw}\\b`);
		if (re.test(upper)) {
			throw new Error(`UNSAFE_SQL: ${kw} not allowed`);
		}
	}
	if (!/^\s*SELECT\b/i.test(sql)) {
		throw new Error('UNSAFE_SQL: Only SELECT queries are allowed');
	}
}

async function callQuickML(prompt, options = {}) {
	const token = process.env.QUICKML_TOKEN;
	if (!token) {
		throw new Error('QUICKML_TOKEN not configured');
	}

	const body = JSON.stringify({
		model: QUICKML_MODEL,
		messages: [{ role: 'user', content: prompt }],
		temperature: options.temperature ?? 0.1,
		max_tokens: options.max_tokens ?? 500,
		chat_template_kwargs: { enable_thinking: false },
	});

	const urlObj = new URL(QUICKML_URL);

	return new Promise((resolve, reject) => {
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
					resolve(parsed);
				} catch {
					reject(new Error('Failed to parse GLM response'));
				}
			});
		});

		req.on('timeout', () => {
			req.destroy();
			reject(new Error('GLM request timed out'));
		});

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

function parseSQLResponse(content) {
	const cleaned = content.replace(/```sql\s*/gi, '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
	const parsed = JSON.parse(cleaned);
	if (!parsed.sql || typeof parsed.sql !== 'string') {
		throw new Error('Invalid response: missing sql field');
	}
	validateGeneratedSQL(parsed.sql);
	return {
		sql: parsed.sql,
		explanation: parsed.explanation || ''
	};
}

async function translateToSQL(query) {
	const prompt = `You are a ZCQL generator for the KSP crime database. Generate only SELECT queries.

${SCHEMA_DESCRIPTION}

Rules:
1. Return ONLY valid JSON: {"sql": "SELECT ...", "explanation": "brief description of what this query does"}
2. Use ZCQL V2 syntax
3. SELECT only — never DDL or DML (no INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, EXEC)
4. Always use INNER JOIN ... ON through FK chains via ROWID (max 4 JOINs, 1 condition per JOIN)
5. Never use SELECT * — always name columns explicitly (max 20 columns per query)
6. Limit results to 50 rows unless aggregating (COUNT, SUM, AVG, MIN, MAX)
7. Always qualify column names with table aliases
8. For text search use LIKE with * wildcard (NOT % — ZCQL uses * not %)
9. For date filtering use format YYYY-MM-DD in single quotes
10. GenderID: 1=Male, 2=Female, 3=Other
11. Never use COUNT(*) — use COUNT(alias.ColumnName) instead
12. GROUP BY and ORDER BY are supported — use after WHERE, before LIMIT
13. ORDER BY supports ASC/DESC per column
14. ZCQL functions: COUNT(), SUM(), AVG(), MIN(), MAX(), DISTINCT
15. Enclose all string values in single quotes
16. Subqueries are supported in WHERE clause
17. HAVING clause supported with GROUP BY
18. Operator IS works like =, use IS NULL / IS NOT NULL for null checks

Examples:
Query: "show FIRs for theft in Bengaluru last month"
SQL: SELECT cm.CaseMasterID, cm.CrimeNo, cm.CrimeRegisteredDate, ch.CrimeGroupName, cs.CrimeHeadName, d.DistrictName FROM CaseMaster cm INNER JOIN CrimeSubHead cs ON cm.CrimeMinorHeadID = cs.ROWID INNER JOIN CrimeHead ch ON cs.CrimeHeadID = ch.ROWID INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID INNER JOIN District d ON u.DistrictID = d.ROWID WHERE ch.CrimeGroupName LIKE '*theft*' AND d.DistrictName = 'Bengaluru' AND cm.CrimeRegisteredDate >= '2025-06-01' AND cm.CrimeRegisteredDate < '2025-07-01' ORDER BY cm.CrimeRegisteredDate DESC LIMIT 50

Query: "count of cases in Bengaluru Urban"
SQL: SELECT COUNT(cm.CaseMasterID) AS case_count FROM CaseMaster cm INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID INNER JOIN District d ON u.DistrictID = d.ROWID WHERE d.DistrictName = 'Bengaluru Urban'

Query: "list accused in case 2024-00412"
SQL: SELECT a.AccusedMasterID, a.AccusedName, a.AgeYear, a.GenderID FROM Accused a INNER JOIN CaseMaster cm ON a.CaseMasterID = cm.ROWID WHERE cm.CrimeNo = '2024-00412'

Query: "top 5 crime types by count"
SQL: SELECT ch.CrimeGroupName, COUNT(cm.CaseMasterID) AS crime_count FROM CaseMaster cm INNER JOIN CrimeSubHead cs ON cm.CrimeMinorHeadID = cs.ROWID INNER JOIN CrimeHead ch ON cs.CrimeHeadID = ch.ROWID GROUP BY ch.CrimeGroupName ORDER BY crime_count DESC LIMIT 5

Query: "${query}"

Respond ONLY with the JSON object, no other text.`;

	const response = await callQuickML(prompt, { temperature: 0.1, max_tokens: 500 });
	const content = extractGLMContent(response);
	if (!content) {
		throw new Error('Empty response from GLM');
	}
	return parseSQLResponse(content);
}

function extractColumnMeta(sql) {
	const match = sql.match(/SELECT\s+(.*?)\s+FROM/i);
	if (!match) return [];
	return match[1].split(',').map((c) => c.trim().replace(/\s+AS\s+/i, ' ').split(' ').pop());
}

function extractSourceRefs(rows) {
	const refs = [];
	for (const row of rows) {
		const entry = Object.values(row)[0];
		if (entry && entry.CaseMasterID) {
			refs.push(`CaseMasterID:${entry.CaseMasterID}`);
		}
	}
	return refs;
}

module.exports = async (req, res) => {
	const { path } = parseUrl(req.url);
	const method = req.method.toUpperCase();

	if (method === 'GET' && path === '/') {
		sendJson(res, 200, { status: 'ok', service: 'nl_sql', version: '1.0.0' });
		return;
	}

	if (method !== 'POST' || path !== '/translate') {
		sendError(res, 404, 'NOT_FOUND', 'Route not found');
		return;
	}

	const body = await getBody(req);
	const query = body.query;

	if (!query || typeof query !== 'string') {
		sendError(res, 400, 'MISSING_QUERY', 'query field is required');
		return;
	}

	let app;
	try {
		app = catalyst.initialize(req);
	} catch {
		sendError(res, 500, 'INIT_FAILED', 'Failed to initialize Catalyst SDK');
		return;
	}

	let result;
	try {
		result = await translateToSQL(query);
		const rows = await app.zcql().executeZCQLQuery(result.sql);
		const columnMeta = extractColumnMeta(result.sql);
		const sourceRefs = extractSourceRefs(rows);
		sendJson(res, 200, {
			status: 'ok',
			data: {
				sql: result.sql,
				explanation: result.explanation,
				rows,
				column_meta: columnMeta,
				source_refs: sourceRefs
			}
		});
	} catch (err) {
		const errCode = err.message.startsWith('UNSAFE_SQL') ? 'UNSAFE_SQL' : 'TRANSLATION_FAILED';
		const debugSql = result ? result.sql : 'N/A';
		sendError(res, 400, errCode, err.message + ' | SQL: ' + debugSql);
	}
};
