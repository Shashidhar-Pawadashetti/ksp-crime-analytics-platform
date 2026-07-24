import { uiReducer, initialState } from '../contexts/UIContext';

describe('UIContext', () => {
  describe('initialState', () => {
    test('initial state: sidebar open, evidence closed, view chat', () => {
      expect(initialState.sidebarOpen).toBe(true);
      expect(initialState.evidencePanelOpen).toBe(false);
      expect(initialState.activeCitation).toBeNull();
      expect(initialState.activeView).toBe('chat');
    });
  });

  describe('uiReducer', () => {
    test('TOGGLE_SIDEBAR flips sidebarOpen', () => {
      const state = uiReducer(initialState, { type: 'TOGGLE_SIDEBAR' });
      expect(state.sidebarOpen).toBe(false);
      const state2 = uiReducer(state, { type: 'TOGGLE_SIDEBAR' });
      expect(state2.sidebarOpen).toBe(true);
    });

    test('OPEN_EVIDENCE sets evidencePanelOpen and activeCitation', () => {
      const citation = {
        index: 1,
        reference: 'CaseMasterID:123',
        sourceType: 'CaseMaster'
      };
      const state = uiReducer(initialState, {
        type: 'OPEN_EVIDENCE',
        payload: citation
      });
      expect(state.evidencePanelOpen).toBe(true);
      expect(state.activeCitation).toEqual(citation);
    });

    test('OPEN_EVIDENCE with null payload still opens panel', () => {
      const state = uiReducer(initialState, {
        type: 'OPEN_EVIDENCE',
        payload: null
      });
      expect(state.evidencePanelOpen).toBe(true);
      expect(state.activeCitation).toBeNull();
    });

    test('CLOSE_EVIDENCE closes panel and clears citation', () => {
      const openState = uiReducer(initialState, {
        type: 'OPEN_EVIDENCE',
        payload: { index: 1, reference: 'CaseMasterID:123' }
      });
      const state = uiReducer(openState, { type: 'CLOSE_EVIDENCE' });
      expect(state.evidencePanelOpen).toBe(false);
      expect(state.activeCitation).toBeNull();
    });

    test('SET_VIEW changes activeView', () => {
      const state = uiReducer(initialState, {
        type: 'SET_VIEW',
        payload: 'dashboard'
      });
      expect(state.activeView).toBe('dashboard');
    });

    test('SET_VIEW with falsy payload defaults to chat', () => {
      const state = uiReducer(initialState, {
        type: 'SET_VIEW',
        payload: null
      });
      expect(state.activeView).toBe('chat');
    });

    test('unknown action returns state unchanged', () => {
      const state = uiReducer(initialState, { type: 'UNKNOWN' });
      expect(state).toBe(initialState);
    });
  });
});
