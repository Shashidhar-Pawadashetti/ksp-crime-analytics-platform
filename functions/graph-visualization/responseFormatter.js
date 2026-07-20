'use strict';

function success(data, statusCode) {
  return {
    statusCode: statusCode || 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'ok',
      data: data
    })
  };
}

function error(message, statusCode, details) {
  var body = {
    status: 'error',
    error_code: 'VALIDATION_ERROR',
    message: message
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
  return {
    statusCode: 404,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'error',
      error_code: 'NOT_FOUND',
      message: message || 'Resource not found'
    })
  };
}

function serverError(message) {
  return {
    statusCode: 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'error',
      error_code: 'INTERNAL_ERROR',
      message: message || 'Internal server error'
    })
  };
}

function validationError(errors) {
  return {
    statusCode: 400,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'error',
      error_code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: errors
    })
  };
}

module.exports = {
  success: success,
  error: error,
  notFound: notFound,
  serverError: serverError,
  validationError: validationError
};
