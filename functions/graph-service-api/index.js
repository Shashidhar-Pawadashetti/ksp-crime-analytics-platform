'use strict';

const catalyst = require('zcatalyst-sdk-node');
const { route: graphRoute } = require('../graph-visualization/routes');

function sendJson(res, status, data) {
	res.writeHead(status, {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization'
	});
	res.end(JSON.stringify(data));
}

function sendError(res, status, errorCode, message) {
	sendJson(res, status, {
		status: 'error',
		error_code: errorCode,
		message,
		fallback_answer: 'Unable to process request.'
	});
}

module.exports = async (req, res) => {
	let app;
	try {
		app = catalyst.initialize(req);
	} catch {
		sendError(res, 500, 'INIT_FAILED', 'Failed to initialize Catalyst SDK');
		return;
	}

	const method = req.method.toUpperCase();

	// OPTIONS preflight handler
	if (method === 'OPTIONS') {
		res.writeHead(204, {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization',
			'Access-Control-Max-Age': '86400'
		});
		res.end();
		return;
	}

	// GET-only method validation
	if (method !== 'GET') {
		sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET is allowed');
		return;
	}

	try {
		// Call graph-visualization routes.js route() function with the raw req object
		const result = graphRoute(req);

		const statusCode = result.statusCode || (result.body ? 200 : 500);
		const body = result.body ? JSON.parse(result.body) : { status: 'error', message: 'No response' };

		sendJson(res, statusCode, body);
	} catch (err) {
		sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Internal server error');
	}
};
