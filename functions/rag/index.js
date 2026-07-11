'use strict';

const https = require('https');
const catalyst = require('zcatalyst-sdk-node');

const QUICKML_URL = process.env.QUICKML_URL || 'https://api.catalyst.zoho.in/quickml/v1/project/47995000000013046/glm/chat';
const RAG_ANSWER_URL = process.env.RAG_ANSWER_URL || 'https://api.catalyst.zoho.in/quickml/v1/project/47995000000013046/rag/answer';
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
	const prompt = `Extract 5-8 key search terms from this police crime query. Return ONLY a JSON array of strings. Do not include stop words or very common words. Focus on crime types, locations, person names, and case-specific terms.

Query: "${query}"

Return ONLY a JSON array like: ["theft", "Bengaluru", "2024"]`;

	try {
		const response = await callQuickML(prompt, { temperature: 0.1, max_tokens: 200 });
		const content = extractGLMContent(response);
		if (!content) return extractKeywords(query);
		const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
		const parsed = JSON.parse(cleaned);
		if (Array.isArray(parsed) && parsed.length > 0) {
			return parsed.filter(k => k.length > 2).slice(0, 8);
		}
		return extractKeywords(query);
	} catch {
		return extractKeywords(query);
	}
}

async function searchBriefFacts(app, query) {
	const keywords = await expandKeywords(query);
	if (keywords.length === 0) {
		return [];
	}

	const conditions = keywords.map(k => `cm.BriefFacts LIKE '*${k}*'`);
	const sql = `SELECT cm.CaseMasterID, cm.CrimeNo, cm.BriefFacts, cm.IncidentFromDate, cm.CrimeMajorHeadID, d.DistrictName, ch.CrimeGroupName
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
		const flatRows = rows.map(r => {
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

		return flatRows.map(row => {
			const text = (row.BriefFacts || '').toLowerCase();
			const matches = keywords.filter(k => text.includes(k.toLowerCase()));
			return { ...row, _score: matches.length, _matchCount: matches.length };
		}).sort((a, b) => b._score - a._score || new Date(b.IncidentFromDate || 0) - new Date(a.IncidentFromDate || 0))
		.slice(0, MAX_EXCERPTS);
	} catch {
		return [];
	}
}

async function generateAnswer(query, excerpts) {
	const maxScore = Math.max(...excerpts.map(e => e._score || 0), 0);
	const lowConfidence = maxScore <= 1 && excerpts.length > 0;

	const contextBlock = excerpts.map((e, i) =>
		`[Case ${i + 1}] CaseMasterID: ${e.CaseMasterID}, CrimeNo: ${e.CrimeNo || 'N/A'}, District: ${e.DistrictName || 'N/A'}, Date: ${e.IncidentFromDate || 'N/A'}`
		+ (e.CrimeGroupName ? `, Crime Type: ${e.CrimeGroupName}` : '')
		+ `\nBriefFacts: ${e.BriefFacts || 'No details available'}`
	).join('\n\n');

	const prompt = `You are a crime analysis assistant for Karnataka State Police. 

The user asked: "${query}"

Below are relevant case excerpts from the police database. Answer the user's question based ONLY on these excerpts. 

${contextBlock}

Rules:
1. Answer based ONLY on the provided excerpts — never add external information
2. Cite the CaseMasterID for each piece of information you use like [CaseMasterID:123]
3. Be concise and factual
4. If the excerpts don't fully answer the query, say "Based on available records, ..." and state what you can confirm
5. When multiple excerpts are relevant, synthesize across them
6. If excerpts are empty or irrelevant, say "I don't have enough information to answer that question."`;

	const response = await callQuickML(prompt, { temperature: 0.1, max_tokens: 500 });
	const content = extractGLMContent(response);
	return content || 'I was unable to generate an answer.';
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
					answer: 'I could not find any case records matching your query in the BriefFacts database.',
					source_refs: []
				}
			});
			return;
		}

		const maxScore = Math.max(...excerpts.map(e => e._score || 0), 0);
		const answer = await generateAnswer(query, excerpts);

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
