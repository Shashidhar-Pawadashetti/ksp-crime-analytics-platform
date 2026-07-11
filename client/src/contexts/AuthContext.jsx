// ksp-crime-analytics-platform/client/src/contexts/AuthContext.js
//
// Authentication state management using React Context + useReducer.
// The AuthProvider checks the Catalyst SDK on mount for an existing session,
// restores app-level metadata from localStorage, and provides login/logout
// callbacks via the embedded auth iFrame.
//
// Exports both the provider and the reducer for standalone testing (used in Plan 01-05).

import { createContext, useReducer, useEffect, useCallback } from 'react';
import * as auth from '../services/auth';
import * as session from '../services/session';

/** @type {import('react').Context<*>} */
export const AuthContext = createContext(null);

/** @type {{ isAuthenticated: boolean, isLoading: boolean, employee: object|null, sessionToken: string|null, sessionId: string|null, error: string|null }} */
export const initialState = {
  isAuthenticated: false,
  isLoading: true,
  employee: null,
  sessionToken: null,
  sessionId: null,
  error: null
};

/**
 * Authentication reducer.
 * @param {typeof initialState} state
 * @param {{ type: string, payload?: any }} action
 * @returns {typeof initialState}
 */
export function authReducer(state, action) {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, isLoading: true, error: null };

    case 'LOGIN_SUCCESS':
      return {
        ...state,
        isAuthenticated: true,
        isLoading: false,
        employee: action.payload.employee,
        sessionToken: action.payload.sessionToken,
        sessionId: action.payload.sessionId,
        error: null
      };

    case 'LOGOUT':
      return { ...initialState, isLoading: false };

    case 'SESSION_RESTORED':
      return {
        ...state,
        isAuthenticated: true,
        isLoading: false,
        employee: action.payload.employee,
        sessionId: action.payload.sessionId,
        error: null
      };

    case 'SESSION_ERROR':
      return { ...state, isLoading: false, error: action.payload };

    case 'SET_AUTH_READY':
      return { ...state, isLoading: false };

    default:
      return state;
  }
}

/**
 * Authentication provider.
 * On mount: checks for an existing Catalyst SDK session via auth.getCurrentUser().
 * If the SDK has a session, restores app-level metadata from localStorage
 * and generates an API auth token. Otherwise sets isLoading=false.
 *
 * @param {{ children: import('react').ReactNode }} props
 * @returns {import('react').ReactElement}
 */
export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // ---- initialisation on mount ----
  useEffect(() => {
    let cancelled = false;

    async function initAuth() {
      try {
        const user = auth.getCurrentUser();
        if (!user) {
          if (!cancelled) dispatch({ type: 'SET_AUTH_READY' });
          return;
        }

        const token = await auth.getAuthToken();
        const saved = session.getSession();

        if (saved && saved.employee) {
          if (!cancelled) {
            dispatch({
              type: 'SESSION_RESTORED',
              payload: { employee: saved.employee, sessionId: saved.sessionId }
            });
          }
        } else {
          if (!cancelled) {
            dispatch({
              type: 'LOGIN_SUCCESS',
              payload: {
                employee: { employee_id: user.email || user.id },
                sessionToken: token,
                sessionId: null
              }
            });
          }
        }
      } catch (err) {
        if (!cancelled) {
          dispatch({ type: 'SESSION_ERROR', payload: err.message });
        }
      }
    }

    initAuth();

    return () => { cancelled = true; };
  }, []);

  // ---- callbacks ----
  const login = useCallback(() => {
    auth.showEmbeddedAuth();
    auth.initEmbeddedAuth();
    dispatch({ type: 'LOGIN_START' });
  }, []);

  const logout = useCallback(() => {
    auth.signOut();
    session.clearSession();
    dispatch({ type: 'LOGOUT' });
  }, []);

  const value = { ...state, dispatch, login, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
