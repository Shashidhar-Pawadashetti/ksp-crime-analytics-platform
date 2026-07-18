'use strict';

/*
 * Local development server for personmaster-writer.
 *
 * Usage:
 *   node functions/personmaster-writer/server.js
 *
 * Uses the getAppInstance() fallback chain in index.js:
 *   1. catalyst.initializeApp(req)  — production Catalyst
 *   2. catalyst.initializeApp()     — local dev with env vars
 *   3. ./catalyst-mock              — in-memory mock (no external deps)
 * So no SDK replacement is needed.
 */

var fs = require('fs');
var path = require('path');
var http = require('http');
var handler = require('./index');

var PORT = parseInt(process.env.PORT || '3000', 10);
var PREFIX = '/server/personmaster-writer';

var server = http.createServer(function (req, res) {
  var url = req.url;
  if (url.indexOf(PREFIX) === 0) {
    req.url = url.slice(PREFIX.length) || '/';
  }
  handler(req, res);
});

var storePath = path.join(__dirname, '.mock-store.json');
var storeStatus = fs.existsSync(storePath) ? 'loaded from disk' : 'fresh start (no prior data)';

server.listen(PORT, function () {
  console.log('[server] personmaster-writer running at http://localhost:' + PORT + PREFIX);
  console.log('[server] POST ' + PREFIX + '/groups  — accept pre-matched groups');
  console.log('[server] POST ' + PREFIX + '/resolve — run full resolution');
  console.log('[server] GET  ' + PREFIX + '/        — health check');
  console.log('[server] Using Catalyst mock for local dev');
  console.log('[server] Mock store: ' + storeStatus);
});
