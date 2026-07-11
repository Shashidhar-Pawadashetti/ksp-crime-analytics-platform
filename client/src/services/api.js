// ksp-crime-analytics-platform/client/src/services/api.js
//
// API service stub for backend function calls.
// Full implementation will be added in Plan 01-03 Task 1.
//
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
 * Stub — full implementation in Plan 01-03.
 *
 * @param {string} query - The user's natural language query
 * @param {string} employeeId - Employee ID from authenticated session
 * @param {string} sessionId - Current session ID
 * @param {AbortSignal} [signal] - Optional AbortSignal for request cancellation
 * @returns {Promise<object>} The pipeline response data
 * @throws {ApiError} On backend error response
 * @throws {Error} On network failure
 */
export async function queryPipeline(query, employeeId, sessionId, signal) {
  throw new Error('API service not yet wired — see Plan 01-03');
}
