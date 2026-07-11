// ksp-crime-analytics-platform/client/src/hooks/useChat.js
//
// Context consumer hook that wraps ChatContext with a null guard.
// Throws if used outside of a ChatProvider.

import { useContext } from 'react';
import { ChatContext } from '../contexts/ChatContext';

/**
 * Access chat state and actions.
 * Must be used within a ChatProvider boundary.
 * @returns {{ messages: Array, isLoading: boolean, error: string|null, dispatch: function, sendMessage: function }}
 */
export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
