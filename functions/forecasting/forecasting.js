'use strict';

var training = require('./training');
var modelBackend = require('./model-backend');
var timeSeries = require('./time-series');
var crc32 = require('./crc32');

var FORECASTRESULT_TABLE = 'ForecastResult';

/*
 * Horizon definitions:
 *   7d  → 1 week
 *   14d → 2 weeks
 *   30d → 4.2857 weeks (30 / 7)
 *
 * Forecast is generated at weekly granularity, then the weekly
 * predictions are SUMMED for each horizon.
 *
 * For 30d = 4.2857 weeks:
 *   - Generate 5 weekly forecasts
 *   - Sum first 4 weeks + 0.2857 * week 5
 *   This fractional approach avoids silently treating 30d as 28d.
 */

var HORIZONS = {
  7:  { weeks: 1, label: '7d' },
  14: { weeks: 2, label: '14d' },
  30: { weeks: 4.2857, label: '30d' }
};

/*
 * Generate a deterministic forecast ID.
 */
function generateForecastId(unitId, crimeHeadId, horizonDays, modelVersion, featureSnapshotRunId) {
  var seed = [String(unitId), String(crimeHeadId), String(horizonDays), modelVersion, featureSnapshotRunId || ''].sort().join('|');
  var hash = crc32(seed);
  return 'FCT_' + hash.toString(16).padStart(8, '0');
}

/*
 * Generate forecasts for all (unit_id, crime_head_id) series using the active model.
 *
 * Flow:
 *   1. Load active forecasting model from ModelRegistry
 *   2. Load CTUF records
 *   3. Group and prepare series per (unit_id, crime_head_id)
 *   4. For each series: train backend, forecast 7/14/30d horizons
 *   5. Persist to ForecastResult
 *   6. Return summary
 */
async function runForecasting(appInstance, options) {
  var opts = options || {};
  var t0 = Date.now();

  // Step 1: Load active model
  var activeModel = await training.getActiveModel(appInstance);
  if (!activeModel) {
    throw new Error('No active forecasting model found. Run POST /train first.');
  }

  // Step 2: Load CTUF records
  var ctufRecords = await timeSeries.loadCTUFRecords(appInstance);
  if (ctufRecords.length === 0) {
    throw new Error('No CTUF records found. Run WBS 5.1 feature derivation first.');
  }

  // Step 3: Group and prepare series
  var groups = timeSeries.groupByUnitCrime(ctufRecords);
  var groupKeys = Object.keys(groups);

  var backend = modelBackend.createModelBackend(activeModel.trainingBackend || 'exponential_smoothing');
  var forecastResults = [];
  var seriesProcessed = 0;
  var seriesSkipped = 0;

  groupKeys.forEach(function (key) {
    var group = groups[key];
    var series = timeSeries.prepareSeries(group.records);

    if (!series || series.length < 2) {
      seriesSkipped++;
      return;
    }

    var weekValues = timeSeries.extractWeekValues(series);
    var valuesOnly = weekValues.map(function (r) { return r.value; });

    try {
      var modelParams = backend.train(weekValues);

      // Generate forecasts for each horizon
      var horizonKeys = Object.keys(HORIZONS);
      horizonKeys.forEach(function (hd) {
        var horizon = HORIZONS[hd];
        var horizonWeeks = Math.ceil(horizon.weeks); // Generate ceil weeks of weekly data
        var weeklyForecasts = backend.forecast(modelParams, horizonWeeks);
        var ci = backend.computeConfidenceInterval(modelParams, weeklyForecasts, horizonWeeks);

        // Convert weekly forecasts to horizon total
        var forecastValue = 0;
        var fullWeeks = Math.floor(horizon.weeks);
        var fractionalWeek = horizon.weeks - fullWeeks;

        for (var w = 0; w < fullWeeks && w < weeklyForecasts.length; w++) {
          forecastValue += weeklyForecasts[w];
        }
        if (fractionalWeek > 0 && fullWeeks < weeklyForecasts.length) {
          forecastValue += fractionalWeek * weeklyForecasts[fullWeeks];
        }

        // Aggregate CI
        var ciLow = 0;
        var ciHigh = 0;
        for (var cw = 0; cw < fullWeeks && cw < ci.length; cw++) {
          ciLow += ci[cw].low;
          ciHigh += ci[cw].high;
        }
        if (fractionalWeek > 0 && fullWeeks < ci.length) {
          ciLow += fractionalWeek * ci[fullWeeks].low;
          ciHigh += fractionalWeek * ci[fullWeeks].high;
        }

        var forecastId = generateForecastId(
          group.unit_id, group.crime_head_id, Number(hd),
          activeModel.modelVersion, activeModel.featureSnapshotRunId
        );

        forecastResults.push({
          forecast_id: forecastId,
          unit_id: group.unit_id,
          crime_head_id: group.crime_head_id,
          horizon_days: Number(hd),
          forecast_value: Math.round(forecastValue * 1000) / 1000,
          confidence_low: Math.max(0, Math.round(ciLow * 1000) / 1000),
          confidence_high: Math.round(ciHigh * 1000) / 1000,
          model_name: activeModel.modelName,
          model_version: activeModel.modelVersion,
          feature_snapshot_run_id: activeModel.featureSnapshotRunId || '',
          computed_at: new Date().toISOString()
        });
      });

      seriesProcessed++;
    } catch (e) {
      seriesSkipped++;
    }
  });

  if (forecastResults.length === 0) {
    throw new Error('No forecasts could be generated. All series had insufficient history.');
  }

  // Step 5: Persist to ForecastResult
  var created = 0;
  var updated = 0;
  var errors = 0;
  var BATCH_SIZE = 30;

  for (var i = 0; i < forecastResults.length; i += BATCH_SIZE) {
    var batch = forecastResults.slice(i, i + BATCH_SIZE);
    var batchTasks = batch.map(function (rec) {
      return persistForecastResult(appInstance, rec)
        .then(function (action) { return { action: action, error: null }; })
        .catch(function (err) {
          console.error('[forecast] Persist error (' + rec.forecast_id + '): ' + err.message);
          return { action: null, error: err };
        });
    });

    var batchResults = await Promise.all(batchTasks);
    for (var ri = 0; ri < batchResults.length; ri++) {
      var r = batchResults[ri];
      if (r.error) { errors++; }
      else if (r.action === 'created') { created++; }
      else { updated++; }
    }
  }

  var scoringRunId = 'FCT_' + crc32([
    activeModel.modelVersion, activeModel.featureSnapshotRunId || '',
    new Date().toISOString().split('T')[0]
  ].join('|')).toString(16).padStart(8, '0');

  return {
    forecastingRunId: scoringRunId,
    modelName: activeModel.modelName,
    modelVersion: activeModel.modelVersion,
    featureSnapshotRunId: activeModel.featureSnapshotRunId,
    recordsProcessed: seriesProcessed,
    recordsCreated: created,
    recordsUpdated: updated,
    seriesSkipped: seriesSkipped,
    totalForecasts: forecastResults.length,
    errors: errors,
    elapsedSeconds: ((Date.now() - t0) / 1000).toFixed(2)
  };
}

/*
 * Persist a single forecast result to ForecastResult Data Store table.
 * Uses insert-first-then-update pattern for idempotency.
 */
async function persistForecastResult(appInstance, record) {
  var table = appInstance.datastore().table(FORECASTRESULT_TABLE);
  var now = new Date();
  var fmtDateTime = now.toISOString().replace('T', ' ').replace(/\.\d+Z/, '');

  var row = {
    ForecastID: record.forecast_id,
    UnitID: record.unit_id,
    CrimeHeadID: record.crime_head_id,
    HorizonDays: record.horizon_days,
    ForecastValue: record.forecast_value,
    ConfidenceLow: record.confidence_low,
    ConfidenceHigh: record.confidence_high,
    ModelName: record.model_name,
    ModelVersion: record.model_version,
    FeatureSnapshotRunID: record.feature_snapshot_run_id,
    ComputedAt: fmtDateTime
  };

  try {
    await table.insertRow(row);
    return 'created';
  } catch (insertErr) {
    try {
      var sql = "SELECT fr.ROWID FROM ForecastResult AS fr WHERE fr.ForecastID = '" + record.forecast_id + "'";
      var existing = await appInstance.zcql().executeZCQLQuery(sql);
      if (existing && existing.length > 0) {
        var existingRow = existing[0];
        var rowId = null;
        var keys = Object.keys(existingRow);
        for (var ki = 0; ki < keys.length; ki++) {
          var val = existingRow[keys[ki]];
          if (val && typeof val === 'object' && val.ROWID) { rowId = val.ROWID; break; }
        }
        if (rowId) {
          row.ROWID = rowId;
          await table.updateRow(row);
          return 'updated';
        }
      }
      await table.insertRow(row);
      return 'created';
    } catch (updateErr) {
      throw new Error('ForecastResult persist failed for ' + record.forecast_id + ': ' + updateErr.message);
    }
  }
}

module.exports = {
  runForecasting: runForecasting,
  generateForecastId: generateForecastId,
  HORIZONS: HORIZONS
};
