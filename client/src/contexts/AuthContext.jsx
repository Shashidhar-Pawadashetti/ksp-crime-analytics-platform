import { createContext, useReducer, useEffect, useCallback, useRef } from 'react';
import * as auth from '../services/auth';
import * as session from '../services/session';

const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true';

export const AuthContext = createContext(null);

export const initialState = {
  isAuthenticated: false,
  isLoading: true,
  employee: null,
  sessionToken: null,
  sessionId: null,
  error: null
};

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
        sessionToken: action.payload.sessionToken,
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

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const signInRendered = useRef(false);

  // Step 1: On mount — check for existing Catalyst session (skipped if VITE_SKIP_AUTH=true)
  useEffect(() => {
    if (SKIP_AUTH) return;

    let cancelled = false;

    async function initAuth() {
      try {
        await auth.isUserAuthenticated();

        const user = auth.getUserDetails();
        const token = await auth.getAuthToken();
        const saved = session.getSession();

        if (saved && saved.employee) {
          if (!cancelled) {
            dispatch({
              type: 'SESSION_RESTORED',
              payload: { employee: saved.employee, sessionToken: token, sessionId: saved.sessionId }
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
      } catch {
        if (!cancelled) dispatch({ type: 'SET_AUTH_READY' });
      }
    }

    initAuth();
    return () => { cancelled = true; };
  }, []);

  // Step 2: After confirming no session — render signIn iFrame and poll for completion
  useEffect(() => {
    if (SKIP_AUTH) return;
    if (state.isLoading || state.isAuthenticated) return;
    if (signInRendered.current) return;

    auth.initEmbeddedAuth();
    signInRendered.current = true;

    let active = true;

    async function checkAuth() {
      if (!active) return;
      try {
        await auth.isUserAuthenticated();
        if (!active) return;
        clearInterval(interval);

        const user = auth.getUserDetails();
        const token = await auth.getAuthToken();
        if (!active) return;

        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: {
            employee: { employee_id: user.email || user.id },
            sessionToken: token,
            sessionId: null
          }
        });
      } catch {
        // Not yet authenticated
      }
    }

    const interval = setInterval(checkAuth, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [state.isLoading, state.isAuthenticated]);

  const login = useCallback(() => {
    auth.showEmbeddedAuth();
  }, []);

  const logout = useCallback(() => {
    auth.signOut();
    session.clearSession();
    window.location.reload();
  }, []);

  const value = { ...state, dispatch, login, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
