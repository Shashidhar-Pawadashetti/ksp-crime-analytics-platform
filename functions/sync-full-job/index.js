'use strict';

var catalyst = require('zcatalyst-sdk-node');
var { fullReconcile } = require('./fullReconciler');

function generateJobRunId(jobRequest) {
  try {
    var details = jobRequest.getJobDetails();
    var jobId = details && details.id ? String(details.id) : 'unknown';
    return 'FULL-JOB-' + jobId + '-' + Date.now().toString(36).toUpperCase();
  } catch (e) {
    return 'FULL-JOB-' + Date.now().toString(36).toUpperCase();
  }
}

function logRemaining(context, label) {
  try {
    var remaining = context.getRemainingExecutionTimeMs();
    console.log('[JOB] [' + label + '] remaining_ms=' + remaining);
  } catch (_) {}
}

module.exports = async function (jobRequest, context) {
  var startedAt = Date.now();

  try {
    console.log('[JOB] START');

    try {
      console.log('[JOB] max_execution_ms=' + context.getMaxExecutionTimeMs());
    } catch (_) {}
    logRemaining(context, 'START');

    var app;
    try {
      app = catalyst.initialize(context);
    } catch (e) {
      console.error('[JOB] Catalyst init FAILED: ' + (e.stack || e));
      context.closeWithFailure();
      return;
    }

    console.log('[JOB] Catalyst init OK (' + (Date.now() - startedAt) + 'ms)');
    logRemaining(context, 'INIT');

    var runId = generateJobRunId(jobRequest);
    console.log('[JOB] runId=' + runId);

    var result = await fullReconcile(app, { runId: runId }, context);

    var elapsed = Date.now() - startedAt;
    console.log('[JOB] fullReconcile returned status=' + result.status + ' (' + elapsed + 'ms)');
    logRemaining(context, 'RECONCILE_DONE');

    if (!result || result.status === 'FAILED') {
      var failMsg = 'Full reconciliation failed: ' + JSON.stringify(result);
      console.error('[JOB] ' + failMsg);
      context.closeWithFailure();
      return;
    }

    console.log('[JOB] SUCCESS (elapsed=' + elapsed + 'ms, status=' + result.status + ')');
    console.log('[JOB] Counters: created=' + result.documents_created +
      ', updated=' + result.documents_updated +
      ', deleted=' + result.documents_deleted +
      ', clusters=' + result.clusters_formed +
      ', confirmed_edges=' + result.confirmed_edges_written +
      ', unconfirmed_edges=' + result.unconfirmed_edges_written);

    logRemaining(context, 'SUCCESS');
    context.closeWithSuccess();

  } catch (error) {
    console.error('[JOB] FAILED');
    console.error('[JOB] name=' + error.name);
    console.error('[JOB] message=' + error.message);
    console.error('[JOB] stack=' + (error.stack || ''));

    try {
      console.error('[JOB] remaining_execution_ms=' + context.getRemainingExecutionTimeMs());
    } catch (_) {}

    context.closeWithFailure();
  }
};
