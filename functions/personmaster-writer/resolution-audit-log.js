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
		var fmtDateTime = now.toISOString().replace('T', ' ').replace(/\.\d+Z/, '');

		var row = {
			RunID: record.runId || getCurrentRunId(),
			RunType: record.runType || 'unknown',
			TriggeredBy: record.triggerType || 'manual',
			StartedAt: record.startedAt || fmtDateTime,
			CompletedAt: record.completedAt || fmtDateTime,
			Status: record.status || 'SUCCESS',
			ThresholdUsed: Number(record.thresholdUsed) || 0.78,
			DocumentsCreated: Number(record.documentsCreated) || 0,
			DocumentsUpdated: Number(record.documentsUpdated) || 0,
			PersonsProcessed: Number(record.personsProcessed) || 0,
			ConfirmedEdgesWritten: Number(record.confirmedEdgesWritten) || 0,
			UnconfirmedEdgesWritten: Number(record.unconfirmedEdgesWritten) || 0,
			ErrorCount: Number(record.errorCount) || 0
		};

		var table = app.datastore().table(AUDIT_TABLE);
		var result = await table.insertRow(row);
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
