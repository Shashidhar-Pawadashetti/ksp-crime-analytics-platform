// ksp-crime-analytics-platform/client/src/services/auth.js
//
// Catalyst Embedded Authentication service.
// The Catalyst Web SDK (catalystWebSDK.js v4.6.1) is loaded via CDN in index.html.
// The global `catalyst` object is available after /__catalyst/sdk/init.js loads.
// These functions assume the SDK is already loaded — they do not inject scripts.

/**
 * Check if the user currently has an active Catalyst session.
 * Returns a promise that resolves with user info if authenticated,
 * or rejects if no session exists.
 * @returns {Promise<object>}
 */
export function isUserAuthenticated() {
  return catalyst.auth.isUserAuthenticated();
}

/**
 * Initialise the Catalyst Embedded Authentication iFrame inside the given container.
 * Call this once after confirming no session exists. The iFrame renders the login form.
 * @param {string} [containerId='catalyst-auth-container'] - DOM element ID to render the auth form into
 * @param {object} [config={}] - Optional config (css_url, service_url, etc.)
 */
export function initEmbeddedAuth(containerId = 'catalyst-auth-container', config = {}) {
  catalyst.auth.signIn(containerId, config);
}

/**
 * Hide the embedded auth container from view.
 */
export function hideEmbeddedAuth() {
  const container = document.getElementById('catalyst-auth-container');
  if (container) container.style.display = 'none';
}

/**
 * Show the embedded auth container (make it visible).
 */
export function showEmbeddedAuth() {
  const container = document.getElementById('catalyst-auth-container');
  if (container) container.style.display = 'block';
}

/**
 * Generate a bearer auth token for Slate-to-Function API calls.
 * Required by Catalyst cross-service authentication.
 * @returns {Promise<string|null>} The access token, or null on failure.
 */
export async function getAuthToken() {
  try {
    const response = await catalyst.auth.generateAuthToken();
    return response.access_token;
  } catch (err) {
    console.error('Failed to generate auth token:', err);
    return null;
  }
}

/**
 * Get the currently authenticated user's details from the Catalyst SDK session.
 * Returns null if no session exists.
 * @returns {object|null}
 */
export function getUserDetails() {
  try {
    return catalyst.auth.getUserDetails();
  } catch {
    return null;
  }
}

/**
 * Sign the current user out of the Catalyst Embedded Authentication session.
 */
export async function signOut() {
  try {
    await catalyst.auth.signOut();
  } catch (err) {
    console.error('Sign out failed:', err);
  }
}
