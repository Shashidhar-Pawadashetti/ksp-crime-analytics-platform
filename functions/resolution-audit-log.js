'use strict';

// Expected Catalyst Datastore schema for ResolutionAuditLog table:
//   RunID (text), RunType (text), TriggerType (text),
//   StartedAt (text), CompletedAt (text), Status (text),
//   ThresholdUsed (text), DocumentsCreated (number),
//   DocumentsUpdated (number), PersonsProcessed (number),
//   ConfirmedEdgesWritten (number), UnconfirmedEdgesWritten (number),
//   ErrorCount (number), ErrorMessage (text)
// 'Trigger' is a ZCQL reserved keyword — use 'TriggerType' instead.
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
		var table = app.datastore().table(AUDIT_TABLE);
		var row = {
			RunID: record.runId || getCurrentRunId(),
			RunType: record.runType || 'unknown',
			TriggerType: record.triggerType || 'manual',
			StartedAt: record.startedAt || new Date().toISOString(),
			CompletedAt: record.completedAt || new Date().toISOString(),
			Status: record.status || 'SUCCESS',
			ThresholdUsed: String(record.thresholdUsed || '0.78'),
			DocumentsCreated: record.documentsCreated || 0,
			DocumentsUpdated: record.documentsUpdated || 0,
			PersonsProcessed: record.personsProcessed || 0,
			ConfirmedEdgesWritten: record.confirmedEdgesWritten || 0,
			UnconfirmedEdgesWritten: record.unconfirmedEdgesWritten || 0,
			ErrorCount: record.errorCount || 0,
			ErrorMessage: record.errorMessage || ''
		};
		var result = await table.insertRow(row);
		return result;
	} catch (err) {
		var attemptedCols = Object.keys(row).join(', ');
		var attemptedVals = JSON.stringify(row);
		console.error('Audit log insert failed: ' + err.message);
		console.error('  Expected schema: RunID, RunType, TriggerType, StartedAt, CompletedAt, Status, ThresholdUsed, DocumentsCreated, DocumentsUpdated, PersonsProcessed, ConfirmedEdgesWritten, UnconfirmedEdgesWritten, ErrorCount, ErrorMessage');
		console.error('  Attempted columns: [' + attemptedCols + ']');
		console.error('  Attempted row: ' + attemptedVals);
		return null;
	}
}

module.exports = {
	createAuditRecord: createAuditRecord,
	generateRunId: generateRunId,
	getCurrentRunId: getCurrentRunId,
	resetRunId: resetRunId
};
