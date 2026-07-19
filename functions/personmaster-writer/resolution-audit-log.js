'use strict';

// Expected Catalyst Datastore schema for ResolutionAuditLog table:
//   RunID (varchar), RunType (varchar), TriggeredBy (varchar),
//   StartedAt (datetime), CompletedAt (datetime), Status (varchar),
//   ThresholdUsed (double), DocumentsCreated (int),
//   DocumentsUpdated (int), PersonsProcessed (int),
//   ConfirmedEdgesWritten (int), UnconfirmedEdgesWritten (int),
//   ErrorCount (int)
var AUDIT_TABLE = 'ResolutionAuditLog';
var _currentRunId = null;

function generateRunId() {
	return 'AUD-' + Date.now().toString(36).toUpperCase() + '-' + String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

function getCurrentRunId() {
	if (!_currentRunId) {
		_currentRunId = generateRunId();
	}
	return _currentRunId;
}

function resetRunId() {
	_currentRunId = null;
}

async function createAuditRecord(app, record) {
	try {
		var now = new Date();
		var fmtDateTime = now.getFullYear() + '-' +
			String(now.getMonth() + 1).padStart(2, '0') + '-' +
			String(now.getDate()).padStart(2, '0') + ' ' +
			String(now.getHours()).padStart(2, '0') + ':' +
			String(now.getMinutes()).padStart(2, '0') + ':' +
			String(now.getSeconds()).padStart(2, '0');

		function esc(v) { return "'" + String(v).replace(/'/g, "\\'") + "'"; }

		var runId = esc(record.runId || getCurrentRunId());
		var runType = esc(record.runType || 'unknown');
		var triggeredBy = esc(record.triggerType || 'manual');
		var startedAt = esc(record.startedAt ? record.startedAt.replace('T', ' ').replace(/\.\d+Z/, '') : fmtDateTime);
		var completedAt = esc(record.completedAt ? record.completedAt.replace('T', ' ').replace(/\.\d+Z/, '') : fmtDateTime);
		var status = esc(record.status || 'SUCCESS');
		var thresholdUsed = Number(record.thresholdUsed) || 0.78;
		var docsCreated = Number(record.documentsCreated) || 0;
		var docsUpdated = Number(record.documentsUpdated) || 0;
		var personsProcessed = Number(record.personsProcessed) || 0;
		var confirmedEdges = Number(record.confirmedEdgesWritten) || 0;
		var unconfirmedEdges = Number(record.unconfirmedEdgesWritten) || 0;
		var errorCount = Number(record.errorCount) || 0;

		var sql = 'INSERT INTO ' + AUDIT_TABLE + ' (RunID, RunType, TriggeredBy, StartedAt, CompletedAt, Status, ThresholdUsed, DocumentsCreated, DocumentsUpdated, PersonsProcessed, ConfirmedEdgesWritten, UnconfirmedEdgesWritten, ErrorCount) VALUES (' +
			runId + ', ' + runType + ', ' + triggeredBy + ', ' + startedAt + ', ' + completedAt + ', ' + status + ', ' +
			thresholdUsed + ', ' + docsCreated + ', ' + docsUpdated + ', ' + personsProcessed + ', ' +
			confirmedEdges + ', ' + unconfirmedEdges + ', ' + errorCount + ')';

		var result = await app.zcql().executeZCQLQuery(sql);
		return result;
	} catch (err) {
		console.error('Audit log insert failed: ' + err.message);
		return null;
	}
}

module.exports = {
	createAuditRecord: createAuditRecord,
	generateRunId: generateRunId,
	getCurrentRunId: getCurrentRunId,
	resetRunId: resetRunId
};
