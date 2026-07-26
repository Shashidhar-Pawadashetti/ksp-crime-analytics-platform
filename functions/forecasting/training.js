'use strict';

var modelBackend = require('./model-backend');
var timeSeries = require('./time-series');
var crc32 = require('./crc32');

var MODEL_REGISTRY_TABLE = 'ModelRegistry';
var TRAINING_VERSION = 1;

/*
 * Train forecasting models for each (unit_id, crime_head_id) series.
 *
 * Flow:
 *   1. Load CTUF records from NoSQL
 *   2. Group by (unit_id, crime_head_id)
 *   3. Prepare time series (clean, sort, aggregate, fill)
 *   4. Apply minimum-history guard
 *   5. Temporal train/validation split
 *   6. Train ExponentialSmoothingBackend on each series
 *   7. Evaluate on validation set
 *   8. Compute aggregate metrics
 *   9. Register in ModelRegistry
 */

async function runTraining(appInstance, options) {
  var opts = options || {};
  var backendType = opts.backend || 'exponential_smoothing';
  var featureSnapshotRunId = opts.featureSnapshotRunId || null;
  var t0 = Date.now();

  // Step 1: Load CTUF records
  var ctufRecords = await timeSeries.loadCTUFRecords(appInstance);
  if (ctufRecords.length === 0) {
    throw new Error('No CTUF records found. Run WBS 5.1 feature derivation first.');
  }

  // Step 2: Group by (unit_id, crime_head_id)
  var groups = timeSeries.groupByUnitCrime(ctufRecords);
  var groupKeys = Object.keys(groups);

  if (groupKeys.length === 0) {
    throw new Error('No (unit_id, crime_head_id) groups found in CTUF records.');
  }

  // Step 3-6: Train per series
  var backend = modelBackend.createModelBackend(backendType);
  var seriesResults = [];
  var totalSeries = 0;
  var skippedSeries = 0;
  var totalTrainingWeeks = 0;
  var sumMae = 0;
  var sumRmse = 0;
  var evalCount = 0;

  groupKeys.forEach(function (key) {
    var group = groups[key];
    var series = timeSeries.prepareSeries(group.records);

    if (!series || series.length < timeSeries.MIN_HISTORY_WEEKS()) {
      skippedSeries++;
      return;
    }

    totalSeries++;

    // Temporal split
    var split = timeSeries.temporalSplit(series, 0.2);
    if (split.training.length < 2) {
      skippedSeries++;
      return;
    }

    // Extract values
    var trainValues = timeSeries.extractWeekValues(split.training).map(function (r) { return r.value; });
    var trainWeeks = timeSeries.extractWeekValues(split.training);
    var valWeeks = timeSeries.extractWeekValues(split.validation);

    try {
      // Train
      var modelParams = backend.train(trainWeeks);

      totalTrainingWeeks += split.training.length;

      // Evaluate on validation
      if (valWeeks.length > 0) {
        var valValues = valWeeks.map(function (r) { return r.value; });
        var valForecast = backend.forecast(modelParams, valWeeks.length);
        var evalMetrics = backend.evaluate(valValues, valForecast);

        sumMae += evalMetrics.mae;
        sumRmse += evalMetrics.rmse;
        evalCount++;

        seriesResults.push({
          unit_id: group.unit_id,
          crime_head_id: group.crime_head_id,
          seriesLength: series.length,
          trainingLength: split.training.length,
          validationLength: split.validation.length,
          alpha: modelParams.alpha,
          beta: modelParams.beta,
          level: modelParams.level,
          trend: modelParams.trend,
          mae: evalMetrics.mae,
          rmse: evalMetrics.rmse,
          mape: evalMetrics.mape,
          lastValue: trainValues[trainValues.length - 1]
        });
      } else {
        seriesResults.push({
          unit_id: group.unit_id,
          crime_head_id: group.crime_head_id,
          seriesLength: series.length,
          trainingLength: split.training.length,
          validationLength: 0,
          alpha: modelParams.alpha,
          beta: modelParams.beta,
          level: modelParams.level,
          trend: modelParams.trend,
          mae: null, rmse: null, mape: null,
          lastValue: trainValues[trainValues.length - 1]
        });
      }
    } catch (e) {
      skippedSeries++;
    }
  });

  if (totalSeries === 0) {
    throw new Error('No series with sufficient history (' + timeSeries.MIN_HISTORY_WEEKS() + ' weeks minimum) could be trained.');
  }

  var avgMae = evalCount > 0 ? Math.round((sumMae / evalCount) * 1000) / 1000 : null;
  var avgRmse = evalCount > 0 ? Math.round((sumRmse / evalCount) * 1000) / 1000 : null;

  // Generate model version
  var modelVersion = generateModelVersion(ctufRecords, featureSnapshotRunId);

  var trainedAt = new Date().toISOString();
  var elapsed = ((Date.now() - t0) / 1000).toFixed(2);
  var trainingRunId = 'FTRN_' + crc32([modelVersion, trainedAt].join('|')).toString(16).padStart(8, '0');

  var result = {
    trainingRunId: trainingRunId,
    modelVersion: modelVersion,
    modelName: 'holt_exponential_smoothing',
    modelType: 'forecasting',
    trainingBackend: backendType,
    trainedAt: trainedAt,
    elapsedSeconds: Number(elapsed),
    featureSnapshotRunId: featureSnapshotRunId,
    trainingStats: {
      totalCTUFRecords: ctufRecords.length,
      totalGroups: groupKeys.length,
      seriesTrained: totalSeries,
      seriesSkipped: skippedSeries,
      totalTrainingWeeks: totalTrainingWeeks,
      seriesWithEval: evalCount
    },
    validationMetrics: {
      avg_mae: avgMae,
      avg_rmse: avgRmse
    },
    seriesResults: seriesResults
  };

  return result;
}

function generateModelVersion(ctufRecords, featureSnapshotRunId) {
  var n = ctufRecords.length;
  var groups = timeSeries.groupByUnitCrime(ctufRecords);
  var groupCount = Object.keys(groups).length;
  var seed = ['fc-v' + TRAINING_VERSION, 'n-' + n, 'g-' + groupCount, 'snapshot-' + (featureSnapshotRunId || 'unknown')];
  var hash = crc32(seed.sort().join('|'));
  return 'FC_v' + TRAINING_VERSION + '_' + hash.toString(16).padStart(8, '0');
}

/*
 * Persist to ModelRegistry.
 * Uses ModelType = 'forecasting' to avoid superseding risk-scoring models.
 */
async function persistModelRecord(appInstance, trainingResult) {
  var table = appInstance.datastore().table(MODEL_REGISTRY_TABLE);
  var now = new Date();
  var fmtDateTime = now.toISOString().replace('T', ' ').replace(/\.\d+Z/, '');

  var row = {
    RunID: trainingResult.trainingRunId,
    ModelType: trainingResult.modelType,
    ModelName: trainingResult.modelName,
    ModelVersion: trainingResult.modelVersion,
    TrainingBackend: trainingResult.trainingBackend,
    TrainedAt: trainingResult.trainedAt,
    ValidationMetric: 'MAE',
    ValidationScore: trainingResult.validationMetrics.avg_mae != null ? trainingResult.validationMetrics.avg_mae : 0,
    Status: 'active',
    TrainingSetSize: trainingResult.trainingStats.seriesTrained,
    ValidationSetSize: trainingResult.trainingStats.seriesWithEval,
    PositiveCount: trainingResult.trainingStats.totalCTUFRecords,
    NegativeCount: 0,
    Accuracy: trainingResult.validationMetrics.avg_rmse != null ? trainingResult.validationMetrics.avg_rmse : 0,
    Precision: 0,
    Recall: 0,
    ROCAUC: 0,
    Coefficients: JSON.stringify({ alpha_avg: null, beta_avg: null }),
    FeatureSnapshotRunID: trainingResult.featureSnapshotRunId || '',
    CreatedAt: fmtDateTime
  };

  // Supersede only forecasting models
  await supersedeActiveForecastingModels(appInstance, trainingResult.trainingRunId);

  try {
    await table.insertRow(row);
    return { created: 1, updated: 0 };
  } catch (err) {
    throw new Error('ModelRegistry insert failed: ' + err.message);
  }
}

async function supersedeActiveForecastingModels(appInstance, newRunId) {
  try {
    var sql = "SELECT mr.ROWID FROM ModelRegistry AS mr WHERE mr.ModelType = 'forecasting' AND mr.Status = 'active'";
    var rows = await appInstance.zcql().executeZCQLQuery(sql);
    if (rows && rows.length > 0) {
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var rowId = null;
        var keys = Object.keys(row);
        for (var ki = 0; ki < keys.length; ki++) {
          var val = row[keys[ki]];
          if (val && typeof val === 'object' && val.ROWID) { rowId = val.ROWID; break; }
        }
        if (rowId) {
          try {
            await appInstance.datastore().table(MODEL_REGISTRY_TABLE).updateRow({ ROWID: rowId, Status: 'superseded' });
          } catch (e) { console.error('[training] Failed to supersede: ' + e.message); }
        }
      }
    }
  } catch (err) {
    console.error('[training] Error superseding: ' + err.message);
  }
}

/*
 * Load active forecasting model from ModelRegistry.
 */
async function getActiveModel(appInstance) {
  try {
    var sql = "SELECT mr.ROWID, mr.RunID, mr.ModelVersion, mr.ModelName, mr.ModelType, mr.TrainingBackend, mr.TrainedAt, mr.ValidationMetric, mr.ValidationScore, mr.Status, mr.TrainingSetSize, mr.ValidationSetSize, mr.FeatureSnapshotRunID FROM ModelRegistry AS mr WHERE mr.ModelType = 'forecasting' AND mr.Status = 'active' ORDER BY mr.CreatedAt DESC LIMIT 1";
    var rows = await appInstance.zcql().executeZCQLQuery(sql);
    if (!rows || rows.length === 0) return null;

    var row = rows[0];
    var flat = {};
    var keys = Object.keys(row);
    for (var ki = 0; ki < keys.length; ki++) {
      var val = row[keys[ki]];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        var subKeys = Object.keys(val);
        for (var si = 0; si < subKeys.length; si++) { flat[subKeys[si]] = val[subKeys[si]]; }
      } else { flat[keys[ki]] = val; }
    }

    return {
      runId: flat.RunID,
      modelVersion: flat.ModelVersion,
      modelName: flat.ModelName,
      modelType: flat.ModelType,
      trainingBackend: flat.TrainingBackend,
      trainedAt: flat.TrainedAt,
      validationMetric: flat.ValidationMetric,
      validationScore: flat.ValidationScore != null ? Number(flat.ValidationScore) : null,
      status: flat.Status,
      trainingSetSize: flat.TrainingSetSize != null ? Number(flat.TrainingSetSize) : 0,
      featureSnapshotRunId: flat.FeatureSnapshotRunID
    };
  } catch (err) {
    console.error('[training] Error loading active forecasting model: ' + err.message);
    return null;
  }
}

module.exports = {
  runTraining: runTraining,
  persistModelRecord: persistModelRecord,
  getActiveModel: getActiveModel,
  generateModelVersion: generateModelVersion
};
