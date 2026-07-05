'use strict';

const https = require('https');
const catalyst = require('zcatalyst-sdk-node');

const QUICKML_URL = process.env.QUICKML_URL || 'https://api.catalyst.zoho.in/quickml/v1/project/47995000000013046/glm/chat';
const QUICKML_MODEL = process.env.QUICKML_MODEL || 'crm-di-glm47b_30b_it';
const CATALYST_ORG = process.env.CATALYST_ORG || '60073929329';
const CACHE_SEGMENT = 'session';
const SESSION_TTL_HOURS = 1;

const NETWORK_PATTERNS = /\b(associates?|linked\s+to|connected|co-accused|network|relationships?)\b/i;
const RISK_PATTERNS = /\b(risk\s+score|high-risk|repeat\s+offender|risk\s+level|dangerous|threat\s+level)\b/i;
const FORECAST_PATTERNS = /\b(predict|forecast|next\s+month|hotspot|trend|pattern|seasonal)\b/i;
const FORBIDDEN_KEYWORDS = ['DROP', 'DELETE', 'INSERT', 'UPDATE', 'TRUNCATE', 'ALTER', 'CREATE', 'EXEC', 'EXECUTE'];

const SCHEMA_DESCRIPTION = `
Tables:
- CaseMaster (CaseMasterID, CrimeNo, CrimeRegisteredDate, PoliceStationID, CrimeMajorHeadID, CrimeMinorHeadID, CaseStatusID, latitude, longitude, IncidentFromDate, IncidentToDate, BriefFacts)
- Accused (AccusedMasterID, CaseMasterID, AccusedName, AgeYear, GenderID)
- Victim (VictimMasterID, CaseMasterID, VictimName, AgeYear, GenderID)
- ComplainantDetails (ComplainantID, CaseMasterID, ComplainantName, AgeYear, OccupationID, ReligionID, CasteID, GenderID)
- CrimeHead (CrimeHeadID, CrimeGroupName)
- CrimeSubHead (CrimeSubHeadID, CrimeHeadID, CrimeHeadName)
- Act (ActID, ActName)
- Section (SectionID, ActID, SectionName)
- CaseStatusMaster (CaseStatusID, StatusName)
- Unit (UnitID, UnitName, DistrictID, TypeID)
- District (DistrictID, DistrictName, StateID)
- Employee (EmployeeID, EmployeeName, RankID, UnitID, DistrictID)
- ArrestSurrender (ArrestID, CaseMasterID, AccusedMasterID, ArrestDate, ArrestType)
- ChargesheetDetails (ChargesheetID, CaseMasterID, FiledDate)
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
	if (FORECAST_PATTERNS.test(query)) return { intent: 'analytical', confidence: 0.95 };
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

async function translateToSQL(query) {
	const prompt = `You are a ZCQL generator for the KSP crime database.

${SCHEMA_DESCRIPTION}

Rules:
1. Return ONLY JSON: {"sql": "SELECT ...", "explanation": "..."}
2. SELECT only, never DDL/DML
3. Join through correct FK chains
4. Never use SELECT *, name columns explicitly
5. Limit results to 50 unless aggregation (COUNT, SUM, AVG)
6. GenderID: 1=Male, 2=Female, 3=Other

Query: "${query}"

Respond ONLY with the JSON object.`;

	const response = await callQuickML(prompt, { temperature: 0.1, max_tokens: 500 });
	const content = extractGLMContent(response);
	if (!content) throw new Error('Empty response from GLM');
	const cleaned = content.replace(/```sql\s*/gi, '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
	const parsed = JSON.parse(cleaned);
	if (!parsed.sql) throw new Error('No SQL generated');
	return parsed;
}

function validateSQL(sql) {
	const upper = sql.toUpperCase();
	for (const kw of FORBIDDEN_KEYWORDS) {
		if (new RegExp(`\\b${kw}\\b`).test(upper)) {
			throw new Error(`UNSAFE_SQL: ${kw} not allowed`);
		}
	}
	if (!/^\s*SELECT\b/i.test(sql)) throw new Error('UNSAFE_SQL: Only SELECT allowed');
}

async function executeSQL(app, sql) {
	validateSQL(sql);
	return await app.zcql().executeZCQLQuery(sql);
}

function extractKeywords(query) {
	const stopWords = new Set(['the', 'a', 'an', 'in', 'of', 'for', 'on', 'to', 'at', 'by', 'with', 'from', 'is', 'was', 'are', 'were', 'what', 'how', 'show', 'tell', 'describe', 'give', 'find', 'about', 'me', 'and', 'or', 'but', 'not']);
	const words = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
	return words.slice(0, 5);
}

async function searchBriefFacts(app, query) {
	const keywords = extractKeywords(query);
	if (keywords.length === 0) return [];

	const conditions = keywords.map(k => `cm.BriefFacts LIKE '%${k}%'`);
	const sql = `SELECT cm.CaseMasterID, cm.CrimeNo, cm.BriefFacts, cm.IncidentFromDate, d.DistrictName 
FROM CaseMaster cm 
JOIN Unit u ON cm.PoliceStationID = u.UnitID 
JOIN District d ON u.DistrictID = d.DistrictID 
WHERE ${conditions.join(' OR ')} 
AND cm.BriefFacts IS NOT NULL 
ORDER BY cm.IncidentFromDate DESC 
LIMIT 3`;

	try {
		const rows = await app.zcql().executeZCQLQuery(sql);
		return rows.map(r => Object.values(r)[0]).filter(Boolean);
	} catch {
		return [];
	}
}

async function generateRAGAnswer(query, excerpts) {
	if (excerpts.length === 0) {
		return 'I could not find any case records matching your query.';
	}

	const contextBlock = excerpts.map((e, i) =>
		`[Case ${i + 1}] CaseMasterID: ${e.CaseMasterID}, CrimeNo: ${e.CrimeNo || 'N/A'}, District: ${e.DistrictName || 'N/A'}, Date: ${e.IncidentFromDate || 'N/A'}
BriefFacts: ${e.BriefFacts || 'No details available'}`
	).join('\n\n');

	const prompt = `The user asked: "${query}"

Relevant case excerpts from the police database:
${contextBlock}

Answer based ONLY on the excerpts. Cite CaseMasterIDs. Be concise.`;

	const response = await callQuickML(prompt, { temperature: 0.1, max_tokens: 500 });
	return extractGLMContent(response) || 'I was unable to generate an answer.';
}

function formatSQLResult(intent, result) {
	const rows = result.rows || result;
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
		source_refs: excerpts.map(e => `CaseMasterID:${e.CaseMasterID}`)
	};
}

function formatIntentResult(intent) {
	return {
		intent,
		answer: null,
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
		try { return JSON.parse(raw); } catch { raw = null; }
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
	try { session = JSON.parse(raw); } catch { return false; }

	turn.turn_id = session.turns.length + 1;
	turn.timestamp = turn.timestamp || new Date().toISOString();
	session.turns.push(turn);

	await seg.put(cacheKey, JSON.stringify(session), SESSION_TTL_HOURS);
	return true;
}

module.exports = async (req, res) => {
	const { path, params } = parseUrl(req.url);
	const method = req.method.toUpperCase();

	if (method === 'GET' && path === '/') {
		sendJson(res, 200, { status: 'ok', service: 'pipeline', version: '1.0.0' });
		return;
	}

	if (method !== 'POST' || path !== '/query') {
		sendError(res, 404, 'NOT_FOUND', 'Route not found');
		return;
	}

	let app;
	try {
		app = catalyst.initialize(req);
	} catch {
		sendError(res, 500, 'INIT_FAILED', 'Failed to initialize Catalyst SDK');
		return;
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
				const translation = await translateToSQL(query);
				const rows = await executeSQL(app, translation.sql);
				result = formatSQLResult('structured', rows);
				result.explanation = translation.explanation;
				break;
			}
			case 'narrative': {
				const excerpts = await searchBriefFacts(app, query);
				const answer = await generateRAGAnswer(query, excerpts);
				result = formatNarrativeResult('narrative', answer, excerpts);
				break;
			}
			case 'network':
			case 'risk':
			case 'analytical':
				result = formatIntentResult(kwResult.intent);
				result.message = `The query was classified as "${kwResult.intent}". This handler is not yet implemented.`;
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
			source_refs: result.source_refs || []
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
