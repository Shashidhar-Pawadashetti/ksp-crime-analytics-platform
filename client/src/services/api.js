// ksp-crime-analytics-platform/client/src/services/api.js
//
// API service for backend Catalyst function calls.
// Uses native fetch() with async/await — no Axios or other HTTP client.
// The frontend calls backend Catalyst functions directly via their function URLs
// with CORS headers handling cross-origin requests (see docs/api-architecture-decision.md).

import { PIPELINE_ENDPOINT, TIMEOUT_MS } from '../utils/constants';

/**
 * Custom error class for API errors from the pipeline backend.
 * Carries the error code and optional fallback answer for display.
 */
export class ApiError extends Error {
  /**
   * @param {string} errorCode - Backend error code (e.g. 'MISSING_QUERY', 'PIPELINE_ERROR')
   * @param {string} message - Human-readable error description
   * @param {string|null} fallbackAnswer - Optional fallback text to show the user instead of raw error
   */
  constructor(errorCode, message, fallbackAnswer) {
    super(message);
    this.name = 'ApiError';
    this.errorCode = errorCode;
    this.fallbackAnswer = fallbackAnswer || null;
  }
}

/**
 * Send a query to the Catalyst pipeline function.
 * Uses native fetch with AbortController support for timeout handling.
 * Structured error handling: HTTP errors and backend error responses both mapped to ApiError.
 *
 * @param {string} query - The user's natural language query
 * @param {string} employeeId - Employee ID from authenticated session
 * @param {string} sessionId - Current session ID
 * @param {AbortSignal} [signal] - Optional AbortSignal for request cancellation (managed by caller)
 * @returns {Promise<object>} The pipeline response data
 * @throws {ApiError} On backend error response or HTTP error
 * @throws {AbortError} On request timeout/abort (name === 'AbortError')
 */
export async function queryPipeline(query, employeeId, sessionId, signal) {
  const response = await fetch(PIPELINE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      employee_id: employeeId,
      session_id: sessionId
    }),
    signal
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ApiError(
      errorBody.error_code || 'HTTP_ERROR',
      errorBody.message || `HTTP ${response.status}`,
      errorBody.fallback_answer || null
    );
  }

  const json = await response.json();

  if (json.status === 'error') {
    throw new ApiError(
      json.error_code || 'SERVER_ERROR',
      json.message || 'Unknown server error',
      json.fallback_answer || null
    );
  }

  return json.data;
}
