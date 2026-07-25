// ksp-crime-analytics-platform/client/src/contexts/ChatContext.js
//
// Chat state management using React Context + useReducer.
// Manages message history, loading state, and error state for the chat interface.
// Employee ID and session ID are passed to sendMessage from the consuming component
// (not imported from AuthContext here) to keep the chat context decoupled.
//
// Exports both the provider and the reducer for standalone testing (used in Plan 01-05).

import { createContext, useReducer, useCallback, useEffect } from 'react';
import { queryPipeline } from '../services/api';

const MESSAGES_KEY = 'ksp_chat_messages';

/** @type {import('react').Context<*>} */
export const ChatContext = createContext(null);

/** @type {{ messages: Array, isLoading: boolean, error: string|null, sessionId: string|null }} */
export const initialState = {
  messages: [],     // { id, role, content, intent, data, source_refs, citations, trends, risk_score, confidence, severity, factors, fallback, timestamp, isLoading, isError }
  isLoading: false,
  error: null,
  sessionId: null
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
      const { answer, intent, data, source_refs, citations, trends, risk_score, confidence, severity, factors, fallback, session_id } = action.payload;
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
        sessionId: session_id || state.sessionId,
        isLoading: false,
        error: null
      };
    }

    case 'UPDATE_SESSION_ID':
      return { ...state, sessionId: action.payload };

    case 'SET_ERROR': {
      const errorPayload = action.payload || {};
      const errorMsg = errorPayload.message || errorPayload || 'An error occurred';
      const fallbackAnswer = errorPayload.fallback || errorPayload.fallbackAnswer || null;
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
        error: {
          message: errorMsg,
          fallback: fallbackAnswer,
          query: errorPayload.query || null
        }
      };
    }

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    case 'RESTORE_MESSAGES':
      return { ...state, messages: action.payload || [] };

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

  // Restore messages from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(MESSAGES_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved)) {
          dispatch({ type: 'RESTORE_MESSAGES', payload: saved });
        }
      }
    } catch {
      // Corrupted data - ignore
    }
  }, []);

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    if (state.messages.length > 0) {
      try {
        localStorage.setItem(MESSAGES_KEY, JSON.stringify(state.messages));
      } catch {
        // Storage full or unavailable - ignore
      }
    }
  }, [state.messages]);

  /**
   * Send a user message and get an assistant response.
   * Dispatches ADD_USER_MESSAGE → calls queryPipeline with AbortController timeout (35s)
   * → dispatches ADD_ASSISTANT_RESPONSE on success or SET_ERROR on failure.
   *
   * The AbortController is created fresh per request (no shared controller).
   * Timeout (35000ms) exceeds the Catalyst hard timeout (30000ms) so the user
   * gets a client-side error before the server timeout.
   *
   * @param {string} query - The user's natural language query
   * @param {string} employeeId - Employee ID from AuthContext
   * @param {string} sessionId - Current session ID
   * @returns {Promise<void>}
   */
  const sendMessage = useCallback(async (query, employeeId, sessionId, authToken) => {
    if (!query || !query.trim()) return;

    dispatch({ type: 'ADD_USER_MESSAGE', payload: { content: query } });
    dispatch({ type: 'SET_LOADING' });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    try {
      const sid = sessionId || state.sessionId;
      const data = await queryPipeline(query, employeeId, sid, controller.signal, authToken);
      clearTimeout(timeoutId);
      dispatch({ type: 'ADD_ASSISTANT_RESPONSE', payload: data });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        dispatch({
          type: 'SET_ERROR',
          payload: {
            message: 'Request timed out after 35 seconds',
            fallback: 'The system is taking longer than expected. Please try again.',
            query
          }
        });
      } else {
        const fallback = err.fallbackAnswer || 'I was unable to process your request. Please try again.';
        dispatch({
          type: 'SET_ERROR',
          payload: { message: err.message, fallback, query }
        });
      }
    }
  }, []);

  const value = { ...state, dispatch, sendMessage };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
