'use strict';

/*
 * Job lifecycle tests for sync-full-job.
 *
 * Tests the Job Function handler contract:
 *   A. Successful reconciliation → closeWithSuccess called exactly once
 *   B. FAILED result → closeWithFailure called exactly once
 *   C. Thrown exception → closeWithFailure called exactly once
 *   D. catalyst.initialize receives context (not initializeApp)
 *   E. max_records is never passed to fullReconcile
 *   F. Handler does not call closeWithSuccess before fullReconcile resolves
 *
 * Run: node test_job_lifecycle.js
 */

var assert = require('assert');
var Module = require('module');

/* ------------------------------------------------------------------ */
/*  Test harness                                                      */
/* ------------------------------------------------------------------ */

var passed = 0;
var failed = 0;

function test(name, fn) {
  try { fn(); console.log('  \u2713 ' + name); passed++; }
  catch (e) { console.log('  \u2717 ' + name + ': ' + e.message); failed++; }
}

async function testAsync(name, fn) {
  try { await fn(); console.log('  \u2713 ' + name); passed++; }
  catch (e) { console.log('  \u2717 ' + name + ': ' + e.message); failed++; }
}

/* ------------------------------------------------------------------ */
/*  Mock factories                                                    */
/* ------------------------------------------------------------------ */

function createMockContext() {
  return {
    headers: {
      'x-request-id': 'test-req-001',
      'x-forwarded-for': '127.0.0.1'
    },
    closeWithSuccess: function () {
      this._successCalled = (this._successCalled || 0) + 1;
    },
    closeWithFailure: function () {
      this._failureCalled = (this._failureCalled || 0) + 1;
    },
    getMaxExecutionTimeMs: function () { return 900000; },
    getRemainingExecutionTimeMs: function () { return 800000; },
    _successCalled: 0,
    _failureCalled: 0
  };
}

function createMockJobRequest() {
  return {
    getJobDetails: function () { return { id: 'test-job-001' }; },
    getJobMetaDetails: function () { return {}; },
    getAllJobParams: function () { return {}; }
  };
}

/* ------------------------------------------------------------------ */
/*  Module mock factory                                               */
/* ------------------------------------------------------------------ */

function createHandlerWithMock(mockFullReconcileFn) {
  var origLoad = Module._load;
  var handler;

  Module._load = function (request, parent, isMain) {
    if (request === 'zcatalyst-sdk-node') {
      return {
        initialize: function (ctx) {
          return {
            zcql: function () {
              return { executeZCQLQuery: async function () { return []; } };
            },
            nosql: function () {
              return {
                getTable: async function () {
                  return {
                    queryTable: async function () { return { getResponseData: function () { return []; } }; },
                    insertItems: async function () {},
                    updateItems: async function () {},
                    deleteItems: async function () {},
                    getItems: async function () { return { data: [] }; }
                  };
                }
              };
            },
            datastore: function () {
              return { table: function () { return { insertRow: async function () { return {}; } }; } };
            }
          };
        }
      };
    }
    if (request === './fullReconciler') {
      return { fullReconcile: mockFullReconcileFn };
    }
    return origLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('./index')];
    handler = require('./index');
  } finally {
    Module._load = origLoad;
  }

  return handler;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

console.log('\n=== Basic Handler Contract ===');

test('handler exports as a function', function () {
  var handler = require('./index');
  assert.strictEqual(typeof handler, 'function');
});

test('handler is an async function', function () {
  var handler = require('./index');
  assert.strictEqual(handler.constructor.name, 'AsyncFunction',
    'handler should be AsyncFunction, got ' + handler.constructor.name);
});

test('handler returns a Promise when invoked', function () {
  var handler = require('./index');
  var mockJobRequest = createMockJobRequest();
  var mockContext = createMockContext();

  var promise = handler(mockJobRequest, mockContext);
  assert.ok(promise instanceof Promise, 'handler must return a Promise');
  promise.catch(function () {});
});

console.log('\n=== Handler Contract — Mock fullReconcile ===');

/* ---- Test A ---- */
testAsync('A: success calls closeWithSuccess, not closeWithFailure', async function () {
  var mockFullReconcile = async function (app, options) {
    return {
      status: 'SUCCESS',
      documents_created: 10,
      documents_updated: 0,
      documents_deleted: 0,
      clusters_formed: 2,
      confirmed_edges_written: 3,
      unconfirmed_edges_written: 1
    };
  };

  var handler = createHandlerWithMock(mockFullReconcile);
  var ctx = createMockContext();
  var req = createMockJobRequest();

  await handler(req, ctx);

  assert.strictEqual(ctx._successCalled, 1, 'closeWithSuccess must be called exactly once');
  assert.strictEqual(ctx._failureCalled, 0, 'closeWithFailure must never be called');
});

/* ---- Test B ---- */
testAsync('B: FAILED result calls closeWithFailure, not closeWithSuccess', async function () {
  var mockFullReconcile = async function () {
    return { status: 'FAILED', error_count: 3 };
  };

  var handler = createHandlerWithMock(mockFullReconcile);
  var ctx = createMockContext();
  var req = createMockJobRequest();

  await handler(req, ctx);

  assert.strictEqual(ctx._failureCalled, 1, 'closeWithFailure must be called exactly once');
  assert.strictEqual(ctx._successCalled, 0, 'closeWithSuccess must never be called');
});

/* ---- Test C ---- */
testAsync('C: thrown exception calls closeWithFailure, not closeWithSuccess', async function () {
  var mockFullReconcile = async function () {
    throw new Error('Simulated reconciliation crash');
  };

  var handler = createHandlerWithMock(mockFullReconcile);
  var ctx = createMockContext();
  var req = createMockJobRequest();

  await handler(req, ctx);

  assert.strictEqual(ctx._failureCalled, 1, 'closeWithFailure must be called exactly once');
  assert.strictEqual(ctx._successCalled, 0, 'closeWithSuccess must never be called');
});

/* ---- Test D ---- */
testAsync('D: catalyst.initialize receives context', async function () {
  var initializeReceived = null;

  var origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'zcatalyst-sdk-node') {
      return {
        initialize: function (ctx) {
          initializeReceived = ctx;
          return {
            zcql: function () { return { executeZCQLQuery: async function () { return []; } }; },
            nosql: function () { return { getTable: async function () { return { insertItems: async function () {} }; } }; },
            datastore: function () { return { table: function () { return { insertRow: async function () { return {}; } }; } }; }
          };
        }
      };
    }
    if (request === './fullReconciler') {
      return { fullReconcile: async function () { return { status: 'SUCCESS' }; } };
    }
    return origLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve('./index')];
    var handler = require('./index');
    var ctx = createMockContext();
    var req = createMockJobRequest();

    await handler(req, ctx);

    assert.ok(initializeReceived !== null, 'catalyst.initialize must be called');
    assert.strictEqual(initializeReceived, ctx, 'catalyst.initialize must receive the context object');
  } finally {
    Module._load = origLoad;
  }
});

/* ---- Test E ---- */
testAsync('E: max_records is never passed to fullReconcile', async function () {
  var capturedOptions = null;

  var mockFullReconcile = async function (app, options) {
    capturedOptions = options;
    return { status: 'SUCCESS' };
  };

  var handler = createHandlerWithMock(mockFullReconcile);
  var ctx = createMockContext();
  var req = createMockJobRequest();

  await handler(req, ctx);

  assert.ok(capturedOptions, 'options should be captured');
  assert.strictEqual(capturedOptions.max_records, undefined,
    'must NOT pass max_records');
  assert.ok(capturedOptions.runId, 'must generate runId');
  assert.ok(capturedOptions.runId.indexOf('FULL-JOB-') === 0,
    'runId must start with FULL-JOB-, got: ' + capturedOptions.runId);
  assert.ok(capturedOptions.runId.indexOf('test-job-001') !== -1,
    'runId must contain job id test-job-001, got: ' + capturedOptions.runId);
});

/* ---- Test F ---- */
testAsync('F: does not call closeWithSuccess before fullReconcile resolves', async function () {
  var closeWithSuccessCalled = false;
  var reconciliationStarted = false;
  var reconciliationDone = false;

  var mockFullReconcile = async function () {
    reconciliationStarted = true;
    assert.strictEqual(closeWithSuccessCalled, false,
      'closeWithSuccess must not be called before reconciliation starts');
    await new Promise(function (resolve) { setImmediate(resolve); });
    reconciliationDone = true;
    return { status: 'SUCCESS' };
  };

  var handler = createHandlerWithMock(mockFullReconcile);
  var ctx = createMockContext();
  var req = createMockJobRequest();

  ctx.closeWithSuccess = function () {
    closeWithSuccessCalled = true;
    ctx._successCalled = (ctx._successCalled || 0) + 1;
  };

  await handler(req, ctx);

  assert.strictEqual(reconciliationStarted, true, 'reconciliation must have started');
  assert.strictEqual(reconciliationDone, true, 'reconciliation must have completed');
  assert.strictEqual(ctx._successCalled, 1, 'closeWithSuccess must be called after reconciliation');
});

/* ------------------------------------------------------------------ */
/*  Summary                                                           */
/* ------------------------------------------------------------------ */

console.log('\n=== Summary ===');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);

if (failed > 0) {
  console.log('\nSome tests FAILED.');
  process.exit(1);
} else {
  console.log('\nAll tests PASSED.');
}
