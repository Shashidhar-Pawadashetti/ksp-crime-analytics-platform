'use strict';

const https = require('https');
const catalyst = require('zcatalyst-sdk-node');

const QUICKML_URL = process.env.QUICKML_URL || 'https://api.catalyst.zoho.in/quickml/v1/project/47995000000013046/glm/chat';
const RAG_ANSWER_URL = process.env.RAG_ANSWER_URL || 'https://api.catalyst.zoho.in/quickml/v1/project/47995000000013046/rag/answer';
const QUICKML_MODEL = process.env.QUICKML_MODEL || 'crm-di-glm47b_30b_it';
const CATALYST_ORG = process.env.CATALYST_ORG || '60073929329';
const MAX_EXCERPTS = 3;

const GENDER_MAP = { '1': 'Male', '2': 'Female', '3': 'Other' };

function sendJson(res, status, data) {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(data));
}

function sendError(res, status, errorCode, message) {
	sendJson(res, status, {
		status: 'error',
		error_code: errorCode,
		message,
		fallback_answer: 'I was unable to find information about that.'
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
			timeout: 25000,
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

function extractKeywords(query) {
	const stopWords = new Set(['the', 'a', 'an', 'in', 'of', 'for', 'on', 'to', 'at', 'by', 'with', 'from', 'is', 'was', 'are', 'were', 'what', 'how', 'show', 'tell', 'describe', 'give', 'find', 'about', 'me', 'and', 'or', 'but', 'not']);
	const words = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
	return words.slice(0, 5);
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

function sanitize(val) {
	if (!val || typeof val !== 'string') return '';
	return val.replace(/'/g, "\\'");
}

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
		(kw) => `SELECT CaseMasterID, AccusedName AS person_name FROM Accused WHERE AccusedName LIKE '*${kw}*' LIMIT 15`,
		(kw) => `SELECT CaseMasterID, VictimName AS person_name FROM Victim WHERE VictimName LIKE '*${kw}*' LIMIT 15`,
		(kw) => `SELECT CaseMasterID, ComplainantName AS person_name FROM ComplainantDetails WHERE ComplainantName LIKE '*${kw}*' LIMIT 15`,
	];

	const caseRowIds = new Set();
	const personInfo = {};

	for (const kw of keywords) {
		for (const q of queries) {
			try {
				const sql = q(kw);
				const result = await app.zcql().executeZCQLQuery(sql);
				const rows = flatRows(result);
				for (const r of rows) {
					const rid = r.CaseMasterID;
					caseRowIds.add(rid);
					if (!personInfo[rid]) personInfo[rid] = [];
					personInfo[rid].push(r.AccusedName || r.VictimName || r.ComplainantName || r.person_name || 'unknown');
				}
			} catch (e) {
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
		const names = personInfo[r.ROWID] || [];
		const unique = [...new Set(names)];
		return {
			...r,
			_matchedPersons: unique.map(n => ({ name: n })),
			_score: unique.length * 2,
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
		if (secs && secs.length > 0) {
			m.Sections = secs.join(', ');
		}
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
			const persons = m._matchedPersons.map(p => p.name || p).join(', ');
			lines.push(`  Persons Matched: ${persons}`);
		}
		lines.push(`  BriefFacts: ${m.BriefFacts || 'No details available'}`);
		return lines.join('\n');
	}).join('\n\n');
}

async function generateAnswer(query, matches) {
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

function gender(val) {
	return GENDER_MAP[String(val)] || val || '';
}

module.exports = async (req, res) => {
	let app;
	try {
		app = catalyst.initialize(req);
	} catch {
		sendError(res, 500, 'INIT_FAILED', 'Failed to initialize Catalyst SDK');
		return;
	}

	const { path } = parseUrl(req.url);
	const method = req.method.toUpperCase();

	if (method === 'GET' && path === '/') {
		sendJson(res, 200, { status: 'ok', service: 'rag', version: '2.0.0' });
		return;
	}

	if (method !== 'POST' || path !== '/query') {
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
		const user = await app.userManagement().getCurrentUser();
		if (!user) console.warn('RAG: unauthenticated request (dev mode or missing session)');
	} catch {
		console.warn('RAG: unauthenticated request (dev mode or missing session)');
	}

	try {
		const keywords = await getKeywords(query);
		if (keywords.length === 0) {
			sendJson(res, 200, {
				status: 'ok',
				data: {
					answer: 'I could not find any case records matching your query.',
					source_refs: []
				}
			});
			return;
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
		const sourceRefs = enriched.map(e => `CaseMasterID:${e.CaseMasterID}`);

		if (enriched.length === 0) {
			const ragAnswer = await queryRAGFallback(query);
			if (ragAnswer) {
				sendJson(res, 200, {
					status: 'ok',
					data: {
						answer: ragAnswer,
						source_refs: ['RAG:Catalyst']
					}
				});
				return;
			}
			sendJson(res, 200, {
				status: 'ok',
				data: {
					answer: 'I could not find any case records matching your query.',
					source_refs: []
				}
			});
			return;
		}

		const maxScore = Math.max(...enriched.map(e => e._score || 0), 0);
		let answer = await generateAnswer(query, enriched);

		if (maxScore <= 1) {
			const ragAnswer = await queryRAGFallback(query);
			if (ragAnswer) {
				sendJson(res, 200, {
					status: 'ok',
					data: {
						answer: ragAnswer,
						source_refs: sourceRefs.concat(['RAG:Catalyst'])
					}
				});
				return;
			}
		}

		sendJson(res, 200, {
			status: 'ok',
			data: {
				answer,
				source_refs: sourceRefs
			}
		});
	} catch (err) {
		sendError(res, 500, 'RAG_FAILED', err.message || 'RAG query failed');
	}
};
