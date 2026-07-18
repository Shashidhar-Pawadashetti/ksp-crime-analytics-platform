'use strict';

/*
 * Catalyst SDK mock for local development.
 *
 * Provides in-memory NoSQL, ZCQL, and DataStore so endpoints work
 * without a real Catalyst project.
 *
 * The ZCQL mock returns seed data for Accused, Victim, ComplainantDetails,
 * CaseMaster, Unit, and District tables so the full resolution pipeline
 * can be tested end-to-end.
 */

/* ------------------------------------------------------------------ */
/*  In-memory store                                                    */
/* ------------------------------------------------------------------ */

var path = require('path');
var fs = require('fs');
var MOCK_STORE_PATH = path.join(__dirname, '.mock-store.json');

var tables = {};
var zcqlData = {};

function saveStore() {
  try {
    var data = JSON.stringify({ tables: tables, zcqlData: zcqlData });
    fs.writeFileSync(MOCK_STORE_PATH, data, 'utf8');
  } catch (e) {
    console.error('[catalyst-mock] Failed to save store:', e.message);
  }
}

function loadStore() {
  try {
    if (fs.existsSync(MOCK_STORE_PATH)) {
      var raw = fs.readFileSync(MOCK_STORE_PATH, 'utf8');
      var parsed = JSON.parse(raw);
      if (parsed.tables) tables = parsed.tables;
      if (parsed.zcqlData) zcqlData = parsed.zcqlData;
      return true;
    }
  } catch (e) {
    console.error('[catalyst-mock] Failed to load store:', e.message);
  }
  return false;
}

function getInMemoryTable(tableName) {
  if (!tables[tableName]) {
    tables[tableName] = [];
  }
  return tables[tableName];
}

function resetStore() {
  tables = {};
  zcqlData = {};
}

function setZcqlTableData(tableName, rows) {
  zcqlData[tableName] = rows;
}

function getZcqlTableData(tableName) {
  return zcqlData[tableName] || [];
}

/* ------------------------------------------------------------------ */
/*  Seed data: Accused / Victim / ComplainantDetails                   */
/* ------------------------------------------------------------------ */

function loadDefaultSeedData() {
  /* CaseMaster records (flat fields for joined queries) */
  zcqlData['CaseMaster'] = [
    { ROWID: 'CM-001', CrimeNo: '2024-001', IncidentFromDate: '2024-01-15', PoliceStationID: 'U1', Latitude: 12.9716, Longitude: 77.5946 },
    { ROWID: 'CM-002', CrimeNo: '2024-002', IncidentFromDate: '2024-03-20', PoliceStationID: 'U2', Latitude: 12.9343, Longitude: 77.6101 },
    { ROWID: 'CM-003', CrimeNo: '2024-003', IncidentFromDate: '2024-06-10', PoliceStationID: 'U3', Latitude: 12.2958, Longitude: 76.6394 }
  ];

  /* Unit records */
  zcqlData['Unit'] = [
    { ROWID: 'U1', UnitName: 'Police Station A', DistrictID: 'D1' },
    { ROWID: 'U2', UnitName: 'Police Station B', DistrictID: 'D1' },
    { ROWID: 'U3', UnitName: 'Police Station C', DistrictID: 'D2' }
  ];

  /* District records */
  zcqlData['District'] = [
    { ROWID: 'D1', DistrictName: 'Bengaluru Urban' },
    { ROWID: 'D2', DistrictName: 'Mysuru' }
  ];

  /* Accused — return flat rows with the field names mapSourceRows expects */
  zcqlData['Accused'] = [
    {
      ROWID: 'R1', AccusedMasterID: 'AM-001', CaseMasterID: 'CM-001',
      AccusedName: 'Rajesh Kumar', AgeYear: 32, GenderID: 1,
      IncidentFromDate: '2024-01-15', PoliceStationID: 'U1',
      Latitude: 12.9716, Longitude: 77.5946, DistrictID: 'D1'
    },
    {
      ROWID: 'R2', AccusedMasterID: 'AM-002', CaseMasterID: 'CM-001',
      AccusedName: 'Suresh Patel', AgeYear: 28, GenderID: 1,
      IncidentFromDate: '2024-01-15', PoliceStationID: 'U1',
      Latitude: 12.9716, Longitude: 77.5946, DistrictID: 'D1'
    },
    {
      ROWID: 'R3', AccusedMasterID: 'AM-003', CaseMasterID: 'CM-002',
      AccusedName: 'Rajesh Kumar', AgeYear: 33, GenderID: 1,
      IncidentFromDate: '2024-03-20', PoliceStationID: 'U2',
      Latitude: 12.9343, Longitude: 77.6101, DistrictID: 'D1'
    },
    {
      ROWID: 'R4', AccusedMasterID: 'AM-004', CaseMasterID: 'CM-003',
      AccusedName: 'Vikram Joshi', AgeYear: 45, GenderID: 1,
      IncidentFromDate: '2024-06-10', PoliceStationID: 'U3',
      Latitude: 12.2958, Longitude: 76.6394, DistrictID: 'D2'
    }
  ];

  /* Victim */
  zcqlData['Victim'] = [
    {
      ROWID: 'R5', VictimMasterID: 'VM-001', CaseMasterID: 'CM-001',
      VictimName: 'Anita Sharma', AgeYear: 35, GenderID: 2,
      IncidentFromDate: '2024-01-15', PoliceStationID: 'U1',
      Latitude: 12.9716, Longitude: 77.5946, DistrictID: 'D1'
    },
    {
      ROWID: 'R6', VictimMasterID: 'VM-002', CaseMasterID: 'CM-002',
      VictimName: 'Priya Singh', AgeYear: 29, GenderID: 2,
      IncidentFromDate: '2024-03-20', PoliceStationID: 'U2',
      Latitude: 12.9343, Longitude: 77.6101, DistrictID: 'D1'
    }
  ];

  /* ComplainantDetails */
  zcqlData['ComplainantDetails'] = [
    {
      ROWID: 'R7', ComplainantID: 'CID-001', CaseMasterID: 'CM-001',
      ComplainantName: 'Anita Sharma', AgeYear: 35, GenderID: 2,
      IncidentFromDate: '2024-01-15', PoliceStationID: 'U1',
      Latitude: 12.9716, Longitude: 77.5946, DistrictID: 'D1'
    },
    {
      ROWID: 'R8', ComplainantID: 'CID-002', CaseMasterID: 'CM-003',
      ComplainantName: 'Meena Devi', AgeYear: 50, GenderID: 2,
      IncidentFromDate: '2024-06-10', PoliceStationID: 'U3',
      Latitude: 12.2958, Longitude: 76.6394, DistrictID: 'D2'
    }
  ];
}

var loaded = loadStore();
if (!loaded) {
  loadDefaultSeedData();
  saveStore();
}

/* ------------------------------------------------------------------ */
/*  NoSQL mock                                                        */
/* ------------------------------------------------------------------ */

function MockNoSQLItem(obj) {
  this.data = obj;
}
MockNoSQLItem.from = function (obj) { return new MockNoSQLItem(obj); };

var MockNoSQLUpdateOperationType = {
  PUT: 'PUT', SET: 'SET', DELETE: 'DELETE',
  ADD: 'ADD', APPEND: 'APPEND', PREPEND: 'PREPEND', REMOVE: 'REMOVE'
};

function MockNoSQLMarshall() {}
MockNoSQLMarshall.make = function (val) { return val; };

function MockNoSQLTable(tableName) {
  this.tableName = tableName;
}

MockNoSQLTable.prototype.getItems = async function (query) {
  var keys = query && query.keys ? query.keys.data || query.keys : {};
  var store = getInMemoryTable(this.tableName);
  if (keys.person_id) {
    return { data: store.filter(function (d) { return d.person_id === keys.person_id; }) };
  }
  return { data: store };
};

MockNoSQLTable.prototype.insertItems = async function (body) {
  var item = body && body.item ? body.item.data || body.item : body;
  var store = getInMemoryTable(this.tableName);
  var exists = store.some(function (d) { return d.person_id === item.person_id; });
  if (exists) throw new Error('Duplicate key: ' + item.person_id);
  store.push(JSON.parse(JSON.stringify(item)));
  saveStore();
  return {};
};

MockNoSQLTable.prototype.updateItems = async function (body) {
  var keys = body && body.keys ? body.keys.data || body.keys : {};
  var store = getInMemoryTable(this.tableName);
  if (!keys.person_id) return {};
  var idx = -1;
  for (var i = 0; i < store.length; i++) {
    if (store[i].person_id === keys.person_id) { idx = i; break; }
  }
  if (idx === -1) {
    var newDoc = { person_id: keys.person_id };
    var attrs = body.update_attributes || [];
    for (var ai = 0; ai < attrs.length; ai++) {
      var attr = attrs[ai];
      if (attr.attribute_path && attr.attribute_path.length > 0) {
        newDoc[attr.attribute_path[0]] = attr.update_value;
      }
    }
    store.push(newDoc);
    saveStore();
    return {};
  }
  var doc = store[idx];
  var attrs2 = body.update_attributes || [];
  for (var ai2 = 0; ai2 < attrs2.length; ai2++) {
    var attr2 = attrs2[ai2];
    if (attr2.attribute_path && attr2.attribute_path.length > 0) {
      doc[attr2.attribute_path[0]] = attr2.update_value;
    }
  }
  saveStore();
  return {};
};

MockNoSQLTable.prototype.deleteItems = async function () { saveStore(); return {}; };

function MockNoSQL() {}
MockNoSQL.prototype.getTable = async function (tableName) {
  return new MockNoSQLTable(tableName);
};

/* ------------------------------------------------------------------ */
/*  ZCQL mock                                                         */
/* ------------------------------------------------------------------ */

function MockZCQL() {}

MockZCQL.prototype.executeZCQLQuery = async function (sql) {
  /* Parse the FROM table name (first one — the primary table) */
  var tableMatch = sql.match(/FROM\s+(\w+)/i);
  if (!tableMatch) return [];

  var tableName = tableMatch[1];

  /* PersonMaster — return from NoSQL store */
  if (tableName === 'PersonMaster') {
    var store = getInMemoryTable('PersonMaster');
    return store.map(function (doc) {
      var row = {};
      Object.keys(doc).forEach(function (k) { row[k] = doc[k]; });
      return row;
    });
  }

  /* CaseMaster / Unit / District — return seed data */
  if (tableName === 'CaseMaster' || tableName === 'Unit' || tableName === 'District') {
    return getZcqlTableData(tableName);
  }

  /* Accused, Victim, ComplainantDetails — return seed data (flat, pre-joined) */
  if (tableName === 'Accused' || tableName === 'Victim' || tableName === 'ComplainantDetails') {
    return getZcqlTableData(tableName);
  }

  return [];
};

/* ------------------------------------------------------------------ */
/*  DataStore mock (for ResolutionAuditLog)                            */
/* ------------------------------------------------------------------ */

function MockDataStoreTable(tableName) {
  this.tableName = tableName;
}

MockDataStoreTable.prototype.insertRow = async function (row) {
  var store = getInMemoryTable('DS_' + this.tableName);
  store.push(JSON.parse(JSON.stringify(row)));
  return { ROWID: 'MOCK-' + Date.now() };
};

function MockDataStore() {}
MockDataStore.prototype.table = function (tableName) {
  return new MockDataStoreTable(tableName);
};

/* ------------------------------------------------------------------ */
/*  App instance                                                      */
/* ------------------------------------------------------------------ */

var mockAppInstance = {
  nosql: function () { return new MockNoSQL(); },
  zcql: function () { return new MockZCQL(); },
  datastore: function () { return new MockDataStore(); }
};

/* ------------------------------------------------------------------ */
/*  Mock SDK export                                                    */
/* ------------------------------------------------------------------ */

function initializeApp(context) {
  if (context && typeof context === 'object' && !Array.isArray(context)) {
    console.log('[catalyst-mock] initializeApp(req) called');
  }
  return mockAppInstance;
}

/* Export mock types for compatibility */
initializeApp.NoSQLItem = MockNoSQLItem;
initializeApp.NoSQLEnum = { NoSQLUpdateOperationType: MockNoSQLUpdateOperationType };
initializeApp.NoSQLMarshall = MockNoSQLMarshall;

/* Export helpers for test inspection */
initializeApp.resetStore = resetStore;
initializeApp.getTableStore = getInMemoryTable;
initializeApp.setZcqlTableData = setZcqlTableData;
initializeApp.getZcqlTableData = getZcqlTableData;

/* Export persistence helpers */
initializeApp.saveStore = saveStore;
initializeApp.loadStore = loadStore;
initializeApp.setStorePath = function (p) { MOCK_STORE_PATH = p; };

module.exports = initializeApp;
