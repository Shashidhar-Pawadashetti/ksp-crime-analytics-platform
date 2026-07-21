// ksp-crime-analytics-platform/client/src/services/api.js
//
// API service for backend Catalyst function calls.
// Uses native fetch() with async/await — no Axios or other HTTP client.
// The frontend calls backend Catalyst functions directly via their function URLs
// with CORS headers handling cross-origin requests (see docs/api-architecture-decision.md).

import { PIPELINE_ENDPOINT, DASHBOARD_ENDPOINT, GRAPH_API_ENDPOINT, TIMEOUT_MS } from '../utils/constants';

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
 * @param {string} [authToken] - Optional Catalyst auth token for Authorization header
 * @returns {Promise<object>} The pipeline response data
 * @throws {ApiError} On backend error response or HTTP error
 * @throws {AbortError} On request timeout/abort (name === 'AbortError')
 */
export async function queryPipeline(query, employeeId, sessionId, signal, authToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers['Authorization'] = `Zoho-Oauthtoken ${authToken}`;
  }

  const response = await fetch(PIPELINE_ENDPOINT, {
    method: 'POST',
    headers,
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

/**
 * Fetch chart data from the dashboard Catalyst function.
 * POSTs to DASHBOARD_ENDPOINT with the endpoint name and filter parameters.
 *
 * @param {string} endpoint - The dashboard endpoint name (e.g. 'trend', 'breakdown')
 * @param {object} [filters] - Optional filter parameters (district, crimeType, startDate, endDate)
 * @param {AbortSignal} [signal] - Optional AbortSignal for request cancellation
 * @returns {Promise<object[]>} The chart data as an array of flat objects
 * @throws {ApiError} On backend error response or HTTP error
 */
export async function fetchDashboard(endpoint, filters, signal) {
  const response = await fetch(DASHBOARD_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: '/dashboard/' + endpoint,
      filters: filters || {}
    }),
    signal
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ApiError(
      errorBody.error_code || 'HTTP_ERROR',
      errorBody.message || 'HTTP ' + response.status,
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

/**
 * Fetch entity relationship graph data from the graph-service-api function.
 * GETs the graph for a person with Cytoscape.js format.
 *
 * @param {string} personId - The person's identifier for graph traversal
 * @param {number} [hops=2] - Maximum number of hops for graph traversal (default 2)
 * @param {AbortSignal} [signal] - Optional AbortSignal for request cancellation
 * @returns {Promise<object>} The graph data with elements, style, and statistics
 * @throws {ApiError} On backend error response or HTTP error
 */
export async function fetchGraph(personId, hops, signal) {
  const maxHops = hops || 2;
  const response = await fetch(
    GRAPH_API_ENDPOINT + '/person/' + personId + '/graph?format=cytoscape&max_hops=' + maxHops,
    { signal }
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ApiError(
      errorBody.error_code || 'HTTP_ERROR',
      errorBody.message || 'HTTP ' + response.status,
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
