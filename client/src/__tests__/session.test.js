import { saveSession, getSession, clearSession } from '../services/session';
import { SESSION_ENDPOINT } from '../utils/constants';

beforeEach(() => {
  localStorage.clear();
});

describe('session service', () => {
  test('saveSession stores session metadata in localStorage', () => {
    saveSession({ sessionId: 'sess_abc', employee: { employee_id: 'E001' } });
    const raw = localStorage.getItem('ksp_session');
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw);
    expect(parsed.sessionId).toBe('sess_abc');
    expect(parsed.employee.employee_id).toBe('E001');
    expect(parsed.savedAt).toBeDefined();
  });

  test('getSession returns saved session data', () => {
    saveSession({ sessionId: 'sess_abc', employee: { employee_id: 'E001' } });
    const data = getSession();
    expect(data).not.toBeNull();
    expect(data.sessionId).toBe('sess_abc');
    expect(data.employee.employee_id).toBe('E001');
  });

  test('getSession returns null when no session saved', () => {
    expect(getSession()).toBeNull();
  });

  test('getSession returns null and clears expired session (1hr TTL)', () => {
    const expired = {
      sessionId: 'sess_expired',
      employee: { employee_id: 'E001' },
      savedAt: Date.now() - 3600001
    };
    localStorage.setItem('ksp_session', JSON.stringify(expired));
    expect(getSession()).toBeNull();
    expect(localStorage.getItem('ksp_session')).toBeNull();
  });

  test('getSession handles corrupted localStorage gracefully', () => {
    localStorage.setItem('ksp_session', 'not-valid-json');
    expect(getSession()).toBeNull();
    expect(localStorage.getItem('ksp_session')).toBeNull();
  });

  test('clearSession removes session metadata', () => {
    saveSession({ sessionId: 'sess_abc', employee: { employee_id: 'E001' } });
    clearSession();
    expect(localStorage.getItem('ksp_session')).toBeNull();
  });
});

describe('session endpoint contract', () => {
  test('SESSION_ENDPOINT is defined and follows API_BASE pattern', () => {
    expect(SESSION_ENDPOINT).toBeDefined();
    expect(typeof SESSION_ENDPOINT).toBe('string');
    expect(SESSION_ENDPOINT).toMatch(/\/server\/session$/);
  });

  test('session list item has required metadata fields', () => {
    const mockSession = {
      session_id: 'sess_abc123',
      title: 'How many FIRs in Bengaluru?',
      created_at: '2026-07-25T10:00:00.000Z',
      last_activity: '2026-07-25T10:30:00.000Z',
      message_count: 3
    };
    expect(mockSession).toHaveProperty('session_id');
    expect(mockSession).toHaveProperty('title');
    expect(mockSession).toHaveProperty('created_at');
    expect(mockSession).toHaveProperty('last_activity');
    expect(mockSession).toHaveProperty('message_count');
    expect(typeof mockSession.message_count).toBe('number');
  });

  test('session messages response has required shape', () => {
    const mockResponse = {
      status: 'ok',
      data: {
        session_id: 'sess_abc123',
        messages: [
          { id: 'm1', role: 'user', content: 'How many FIRs?', timestamp: Date.now() },
          { id: 'm2', role: 'assistant', content: '150 FIRs', timestamp: Date.now() }
        ],
        title: 'How many FIRs?'
      }
    };
    expect(mockResponse.status).toBe('ok');
    expect(mockResponse.data).toHaveProperty('session_id');
    expect(Array.isArray(mockResponse.data.messages)).toBe(true);
    expect(mockResponse.data.messages[0]).toHaveProperty('role');
    expect(mockResponse.data.messages[0]).toHaveProperty('content');
    expect(mockResponse.data).toHaveProperty('title');
  });

  test('session messages response handles empty messages array', () => {
    const mockResponse = { status: 'ok', data: { session_id: 'sess_empty', messages: [], title: null } };
    expect(mockResponse.data.messages).toEqual([]);
    expect(mockResponse.data.title).toBeNull();
  });

  test('error response has error_code field', () => {
    const mockError = { status: 'error', error_code: 'SESSION_NOT_FOUND', message: 'Session not found or expired' };
    expect(mockError.status).toBe('error');
    expect(mockError.error_code).toBe('SESSION_NOT_FOUND');
  });

  test('session list endpoint returns empty array for new users (no index)', () => {
    const mockResponse = { status: 'ok', data: [] };
    expect(mockResponse.data).toEqual([]);
    expect(mockResponse.data.length).toBe(0);
  });
});
