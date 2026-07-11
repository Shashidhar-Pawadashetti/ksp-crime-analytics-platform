// ksp-crime-analytics-platform/client/src/services/session.js
//
// App-level session persistence using localStorage.
// Stores only session metadata (employee info, backend session_id) — NOT auth tokens.
// The Catalyst SDK manages auth tokens via httpOnly cookies.
// 1hr TTL matches the Catalyst Cache TTL for sessions.

const SESSION_KEY = 'ksp_session';
const ONE_HOUR_MS = 3600000;

/**
 * Save session metadata to localStorage.
 * @param {{ sessionId: string, employee: object }} params
 */
export function saveSession({ sessionId, employee }) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    sessionId,
    employee,
    savedAt: Date.now()
  }));
}

/**
 * Retrieve session metadata from localStorage.
 * Returns null if no session exists or if the 1hr TTL has expired.
 * Automatically clears expired sessions.
 * @returns {{ sessionId: string, employee: object, savedAt: number } | null}
 */
export function getSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const data = JSON.parse(raw);

    // 1hr TTL validation — matches Catalyst Cache TTL
    if (Date.now() - data.savedAt > ONE_HOUR_MS) {
      clearSession();
      return null;
    }

    return data;
  } catch {
    // Corrupted localStorage entry — clean up
    clearSession();
    return null;
  }
}

/**
 * Remove session metadata from localStorage.
 */
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
