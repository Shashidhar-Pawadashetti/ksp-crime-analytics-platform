// ksp-crime-analytics-platform/client/src/utils/constants.js
//
// Application-wide constants for API endpoints, timeouts, and example queries.
// All API URLs reference this file — no hardcoded URLs in components or services.

// In dev: Vite proxy forwards /api → http://localhost:9000 (Catalyst dev server)
// In production: set VITE_API_BASE to function base URL via Catalyst env vars
// Future: when API Gateway is enabled, VITE_API_BASE can be removed (same-origin /api works)
export const API_BASE = import.meta.env.VITE_API_BASE || '/api';

// Pipeline endpoint — the primary backend chat endpoint
export const PIPELINE_ENDPOINT = `${API_BASE}/server/pipeline/query`;

// Request timeout: 35s > 30s Catalyst hard timeout, allowing buffer for GLM response
export const TIMEOUT_MS = 35000;

// Welcome example queries shown to unauthenticated users
export const EXAMPLE_QUERIES = [
  'How many FIRs were registered last month?',
  'Show me cases involving accused John Doe',
  'What happened in case FIR-2024-001?',
  'List all cases with pending investigation status'
];
