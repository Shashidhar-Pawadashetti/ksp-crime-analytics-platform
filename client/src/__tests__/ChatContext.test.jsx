import { chatReducer, initialState } from '../contexts/ChatContext';

describe('ChatContext', () => {
  describe('initialState', () => {
    test('initial state: empty messages, not loading, no error', () => {
      expect(initialState.messages).toEqual([]);
      expect(initialState.isLoading).toBe(false);
      expect(initialState.error).toBeNull();
    });
  });

  describe('chatReducer', () => {
    test('ADD_USER_MESSAGE adds message with role user', () => {
      const state = chatReducer(initialState, {
        type: 'ADD_USER_MESSAGE',
        payload: { content: 'How many FIRs?' }
      });
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].role).toBe('user');
      expect(state.messages[0].content).toBe('How many FIRs?');
      expect(state.messages[0].id).toBeDefined();
      expect(state.messages[0].timestamp).toBeDefined();
    });

    test('SET_LOADING sets isLoading true and clears error', () => {
      const state = chatReducer(
        { ...initialState, error: 'previous error' },
        { type: 'SET_LOADING' }
      );
      expect(state.isLoading).toBe(true);
      expect(state.error).toBeNull();
    });

    test('SET_LOADING with payload false sets isLoading=false', () => {
      const state = chatReducer(
        { ...initialState, isLoading: true },
        { type: 'SET_LOADING', payload: false }
      );
      expect(state.isLoading).toBe(false);
    });

    test('ADD_ASSISTANT_RESPONSE appends assistant message with full payload', () => {
      const payload = {
        answer: 'There were 150 FIRs last month.',
        intent: 'structured',
        data: [{ count: 150, month: 'June' }],
        source_refs: ['CaseMasterID:123'],
        confidence: 0.92,
        risk_score: null,
        trends: null
      };
      const state = chatReducer(
        { ...initialState, isLoading: true },
        { type: 'ADD_ASSISTANT_RESPONSE', payload }
      );
      expect(state.isLoading).toBe(false);
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].role).toBe('assistant');
      expect(state.messages[0].content).toBe(payload.answer);
      expect(state.messages[0].intent).toBe('structured');
      expect(state.messages[0].source_refs).toEqual(['CaseMasterID:123']);
      expect(state.messages[0].confidence).toBe(0.92);
      expect(state.messages[0].isLoading).toBe(false);
      expect(state.messages[0].isError).toBe(false);
    });

    test('SET_ERROR sets error object and creates error message in messages', () => {
      const state = chatReducer(
        { ...initialState, isLoading: true },
        {
          type: 'SET_ERROR',
          payload: {
            message: 'Server error',
            errorCode: 'PIPELINE_ERROR',
            fallback: 'Please try again.',
            query: 'FIRs?'
          }
        }
      );
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeDefined();
      expect(state.error.message).toBe('Server error');
      expect(state.error.fallback).toBe('Please try again.');
      expect(state.error.query).toBe('FIRs?');
      // Should also create an error message in the messages array
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].role).toBe('assistant');
      expect(state.messages[0].isError).toBe(true);
      expect(state.messages[0].fallback).toBe(true);
    });

    test('SET_ERROR without fallback uses default message', () => {
      const state = chatReducer(initialState, {
        type: 'SET_ERROR',
        payload: { message: 'Something broke' }
      });
      expect(state.error.message).toBe('Something broke');
      expect(state.error.fallback).toBeNull();
      expect(state.error.query).toBeNull();
    });

    test('CLEAR_ERROR removes error without affecting messages', () => {
      const stateWithError = chatReducer(initialState, {
        type: 'SET_ERROR',
        payload: { message: 'err' }
      });
      const state = chatReducer(stateWithError, { type: 'CLEAR_ERROR' });
      expect(state.error).toBeNull();
      expect(state.messages).toHaveLength(1); // error message remains
    });

    test('unknown action returns state unchanged', () => {
      const state = chatReducer(initialState, { type: 'UNKNOWN' });
      expect(state).toBe(initialState);
    });
  });

  describe('multi-session reducer actions', () => {
    test('initialState includes sessions array and sessionsLoading false', () => {
      expect(Array.isArray(initialState.sessions)).toBe(true);
      expect(initialState.sessions).toEqual([]);
      expect(initialState.sessionsLoading).toBe(false);
    });

    test('SET_SESSIONS populates sessions list and clears loading', () => {
      const mockSessions = [
        { session_id: 's1', title: 'Query 1', created_at: '2026-07-25T10:00:00Z', last_activity: '2026-07-25T10:30:00Z', message_count: 3 },
        { session_id: 's2', title: 'Query 2', created_at: '2026-07-25T11:00:00Z', last_activity: '2026-07-25T11:30:00Z', message_count: 1 }
      ];
      const state = chatReducer(
        { ...initialState, sessionsLoading: true },
        { type: 'SET_SESSIONS', payload: mockSessions }
      );
      expect(state.sessions).toHaveLength(2);
      expect(state.sessions).toEqual(mockSessions);
      expect(state.sessionsLoading).toBe(false);
    });

    test('SET_SESSIONS with null payload defaults to empty array', () => {
      const state = chatReducer(initialState, { type: 'SET_SESSIONS', payload: null });
      expect(state.sessions).toEqual([]);
    });

    test('SET_SESSIONS_LOADING sets loading to true', () => {
      const state = chatReducer(initialState, { type: 'SET_SESSIONS_LOADING' });
      expect(state.sessionsLoading).toBe(true);
    });

    test('SET_SESSIONS_LOADING with payload false sets loading to false', () => {
      const state = chatReducer(
        { ...initialState, sessionsLoading: true },
        { type: 'SET_SESSIONS_LOADING', payload: false }
      );
      expect(state.sessionsLoading).toBe(false);
    });

    test('CREATE_NEW_SESSION clears messages and sessionId, preserves sessions list', () => {
      const beforeState = {
        ...initialState,
        messages: [{ id: 'm1', role: 'user', content: 'Hello' }],
        sessionId: 'sess_old',
        sessions: [{ session_id: 'sess_old', title: 'Hello' }]
      };
      const state = chatReducer(beforeState, { type: 'CREATE_NEW_SESSION' });
      expect(state.messages).toEqual([]);
      expect(state.sessionId).toBeNull();
      expect(state.sessions).toHaveLength(1);
      expect(state.error).toBeNull();
    });

    test('SWITCH_SESSION populates messages and sets sessionId', () => {
      const payload = {
        messages: [{ id: 'm1', role: 'user', content: 'Loaded query' }],
        sessionId: 'sess_loaded'
      };
      const state = chatReducer(initialState, { type: 'SWITCH_SESSION', payload });
      expect(state.messages).toEqual(payload.messages);
      expect(state.sessionId).toBe('sess_loaded');
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    test('SWITCH_SESSION handles empty messages array', () => {
      const payload = { messages: [], sessionId: 'sess_empty' };
      const state = chatReducer(initialState, { type: 'SWITCH_SESSION', payload });
      expect(state.messages).toEqual([]);
      expect(state.sessionId).toBe('sess_empty');
    });

    test('SWITCH_SESSION defaults messages to empty array if payload missing', () => {
      const state = chatReducer(initialState, { type: 'SWITCH_SESSION', payload: { sessionId: 'sess_x' } });
      expect(state.messages).toEqual([]);
      expect(state.sessionId).toBe('sess_x');
    });
  });
});
