'use strict';

const { IncomingMessage, ServerResponse } = require('http');
const https = require('https');

const QUICKML_URL = process.env.QUICKML_URL || 'https://api.catalyst.zoho.in/quickml/v1/project/47995000000013046/glm/chat';
const QUICKML_MODEL = process.env.QUICKML_MODEL || 'crm-di-glm47b_30b_it';
const CATALYST_ORG = process.env.CATALYST_ORG || '60073929329';

const NETWORK_PATTERNS = /\b(associates?|linked\s+to|connected|co-accused|network|relationships?)\b/i;
const RISK_PATTERNS = /\b(risk\s+score|high-risk|repeat\s+offender|risk\s+level|dangerous|threat\s+level)\b/i;
const FORECAST_PATTERNS = /\b(predict|forecast|next\s+month|hotspot|trend|pattern|seasonal)\b/i;

function sendJson(res, status, data) {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(data));
}

function sendError(res, status, errorCode, message) {
	sendJson(res, status, {
		status: 'error',
		error_code: errorCode,
		message,
		fallback_answer: 'I was unable to process that request.'
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

function classifyByKeyword(query) {
	if (NETWORK_PATTERNS.test(query)) {
		return { intent: 'network', confidence: 0.95 };
	}
	if (RISK_PATTERNS.test(query)) {
		return { intent: 'risk', confidence: 0.95 };
	}
	if (FORECAST_PATTERNS.test(query)) {
		return { intent: 'analytical', confidence: 0.95 };
	}
	return null;
}

async function callQuickML(prompt, options) {
	const token = process.env.QUICKML_TOKEN;
	if (!token) {
		throw new Error('QUICKML_TOKEN not configured');
	}

	const body = JSON.stringify({
		model: QUICKML_MODEL,
		messages: [{ role: 'user', content: prompt }],
		temperature: options.temperature ?? 0.1,
		max_tokens: options.max_tokens ?? 200,
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
					resolve(JSON.parse(data));
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

async function classifyWithLLM(query) {
	const prompt = 'Classify this crime database query into exactly one of these intents:\n\n' +
		'- structured: asking for specific data, counts, lists, FIR details, statistics (e.g. "how many theft cases", "show FIRs in Bengaluru", "list accused", "cases registered in 2025")\n' +
		'- narrative: asking for descriptions, summaries, what happened in a case (e.g. "what happened in case 2024-00412", "describe the incident", "tell me about", "modus operandi")\n' +
		'- network: asking about relationships between people, associates, connections, co-accused (e.g. "show associates of Ravi", "who else was accused with", "linked to")\n' +
		'- risk: asking about risk scores, dangerous offenders, threat assessment (e.g. "risk score of Kumar", "high-risk offenders", "repeat offender list")\n' +
		'- analytical: asking for predictions, trends, forecasts, patterns, hotspots (e.g. "predict crime hotspots next month", "crime trend 2026", "seasonal patterns")\n\n' +
		'Query: "' + query + '"\n\n' +
		'Respond ONLY with a JSON object: {"intent": "...", "confidence": 0.0-1.0}';

	try {
		const response = await callQuickML(prompt, { temperature: 0.1, max_tokens: 100 });
		const content = extractGLMContent(response);
		if (!content) {
			return null;
		}
		const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
		const parsed = JSON.parse(cleaned);
		if (parsed.intent && parsed.confidence !== undefined) {
			return parsed;
		}
		return null;
	} catch {
		return null;
	}
}

module.exports = async (req, res) => {
	const { path } = parseUrl(req.url);
	const method = req.method.toUpperCase();

	if (method === 'GET' && path === '/') {
		sendJson(res, 200, { status: 'ok', service: 'classifier', version: '1.0.0' });
		return;
	}

	if (method !== 'POST' || path !== '/classify') {
		sendError(res, 404, 'NOT_FOUND', 'Route not found');
		return;
	}

	const body = await getBody(req);
	const query = body.query;

	if (!query || typeof query !== 'string') {
		sendError(res, 400, 'MISSING_QUERY', 'query field is required');
		return;
	}

	const keywordResult = classifyByKeyword(query);
	if (keywordResult) {
		sendJson(res, 200, { status: 'ok', data: keywordResult });
		return;
	}

	const llmResult = await classifyWithLLM(query);
	if (llmResult && llmResult.confidence >= 0.6) {
		sendJson(res, 200, { status: 'ok', data: llmResult });
		return;
	}

	sendJson(res, 200, {
		status: 'ok',
		data: {
			intent: 'structured',
			confidence: 0.5,
			fallback: true
		}
	});
};
