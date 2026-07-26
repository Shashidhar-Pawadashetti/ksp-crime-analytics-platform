'use strict';
var AUDIT_TABLE = 'AnalyticsAuditLog';
async function createAuditRecord(app, record) {
  try {
    var now = new Date();
    var fmtDateTime = now.toISOString().replace('T', ' ').replace(/\.\d+Z/, '');
    var row = {
      RunID: record.runId || 'FC-' + Date.now().toString(36).toUpperCase(),
      RunType: record.runType || 'forecasting',
      TriggeredBy: record.triggerType || 'api',
      StartedAt: record.startedAt || fmtDateTime,
      CompletedAt: record.completedAt || fmtDateTime,
      Status: record.status || 'SUCCESS',
      DocumentsCreated: Number(record.documentsCreated) || 0,
      DocumentsUpdated: Number(record.documentsUpdated) || 0,
      PersonsProcessed: Number(record.personsProcessed) || 0,
      ErrorCount: Number(record.errorCount) || 0,
      ThresholdUsed: Number(record.thresholdUsed) || 0,
      ConfirmedEdgesWritten: 0,
      UnconfirmedEdgesWritten: 0
    };
    var table = app.datastore().table(AUDIT_TABLE);
    var result = await table.insertRow(row);
    return result;
  } catch (err) {
    console.error('[audit] AnalyticsAuditLog insert failed: ' + err.message);
    return null;
  }
}
module.exports = { createAuditRecord: createAuditRecord };
