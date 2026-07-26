'use strict';
var mockAppInstance = { _insertedRows: {}, _nosqlTables: {}, _zcqlResults: [], _queryTableCalls: 0, _insertRowCalls: 0, _getTableCalls: {} };
function resetMock() {
  mockAppInstance._insertedRows = {};
  mockAppInstance._nosqlTables = {};
  mockAppInstance._zcqlResults = [];
  mockAppInstance._queryTableCalls = 0;
  mockAppInstance._insertRowCalls = 0;
  mockAppInstance._getTableCalls = {};
}
function initializeApp(req) {
  resetMock();
  req.catalystApp = mockAppInstance;
  return mockAppInstance;
}
function makeMockNoSQLTable(records) {
  var callCount = 0;
  var fn = async function () {
    callCount++;
    var items = (records || []).map(function (d) { return { item: { to: function () { return JSON.parse(JSON.stringify(d)); } } }; });
    return { getResponseData: function () { return items; }, start_key: null };
  };
  fn.getCallCount = function () { return callCount; };
  return fn;
}
function getMockCatalyst(noSQLRecords, zcqlResults) {
  var mockQueryTable = makeMockNoSQLTable(noSQLRecords || []);
  var mockInsertRow = async function (row) {
    mockAppInstance._insertRowCalls = (mockAppInstance._insertRowCalls || 0) + 1;
    var key = 'ROWID_' + mockAppInstance._insertRowCalls;
    mockAppInstance._insertedRows[key] = row;
    return { ROWID: key };
  };
  var mockUpdateRow = async function (row) { return { ROWID: row.ROWID || 'UPDATED' }; };
  var mockExecuteZCQL = async function () { return zcqlResults || []; };
  mockAppInstance.nosql = function () {
    return { getTable: function (tableName) { mockAppInstance._getTableCalls[tableName] = (mockAppInstance._getTableCalls[tableName] || 0) + 1; return Promise.resolve({ queryTable: mockQueryTable }); } };
  };
  mockAppInstance.zcql = function () { return { executeZCQLQuery: mockExecuteZCQL }; };
  mockAppInstance.datastore = function () {
    return { table: function () { return { insertRow: mockInsertRow, updateRow: mockUpdateRow }; } };
  };
  return mockAppInstance;
}
module.exports = { initializeApp: initializeApp, getMockCatalyst: getMockCatalyst, resetMock: resetMock, makeMockNoSQLTable: makeMockNoSQLTable, mockAppInstance: mockAppInstance };
