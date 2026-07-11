// ksp-crime-analytics-platform/client/src/contexts/UIContext.js
//
// UI state management using React Context + useReducer.
// Manages sidebar state, evidence panel, active citation, and active view.
//
// Exports both the provider and the reducer for standalone testing (used in Plan 01-05).

import { createContext, useReducer } from 'react';

/** @type {import('react').Context<*>} */
export const UIContext = createContext(null);

/** @type {{ sidebarOpen: boolean, evidencePanelOpen: boolean, activeCitation: object|null, activeView: string }} */
export const initialState = {
  sidebarOpen: true,
  evidencePanelOpen: false,
  activeCitation: null,      // source_ref payload being viewed in evidence panel
  activeView: 'chat'         // 'chat' | 'dashboard' | 'graph' (Phase 2+)
};

/**
 * UI reducer.
 * @param {typeof initialState} state
 * @param {{ type: string, payload?: any }} action
 * @returns {typeof initialState}
 */
export function uiReducer(state, action) {
  switch (action.type) {
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarOpen: !state.sidebarOpen };

    case 'OPEN_EVIDENCE':
      return {
        ...state,
        evidencePanelOpen: true,
        activeCitation: action.payload || null
      };

    case 'CLOSE_EVIDENCE':
      return {
        ...state,
        evidencePanelOpen: false,
        activeCitation: null
      };

    case 'SET_VIEW':
      return { ...state, activeView: action.payload || 'chat' };

    default:
      return state;
  }
}

/**
 * UI provider.
 * Provides UI state and dispatch for sidebar, evidence panel, and active view.
 *
 * @param {{ children: import('react').ReactNode }} props
 * @returns {import('react').ReactElement}
 */
export function UIProvider({ children }) {
  const [state, dispatch] = useReducer(uiReducer, initialState);

  const value = { ...state, dispatch };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}
