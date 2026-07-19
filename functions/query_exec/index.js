'use strict';

const catalyst = require('zcatalyst-sdk-node');

const ALLOWED_ZCQL_TABLES = {
	CaseMaster: true, Accused: true, Victim: true, ComplainantDetails: true,
	CrimeHead: true, CrimeSubHead: true, Unit: true, District: true,
	State: true, Employee: true, CaseStatusMaster: true, CaseCategory: true,
	GravityOffence: true, Court: true, Rank: true, Designation: true,
	UnitType: true, ReligionMaster: true, CasteMaster: true, OccupationMaster: true,
	Act: true, Section: true, ActSectionAssociation: true, CrimeHeadActSection: true,
	ChargesheetDetails: true, ArrestSurrender: true
};

function sendJson(res, status, data) {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(data));
}

function sendError(res, status, errorCode, message, fallback) {
	sendJson(res, status, {
		status: 'error',
		error_code: errorCode,
		message,
		fallback_answer: fallback || 'I was unable to retrieve that information.'
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

function validateSql(sql) {
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

function applyScope(sql, scope) {
	if (!scope) return sql;

	const filters = [];
	if (scope.district_filter) {
		filters.push(`u.DistrictID = ${Number(scope.district_filter)}`);
	}
	if (scope.unit_filter) {
		filters.push(`cm.PoliceStationID = ${Number(scope.unit_filter)}`);
	}

	if (filters.length === 0) return sql;

	const upper = sql.toUpperCase();
	const whereIdx = upper.indexOf('WHERE');
	if (whereIdx === -1) {
		const groupIdx = upper.indexOf('GROUP BY');
		const orderIdx = upper.indexOf('ORDER BY');
		const limitIdx = upper.indexOf('LIMIT');
		const insertPos = Math.min(
			groupIdx > -1 ? groupIdx : Infinity,
			orderIdx > -1 ? orderIdx : Infinity,
			limitIdx > -1 ? limitIdx : Infinity
		);
		const clause = ' WHERE ' + filters.join(' AND ');
		if (insertPos === Infinity) {
			return sql + clause;
		}
		return sql.slice(0, insertPos) + clause + ' ' + sql.slice(insertPos);
	}

	return sql.slice(0, whereIdx + 5) + ' ' + filters.join(' AND ') + ' AND ' + sql.slice(whereIdx + 6);
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
	let app;
	try {
		app = catalyst.initialize(req);
	} catch {
		sendError(res, 500, 'INIT_FAILED', 'Failed to initialize Catalyst SDK');
		return;
	}

	try {
		const user = await app.userManagement().getCurrentUser();
		if (!user) console.warn('QUERY_EXEC: unauthenticated request (dev mode or missing session)');
	} catch {
		console.warn('QUERY_EXEC: unauthenticated request (dev mode or missing session)');
	}

	if (req.method.toUpperCase() !== 'POST') {
		sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed');
		return;
	}

	const body = await getBody(req);
	const sql = body.sql;
	const scope = body.scope || null;

	if (!sql || typeof sql !== 'string') {
		sendError(res, 400, 'MISSING_SQL', 'sql field is required');
		return;
	}

	try {
		validateSql(sql);
	} catch (err) {
		sendError(res, 400, err.message.split(':')[0], err.message);
		return;
	}

	let finalSql;
	try {
		finalSql = applyScope(sql, scope);
	} catch (err) {
		sendError(res, 400, 'SCOPE_ERROR', 'Failed to apply scope: ' + err.message);
		return;
	}

	try {
		const rows = await app.zcql().executeZCQLQuery(finalSql);
		const columnMeta = extractColumnMeta(finalSql);
		const sourceRefs = extractSourceRefs(rows);

		sendJson(res, 200, {
			status: 'ok',
			data: {
				rows,
				column_meta: columnMeta,
				source_refs: sourceRefs
			}
		});
	} catch (err) {
		sendError(res, 500, 'QUERY_FAILED', err.message || 'Query execution failed');
	}
};
