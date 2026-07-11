import { authReducer, initialState } from '../contexts/AuthContext';

describe('AuthContext', () => {
  describe('initialState', () => {
    test('initial state: isLoading=true, isAuthenticated=false, employee=null', () => {
      expect(initialState.isLoading).toBe(true);
      expect(initialState.isAuthenticated).toBe(false);
      expect(initialState.employee).toBeNull();
      expect(initialState.sessionToken).toBeNull();
      expect(initialState.sessionId).toBeNull();
      expect(initialState.error).toBeNull();
    });
  });

  describe('authReducer', () => {
    test('LOGIN_START sets isLoading and clears error', () => {
      const state = authReducer(
        { ...initialState, isLoading: false },
        { type: 'LOGIN_START' }
      );
      expect(state.isLoading).toBe(true);
      expect(state.error).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    test('LOGIN_SUCCESS sets employee, session and clears loading', () => {
      const payload = {
        employee: { employee_id: 'E001', name: 'Test Officer' },
        sessionToken: 'tok_123',
        sessionId: 'sess_abc'
      };
      const state = authReducer(initialState, {
        type: 'LOGIN_SUCCESS',
        payload
      });
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.employee).toEqual(payload.employee);
      expect(state.sessionToken).toBe('tok_123');
      expect(state.sessionId).toBe('sess_abc');
      expect(state.error).toBeNull();
    });

    test('LOGOUT clears all auth state with isLoading=false', () => {
      const loggedInState = {
        ...initialState,
        isAuthenticated: true,
        isLoading: false,
        employee: { employee_id: 'E001' },
        sessionToken: 'tok_123',
        sessionId: 'sess_abc'
      };
      const state = authReducer(loggedInState, { type: 'LOGOUT' });
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.employee).toBeNull();
      expect(state.sessionToken).toBeNull();
      expect(state.sessionId).toBeNull();
      expect(state.error).toBeNull();
    });

    test('SESSION_RESTORED restores from saved data', () => {
      const payload = {
        employee: { employee_id: 'E001', name: 'Restored Officer' },
        sessionId: 'sess_restored'
      };
      const state = authReducer(initialState, {
        type: 'SESSION_RESTORED',
        payload
      });
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.employee).toEqual(payload.employee);
      expect(state.sessionId).toBe('sess_restored');
      // sessionToken should not be set by SESSION_RESTORED
      expect(state.sessionToken).toBeNull();
      expect(state.error).toBeNull();
    });

    test('SESSION_ERROR sets error message and clears loading', () => {
      const state = authReducer(
        { ...initialState, isLoading: true },
        { type: 'SESSION_ERROR', payload: 'Failed to authenticate' }
      );
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Failed to authenticate');
      expect(state.isAuthenticated).toBe(false);
    });

    test('SET_AUTH_READY sets isLoading=false without authenticating', () => {
      const state = authReducer(initialState, { type: 'SET_AUTH_READY' });
      expect(state.isLoading).toBe(false);
      expect(state.isAuthenticated).toBe(false);
      expect(state.employee).toBeNull();
    });

    test('unknown action returns state unchanged', () => {
      const state = authReducer(initialState, { type: 'UNKNOWN' });
      expect(state).toBe(initialState);
    });
  });
});
