import { saveSession, getSession, clearSession } from '../services/session';

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
