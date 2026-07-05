'use strict';

const https = require('https');

const QUICKML_URL = process.env.QUICKML_URL || 'https://api.catalyst.zoho.in/quickml/v1/project/47995000000013046/glm/chat';
const QUICKML_MODEL = process.env.QUICKML_MODEL || 'crm-di-glm47b_30b_it';
const CATALYST_ORG = process.env.CATALYST_ORG || '60073929329';

const FORBIDDEN_KEYWORDS = ['DROP', 'DELETE', 'INSERT', 'UPDATE', 'TRUNCATE', 'ALTER', 'CREATE', 'EXEC', 'EXECUTE'];

const SCHEMA_DESCRIPTION = `
Tables:
- CaseMaster (CaseMasterID, CrimeNo, CrimeRegisteredDate, PoliceStationID, CrimeMajorHeadID, CrimeMinorHeadID, CaseStatusID, latitude, longitude, IncidentFromDate, IncidentToDate, BriefFacts)
- Accused (AccusedMasterID, CaseMasterID, AccusedName, AgeYear, GenderID)
- Victim (VictimMasterID, CaseMasterID, VictimName, AgeYear, GenderID)
- ComplainantDetails (ComplainantID, CaseMasterID, ComplainantName, AgeYear, OccupationID, ReligionID, CasteID, GenderID)
- CrimeHead (CrimeHeadID, CrimeGroupName)
- CrimeSubHead (CrimeSubHeadID, CrimeHeadID, CrimeHeadName)
- CrimeHeadActSection (CrimeHeadID, ActID, SectionID)
- Act (ActID, ActName)
- Section (SectionID, ActID, SectionName)
- CaseStatusMaster (CaseStatusID, StatusName)
- GravityOffence (GravityOffenceID, GravityName)
- Unit (UnitID, UnitName, DistrictID, TypeID)
- District (DistrictID, DistrictName, StateID)
- State (StateID, StateName)
- UnitType (UnitTypeID, TypeName)
- Rank (RankID, RankName, Hierarchy)
- Designation (DesignationID, DesignationName)
- Employee (EmployeeID, EmployeeName, RankID, UnitID, DistrictID)
- ReligionMaster (ReligionID, ReligionName)
- CasteMaster (CasteID, CasteName)
- OccupationMaster (OccupationID, OccupationName)
- ArrestSurrender (ArrestID, CaseMasterID, AccusedMasterID, ArrestDate, ArrestType)
- ChargesheetDetails (ChargesheetID, CaseMasterID, FiledDate)
- PersonMaster (PersonID, CanonicalName, RolesSummary, RiskScore)

Key JOIN paths:
- CaseMaster.PoliceStationID → Unit.UnitID
- Unit.DistrictID → District.DistrictID
- District.StateID → State.StateID
- Unit.TypeID → UnitType.UnitTypeID
- CaseMaster.CrimeMajorHeadID → CrimeHead.CrimeHeadID
- CaseMaster.CrimeMinorHeadID → CrimeSubHead.CrimeSubHeadID
- CaseMaster.CaseStatusID → CaseStatusMaster.CaseStatusID
- CrimeSubHead.CrimeHeadID → CrimeHead.CrimeHeadID
- CrimeHeadActSection.CrimeHeadID → CrimeHead.CrimeHeadID
- CrimeHeadActSection.ActID → Act.ActID
- CrimeHeadActSection.SectionID → Section.SectionID
- Accused.CaseMasterID → CaseMaster.CaseMasterID
- Victim.CaseMasterID → CaseMaster.CaseMasterID
- ComplainantDetails.CaseMasterID → CaseMaster.CaseMasterID
- ArrestSurrender.CaseMasterID → CaseMaster.CaseMasterID
- ArrestSurrender.AccusedMasterID → Accused.AccusedMasterID
- ChargesheetDetails.CaseMasterID → CaseMaster.CaseMasterID
- Employee.RankID → Rank.RankID (via ROWID)
- Employee.UnitID → Unit.UnitID (via ROWID)
- Employee.DistrictID → District.DistrictID (via ROWID)
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
2. Use ZCQL dialect (Catalyst Data Store SQL)
3. SELECT only — never DDL or DML
4. Always JOIN through correct FK chains
5. Never use SELECT * — name columns explicitly
6. Limit results to 50 rows unless the query is an aggregation (COUNT, SUM, AVG, etc.)
7. Always qualify column names with table aliases
8. For text search on names, use LIKE with wildcards
9. For date filtering, use proper date format YYYY-MM-DD
10. GenderID: 1=Male, 2=Female, 3=Other

Examples:
Query: "show FIRs for theft in Bengaluru last month"
SQL: SELECT cm.CaseMasterID, cm.CrimeNo, cm.CrimeRegisteredDate, ch.CrimeGroupName, cs.CrimeHeadName, d.DistrictName FROM CaseMaster cm JOIN CrimeSubHead cs ON cm.CrimeMinorHeadID = cs.CrimeSubHeadID JOIN CrimeHead ch ON cs.CrimeHeadID = ch.CrimeHeadID JOIN Unit u ON cm.PoliceStationID = u.UnitID JOIN District d ON u.DistrictID = d.DistrictID WHERE ch.CrimeGroupName LIKE '%theft%' AND d.DistrictName = 'Bengaluru' AND cm.CrimeRegisteredDate >= '2025-06-01' AND cm.CrimeRegisteredDate < '2025-07-01' ORDER BY cm.CrimeRegisteredDate DESC LIMIT 50

Query: "how many murder cases in 2025"
SQL: SELECT COUNT(*) AS case_count FROM CaseMaster cm JOIN CrimeSubHead cs ON cm.CrimeMinorHeadID = cs.CrimeSubHeadID JOIN CrimeHead ch ON cs.CrimeHeadID = ch.CrimeHeadID WHERE ch.CrimeGroupName LIKE '%murder%' AND cm.CrimeRegisteredDate >= '2025-01-01' AND cm.CrimeRegisteredDate < '2026-01-01'

Query: "list accused in case 2024-00412"
SQL: SELECT a.AccusedMasterID, a.AccusedName, a.AgeYear, a.GenderID FROM Accused a JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID WHERE cm.CrimeNo = '2024-00412'

Query: "${query}"

Respond ONLY with the JSON object, no other text.`;

	const response = await callQuickML(prompt, { temperature: 0.1, max_tokens: 500 });
	const content = extractGLMContent(response);
	if (!content) {
		throw new Error('Empty response from GLM');
	}
	return parseSQLResponse(content);
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

	try {
		const result = await translateToSQL(query);
		sendJson(res, 200, { status: 'ok', data: result });
	} catch (err) {
		const errCode = err.message.startsWith('UNSAFE_SQL') ? 'UNSAFE_SQL' : 'TRANSLATION_FAILED';
		sendError(res, 400, errCode, err.message);
	}
};
