'use strict';

function success(data, statusCode) {
  return {
    statusCode: statusCode || 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: true,
      data: data
    })
  };
}

function error(message, statusCode, details) {
  var body = {
    success: false,
    error: message
  };
  if (details) {
    body.details = details;
  }
  return {
    statusCode: statusCode || 400,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

function notFound(message) {
  return error(message || 'Resource not found', 404);
}

function serverError(message) {
  return error(message || 'Internal server error', 500);
}

function validationError(errors) {
  return error('Validation failed', 400, errors);
}

module.exports = {
  success: success,
  error: error,
  notFound: notFound,
  serverError: serverError,
  validationError: validationError
};
