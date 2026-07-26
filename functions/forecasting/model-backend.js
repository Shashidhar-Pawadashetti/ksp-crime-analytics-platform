'use strict';

/*
 * ForecastModelBackend — abstraction for time-series model training,
 * forecasting, and evaluation.
 *
 * Primary: ExponentialSmoothingBackend — Holt's linear trend method.
 *   Learns alpha (level) and beta (trend) by minimizing SSE on history.
 *
 * Production: QuickMLAdapter (requires deployed QuickML model).
 * Testing:    ExponentialSmoothingBackend (works locally, learns from data).
 */

var https = require('https');
var QUICKML_URL = process.env.QUICKML_URL || 'https://api.catalyst.zoho.in/quickml/v1/project/47995000000013046/glm/chat';

/* ------------------------------------------------------------------ */
/*  ExponentialSmoothingBackend                                       */
/* ------------------------------------------------------------------ */

/*
 * Holt's linear exponential smoothing:
 *   level[t]   = alpha * value[t] + (1 - alpha) * (level[t-1] + trend[t-1])
 *   trend[t]   = beta * (level[t] - level[t-1]) + (1 - beta) * trend[t-1]
 *   forecast[h] = level[last] + h * trend[last]
 *
 * Training: grid search alpha in [0.05, 0.95], beta in [0.05, 0.50]
 * to minimize sum of squared errors on historical data.
 */
function ExponentialSmoothingBackend() {
  this._params = null;
  this._history = null;
}

ExponentialSmoothingBackend.prototype._fitHolt = function (values, alpha, beta) {
  return this._fitHoltCorrected(values, alpha, beta);
};

ExponentialSmoothingBackend.prototype._fitHoltCorrected = function (values, alpha, beta) {
  if (values.length < 2) return { level: values[0] || 0, trend: 0, sse: Infinity };

  var level = values[0];
  var trend = values.length > 1 ? values[1] - values[0] : 0;
  var sse = 0;

  for (var t = 1; t < values.length; t++) {
    var forecast = level + trend;
    var error = values[t] - forecast;
    sse += error * error;
    var newLevel = alpha * values[t] + (1 - alpha) * (level + trend);
    var newTrend = beta * (newLevel - level) + (1 - beta) * trend;
    level = newLevel;
    trend = newTrend;
  }

  return { level: level, trend: trend, sse: sse };
};

ExponentialSmoothingBackend.prototype.train = function (series) {
  if (!series || series.length < 2) {
    throw new Error('Insufficient history for training (need >= 2 observations)');
  }

  var values = series.map(function (r) { return r.value; });

  // Grid search for best alpha, beta
  var bestAlpha = 0.3;
  var bestBeta = 0.1;
  var bestSse = Infinity;

  var alphas = [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95];
  var betas = [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5];

  for (var ai = 0; ai < alphas.length; ai++) {
    for (var bj = 0; bj < betas.length; bj++) {
      var result = this._fitHoltCorrected(values, alphas[ai], betas[bj]);
      if (result.sse < bestSse) {
        bestSse = result.sse;
        bestAlpha = alphas[ai];
        bestBeta = betas[bj];
      }
    }
  }

  var finalFit = this._fitHoltCorrected(values, bestAlpha, bestBeta);

  this._params = {
    alpha: bestAlpha,
    beta: bestBeta,
    level: finalFit.level,
    trend: finalFit.trend,
    sse: bestSse,
    mse: bestSse / Math.max(values.length - 1, 1),
    seriesLength: values.length,
    lastValue: values[values.length - 1]
  };

  this._history = series;

  return {
    alpha: bestAlpha,
    beta: bestBeta,
    level: finalFit.level,
    trend: finalFit.trend,
    sse: bestSse,
    mse: bestSse / Math.max(values.length - 1, 1),
    seriesLength: values.length
  };
};

ExponentialSmoothingBackend.prototype.forecast = function (modelParams, horizonWeeks) {
  if (!modelParams) throw new Error('No trained model parameters');
  var level = modelParams.level || 0;
  var trend = modelParams.trend || 0;
  var result = [];

  for (var h = 1; h <= horizonWeeks; h++) {
    var fv = level + h * trend;
    if (fv < 0) fv = 0;
    result.push(fv);
  }
  return result;
};

/*
 * Compute confidence interval from historical residuals.
 *   residual_std = sqrt(MSE) from training
 *   ci_width = z * residual_std * sqrt(h)
 *   where z = 1.96 (95% CI), h = horizon weeks
 *
 * low  = max(0, forecast - ci_width)
 * high = forecast + ci_width
 */
ExponentialSmoothingBackend.prototype.computeConfidenceInterval = function (modelParams, forecastValues, horizonWeeks) {
  var z = 1.96;
  var residualStd = modelParams && modelParams.mse != null ? Math.sqrt(modelParams.mse) : 1;

  return forecastValues.map(function (fv, idx) {
    var h = idx + 1;
    var ciWidth = z * residualStd * Math.sqrt(h);
    return {
      forecast: Math.round(fv * 1000) / 1000,
      low: Math.max(0, Math.round((fv - ciWidth) * 1000) / 1000),
      high: Math.round((fv + ciWidth) * 1000) / 1000
    };
  });
};

ExponentialSmoothingBackend.prototype.evaluate = function (actualValues, predictedValues) {
  if (actualValues.length === 0) return { mae: 0, rmse: 0, mape: null };

  var n = Math.min(actualValues.length, predictedValues.length);
  if (n === 0) return { mae: 0, rmse: 0, mape: null };

  var sumAbsErr = 0;
  var sumSqErr = 0;
  var sumAbsPctErr = 0;
  var mapeCount = 0;

  for (var i = 0; i < n; i++) {
    var actual = actualValues[i];
    var predicted = predictedValues[i];
    var err = actual - predicted;
    sumAbsErr += Math.abs(err);
    sumSqErr += err * err;
    if (actual !== 0) {
      sumAbsPctErr += Math.abs(err / actual);
      mapeCount++;
    }
  }

  return {
    mae: Math.round((sumAbsErr / n) * 1000) / 1000,
    rmse: Math.round(Math.sqrt(sumSqErr / n) * 1000) / 1000,
    mape: mapeCount > 0 ? Math.round((sumAbsPctErr / mapeCount) * 1000) / 1000 : null
  };
};

ExponentialSmoothingBackend.prototype.getParams = function () {
  return this._params;
};

ExponentialSmoothingBackend.prototype.getHistory = function () {
  return this._history;
};

/* ------------------------------------------------------------------ */
/*  QuickMLAdapter stub (production backend placeholder)               */
/* ------------------------------------------------------------------ */

function QuickMLAdapter() {
  this._params = null;
}

QuickMLAdapter.prototype.getAccessToken = function () {
  if (process.env.QUICKML_TOKEN) return Promise.resolve(process.env.QUICKML_TOKEN);
  return Promise.reject(new Error('No QUICKML_TOKEN configured'));
};

QuickMLAdapter.prototype.train = function (series) {
  this._params = { backend: 'quickml', trainedAt: new Date().toISOString(), seriesLength: series.length };
  return this._params;
};

QuickMLAdapter.prototype.forecast = function (modelParams, horizonWeeks) {
  var result = [];
  for (var h = 1; h <= horizonWeeks; h++) result.push(0);
  return result;
};

QuickMLAdapter.prototype.computeConfidenceInterval = function (modelParams, forecastValues) {
  return forecastValues.map(function (fv) { return { forecast: fv, low: 0, high: fv + 1 }; });
};

QuickMLAdapter.prototype.evaluate = function (actual, predicted) {
  return { mae: 0, rmse: 0, mape: null };
};

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

function createModelBackend(backendType) {
  switch (backendType) {
    case 'quickml': return new QuickMLAdapter();
    case 'exponential_smoothing':
    default: return new ExponentialSmoothingBackend();
  }
}

module.exports = {
  ExponentialSmoothingBackend: ExponentialSmoothingBackend,
  QuickMLAdapter: QuickMLAdapter,
  createModelBackend: createModelBackend
};
