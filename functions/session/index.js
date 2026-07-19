'use strict';

const catalyst = require('zcatalyst-sdk-node');

const CACHE_SEGMENT = 'session';
const SESSION_TTL_HOURS = 1;

function uuid() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
	});
}

function sendJson(res, status, data) {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(data));
}

function sendError(res, status, errorCode, message, fallback) {
	sendJson(res, status, {
		status: 'error',
		error_code: errorCode,
		message,
		fallback_answer: fallback || 'Unable to process session request.'
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
		const empRow = extractRow(await queryFirst(app,
			`SELECT EmployeeID, RankID, UnitID, DistrictID FROM Employee WHERE EmployeeID = ${Number(employeeId)}`
		));

		if (empRow) {
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
	} catch {
	}

	await seg.put(cacheKey, JSON.stringify(session), SESSION_TTL_HOURS);
	return session;
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

	const authUser = await requireAuth(app);
	if (!authUser) {
		console.warn('Session: unauthenticated request (dev mode or missing session)');
	}

	const { path, params } = parseUrl(req.url);
	const method = req.method.toUpperCase();

	try {
		if (method === 'GET' && path === '/') {
			const employeeId = params.employee_id;
			const sessionId = params.session_id || uuid();

			if (!employeeId) {
				sendJson(res, 200, { status: 'ok', service: 'session', version: '1.0.0' });
				return;
			}

			const session = await getOrCreateSession(app, employeeId, sessionId);
			sendJson(res, 200, { status: 'ok', data: session });
			return;
		}

		if (method === 'POST' && path === '/create') {
			const body = await getBody(req);
			const employeeId = body.employee_id;
			if (!employeeId) {
				sendError(res, 400, 'MISSING_EMPLOYEE_ID', 'employee_id is required');
				return;
			}
			const session = await getOrCreateSession(app, employeeId, uuid());
			sendJson(res, 200, { status: 'ok', data: session });
			return;
		}

		if (method === 'POST' && path === '/append') {
			const body = await getBody(req);
			const { session_id, employee_id, turn } = body;

			if (!session_id || !employee_id || !turn) {
				sendError(res, 400, 'MISSING_FIELDS', 'session_id, employee_id, and turn are required');
				return;
			}

			const seg = app.cache().segment(CACHE_SEGMENT);
			const cacheKey = `session:${employee_id}:${session_id}`;
			let raw;
			try {
				raw = await seg.getValue(cacheKey);
			} catch {
				raw = null;
			}

			let session;
			if (raw) {
				try {
					session = JSON.parse(raw);
				} catch {
					session = null;
				}
			}

			if (!session) {
				sendError(res, 404, 'SESSION_NOT_FOUND', 'Session not found or expired');
				return;
			}

			turn.turn_id = session.turns.length + 1;
			turn.timestamp = turn.timestamp || new Date().toISOString();
			session.turns.push(turn);

			await seg.put(cacheKey, JSON.stringify(session), SESSION_TTL_HOURS);
			sendJson(res, 200, { status: 'ok', data: { session_id, turn_id: turn.turn_id } });
			return;
		}

		if (method === 'DELETE' && path.startsWith('/')) {
			const sessionId = path.slice(1);
			const employeeId = params.employee_id || (await getBody(req)).employee_id;

			if (!sessionId || !employeeId) {
				sendError(res, 400, 'MISSING_FIELDS', 'session_id and employee_id are required');
				return;
			}

			const seg = app.cache().segment(CACHE_SEGMENT);
			await seg.delete(`session:${employeeId}:${sessionId}`);
			sendJson(res, 200, { status: 'ok', data: { deleted: true } });
			return;
		}

		sendError(res, 404, 'NOT_FOUND', `Route not found: ${method} ${path}`);
	} catch (err) {
		sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Internal server error');
	}
};
