'use strict';

var { route } = require('./routes');
var responseFormatter = require('./responseFormatter');

module.exports = function(req, res) {
  try {
    var result = route(req);

    res.writeHead(result.statusCode, result.headers);
    res.write(result.body);
  } catch (e) {
    var errResp = responseFormatter.serverError(e.message);
    res.writeHead(errResp.statusCode, errResp.headers);
    res.write(errResp.body);
  }

  res.end();
};
