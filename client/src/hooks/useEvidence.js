// ksp-crime-analytics-platform/client/src/hooks/useEvidence.js
//
// Convenience hook that wraps UIContext for evidence/citation panel operations.
// Provides named functions for opening and closing the evidence panel,
// and exposes the current panel state and active citation.
//
// Uses UIContext actions: OPEN_EVIDENCE, CLOSE_EVIDENCE.

import { useCallback } from 'react';
import { useUI } from './useUI';

/**
 * Access evidence panel state and controls.
 * Must be used within a UIProvider boundary.
 * @returns {{ evidencePanelOpen: boolean, activeCitation: object|null, openEvidence: function, closeEvidence: function }}
 */
export function useEvidence() {
  const { evidencePanelOpen, activeCitation, dispatch } = useUI();

  const openEvidence = useCallback((citationPayload) => {
    dispatch({ type: 'OPEN_EVIDENCE', payload: citationPayload });
  }, [dispatch]);

  const closeEvidence = useCallback(() => {
    dispatch({ type: 'CLOSE_EVIDENCE' });
  }, [dispatch]);

  return {
    evidencePanelOpen,
    activeCitation,
    openEvidence,
    closeEvidence
  };
}
