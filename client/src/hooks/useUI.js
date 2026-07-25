// ksp-crime-analytics-platform/client/src/hooks/useUI.js
//
// Context consumer hook that wraps UIContext with a null guard.
// Throws if used outside of a UIProvider.

import { useContext } from 'react';
import { UIContext } from '../contexts/UIContext';

/**
 * Access UI state and actions.
 * Must be used within a UIProvider boundary.
 * @returns {{ sidebarOpen: boolean, evidencePanelOpen: boolean, activeCitation: object|null, activeView: string, dispatch: function }}
 */
export function useUI() {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}

/**
 * Convenience hook for evidence panel state and actions.
 * Wraps useUI with evidence-specific helpers.
 * @returns {{ evidencePanelOpen: boolean, activeCitation: object|null, openEvidence: function, closeEvidence: function }}
 */
export function useEvidence() {
  const { evidencePanelOpen, activeCitation, dispatch } = useUI();
  const openEvidence = (citation) => dispatch({ type: 'OPEN_EVIDENCE', payload: citation });
  const closeEvidence = () => dispatch({ type: 'CLOSE_EVIDENCE' });
  return { evidencePanelOpen, activeCitation, openEvidence, closeEvidence };
}
