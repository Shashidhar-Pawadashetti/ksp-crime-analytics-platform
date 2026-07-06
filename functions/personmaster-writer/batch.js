'use strict';

function createBatches(items, batchSize) {
  var batches = [];
  for (var i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

async function retryWithBackoff(fn, maxRetries) {
  var lastError;
  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        var delay = Math.pow(2, attempt) * 200;
        await new Promise(function(resolve) { setTimeout(resolve, delay); });
      }
    }
  }
  throw lastError;
}

module.exports = { createBatches, retryWithBackoff };
