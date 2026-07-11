// ksp-crime-analytics-platform/client/src/hooks/useAuth.js
//
// Context consumer hook that wraps AuthContext with a null guard.
// Throws if used outside of an AuthProvider.

import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

/**
 * Access authentication state and actions.
 * Must be used within an AuthProvider boundary.
 * @returns {{ isAuthenticated: boolean, isLoading: boolean, employee: object|null, sessionToken: string|null, sessionId: string|null, error: string|null, dispatch: function, login: function, logout: function }}
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
