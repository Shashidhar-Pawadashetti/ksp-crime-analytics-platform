// ksp-crime-analytics-platform/client/src/contexts/ChatContext.js
//
// Chat state management using React Context + useReducer.
// Manages message history, loading state, and error state for the chat interface.
// Employee ID and session ID are passed to sendMessage from the consuming component
// (not imported from AuthContext here) to keep the chat context decoupled.
//
// Exports both the provider and the reducer for standalone testing (used in Plan 01-05).

import { createContext, useReducer, useCallback } from 'react';

/** @type {import('react').Context<*>} */
export const ChatContext = createContext(null);

/** @type {{ messages: Array, isLoading: boolean, error: string|null }} */
export const initialState = {
  messages: [],     // { id, role, content, intent, data, source_refs, citations, trends, risk_score, confidence, severity, factors, fallback, timestamp, isLoading, isError }
  isLoading: false,
  error: null
};

let messageIdCounter = 0;

/**
 * Generate a sequential message ID.
 * @returns {string}
 */
function nextMessageId() {
  messageIdCounter += 1;
  return `msg-${Date.now()}-${messageIdCounter}`;
}

/**
 * Chat reducer.
 * @param {typeof initialState} state
 * @param {{ type: string, payload?: any }} action
 * @returns {typeof initialState}
 */
export function chatReducer(state, action) {
  switch (action.type) {
    case 'ADD_USER_MESSAGE': {
      const newMessage = {
        id: nextMessageId(),
        role: 'user',
        content: action.payload.content,
        timestamp: new Date().toISOString()
      };
      return {
        ...state,
        messages: [...state.messages, newMessage],
        error: null
      };
    }

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload ?? true, error: null };

    case 'ADD_ASSISTANT_RESPONSE': {
      const { answer, intent, data, source_refs, citations, trends, risk_score, confidence, severity, factors, fallback } = action.payload;
      const newMessage = {
        id: nextMessageId(),
        role: 'assistant',
        content: answer || '',
        intent: intent || null,
        data: data || null,
        source_refs: source_refs || [],
        citations: citations || [],
        trends: trends || null,
        risk_score: risk_score ?? null,
        confidence: confidence ?? null,
        severity: severity || null,
        factors: factors || null,
        fallback: fallback || null,
        timestamp: new Date().toISOString(),
        isLoading: false,
        isError: false
      };
      return {
        ...state,
        messages: [...state.messages, newMessage],
        isLoading: false,
        error: null
      };
    }

    case 'SET_ERROR': {
      const errorMsg = action.payload?.message || action.payload || 'An error occurred';
      const fallbackAnswer = action.payload?.fallbackAnswer || null;
      const newMessage = {
        id: nextMessageId(),
        role: 'assistant',
        content: fallbackAnswer || errorMsg,
        intent: null,
        data: null,
        source_refs: [],
        citations: [],
        trends: null,
        risk_score: null,
        confidence: null,
        severity: null,
        factors: null,
        fallback: true,
        timestamp: new Date().toISOString(),
        isLoading: false,
        isError: true
      };
      return {
        ...state,
        messages: [...state.messages, newMessage],
        isLoading: false,
        error: errorMsg
      };
    }

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    default:
      return state;
  }
}

/**
 * Chat provider.
 * Provides message state, sendMessage stub, and dispatch.
 * sendMessage will be fully implemented in Plan 01-03 Task 1.
 *
 * @param {{ children: import('react').ReactNode }} props
 * @returns {import('react').ReactElement}
 */
export function ChatProvider({ children }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);

  /**
   * Send a user message and get an assistant response.
   * Stub — full implementation in Plan 01-03.
   * @param {string} query - The user's natural language query
   * @param {string} employeeId - Employee ID from AuthContext
   * @param {string} sessionId - Current session ID
   * @param {AbortSignal} [signal] - Optional abort signal for cancellation
   * @returns {Promise<void>}
   */
  const sendMessage = useCallback(async (query, employeeId, sessionId, signal) => {
    throw new Error('sendMessage not yet implemented — see Plan 01-03');
  }, []);

  const value = { ...state, dispatch, sendMessage };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
