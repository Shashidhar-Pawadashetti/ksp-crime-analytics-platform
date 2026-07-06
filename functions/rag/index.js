'use strict';

const https = require('https');
const catalyst = require('zcatalyst-sdk-node');

const QUICKML_URL = process.env.QUICKML_URL || 'https://api.catalyst.zoho.in/quickml/v1/project/47995000000013046/glm/chat';
const QUICKML_MODEL = process.env.QUICKML_MODEL || 'crm-di-glm47b_30b_it';
const CATALYST_ORG = process.env.CATALYST_ORG || '60073929329';
const MAX_EXCERPTS = 3;

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

function extractKeywords(query) {
	const stopWords = new Set(['the', 'a', 'an', 'in', 'of', 'for', 'on', 'to', 'at', 'by', 'with', 'from', 'is', 'was', 'are', 'were', 'what', 'how', 'show', 'tell', 'describe', 'give', 'find', 'about', 'me', 'and', 'or', 'but', 'not']);
	const words = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
	return words.slice(0, 5);
}

async function searchBriefFacts(app, query) {
	const keywords = extractKeywords(query);
	if (keywords.length === 0) {
		return [];
	}

	const conditions = keywords.map(k => `cm.BriefFacts LIKE '%${k}%'`);
	const sql = `SELECT cm.CaseMasterID, cm.CrimeNo, cm.BriefFacts, cm.IncidentFromDate, d.DistrictName 
FROM CaseMaster cm, Unit u, District d
WHERE cm.PoliceStationID = u.ROWID AND u.DistrictID = d.ROWID
AND (${conditions.join(' OR ')}) 
AND cm.BriefFacts IS NOT NULL 
ORDER BY cm.IncidentFromDate DESC 
LIMIT ${MAX_EXCERPTS}`;

	try {
		const rows = await app.zcql().executeZCQLQuery(sql);
		return rows.map(r => {
			const entry = Object.values(r)[0];
			return entry;
		}).filter(Boolean);
	} catch {
		return [];
	}
}

async function generateAnswer(query, excerpts) {
	const contextBlock = excerpts.map((e, i) =>
		`[Case ${i + 1}] CaseMasterID: ${e.CaseMasterID}, CrimeNo: ${e.CrimeNo || 'N/A'}, District: ${e.DistrictName || 'N/A'}, Date: ${e.IncidentFromDate || 'N/A'}
BriefFacts: ${e.BriefFacts || 'No details available'}`
	).join('\n\n');

	const prompt = `You are a crime analysis assistant for Karnataka State Police. 

The user asked: "${query}"

Below are relevant case excerpts from the police database. Answer the user's question based ONLY on these excerpts. If the excerpts don't contain enough information to answer, say so honestly.

${contextBlock}

Rules:
1. Answer based ONLY on the provided excerpts — never add external information
2. Cite the CaseMasterID for each piece of information you use
3. Be concise and factual
4. If excerpts are empty or irrelevant, say "I don't have enough information to answer that question."`;

	const response = await callQuickML(prompt, { temperature: 0.1, max_tokens: 500 });
	const content = extractGLMContent(response);
	return content || 'I was unable to generate an answer.';
}

module.exports = async (req, res) => {
	const { path } = parseUrl(req.url);
	const method = req.method.toUpperCase();

	if (method === 'GET' && path === '/') {
		sendJson(res, 200, { status: 'ok', service: 'rag', version: '1.0.0' });
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

	let app;
	try {
		app = catalyst.initialize(req);
	} catch {
		sendError(res, 500, 'INIT_FAILED', 'Failed to initialize Catalyst SDK');
		return;
	}

	try {
		const excerpts = await searchBriefFacts(app, query);
		const sourceRefs = excerpts.map(e => `CaseMasterID:${e.CaseMasterID}`);

		if (excerpts.length === 0) {
			sendJson(res, 200, {
				status: 'ok',
				data: {
					answer: 'I could not find any case records matching your query in the BriefFacts database.',
					source_refs: []
				}
			});
			return;
		}

		const answer = await generateAnswer(query, excerpts);
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
