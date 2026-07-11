// ksp-crime-analytics-platform/client/src/components/Chat/ChatArea.jsx
//
// Scroll-managed chat container with message list, auto-scroll anchor,
// "New messages" floating button, loading skeleton, inline error with retry,
// and ChatInput pinned to bottom.
//
// Bridges AuthContext (employee_id, sessionId) and ChatContext (sendMessage).

import { useEffect, useRef, useState, useCallback } from 'react';
import { useChat } from '../../hooks/useChat';
import { useAuth } from '../../hooks/useAuth';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';

/**
 * Chat area — the primary content view when authenticated (Phase 1).
 * Manages scroll position, auto-scroll behavior, and user input submission.
 */
function ChatArea() {
  const { messages, isLoading, error, sendMessage, dispatch } = useChat();
  const { employee, sessionId, isAuthenticated } = useAuth();
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);
  const [isNearBottom, setIsNearBottom] = useState(true);

  // Scroll anchor detection: is user within 100px of bottom?
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 100;
    setIsNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold);
  }, []);

  // Auto-scroll to bottom when new messages arrive (only if near bottom)
  useEffect(() => {
    if (isNearBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isNearBottom]);

  // Auto-scroll on loading state change (new message being fetched)
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isLoading]);

  // Bridge: extract employee_id and sessionId from AuthContext, pass to sendMessage
  const handleSend = useCallback((query) => {
    if (employee?.employee_id && sessionId) {
      sendMessage(query, employee.employee_id, sessionId);
    }
  }, [employee, sessionId, sendMessage]);

  return (
    <div className="flex h-full flex-col">
      {/* Message list */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {/* Empty state */}
        {messages.length === 0 && !isLoading && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <h2 className="font-heading text-[28px] font-semibold text-foreground">
              Ask a question about KSP crime data
            </h2>
            <p className="mt-2 font-body text-base text-foreground/70">
              Type your query below to search the KSP crime database.
            </p>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Loading indicator — animated pulse dots + skeleton bars */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-xl border border-border bg-surface p-3">
              <div className="mb-2 flex items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                <div className="h-2 w-2 animate-pulse rounded-full bg-accent" style={{ animationDelay: '0.2s' }} />
                <div className="h-2 w-2 animate-pulse rounded-full bg-accent" style={{ animationDelay: '0.4s' }} />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-3/4 animate-pulse rounded bg-foreground/10" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-foreground/10" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-foreground/10" />
              </div>
            </div>
          </div>
        )}

        {/* Error state — inline red alert with Retry button */}
        {error && (
          <div className="my-2 rounded-lg border border-red-200 bg-red-50 p-3" role="alert">
            <p className="mb-2 font-body text-sm text-red-700">
              {error.fallback || error.message || 'An unexpected error occurred.'}
            </p>
            <button
              className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              onClick={() => {
                dispatch({ type: 'CLEAR_ERROR' });
                if (error.query && employee?.employee_id && sessionId) {
                  sendMessage(error.query, employee.employee_id, sessionId);
                }
              }}
              aria-label="Retry query"
            >
              Retry
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* "New messages" floating button when scrolled up */}
      {!isNearBottom && messages.length > 0 && (
        <button
          className="fixed bottom-20 left-1/2 z-10 -translate-x-1/2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg transition-opacity hover:bg-accent-hover"
          onClick={() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            setIsNearBottom(true);
          }}
        >
          New messages
        </button>
      )}

      {/* Chat input pinned to bottom */}
      <ChatInput onSend={handleSend} isLoading={isLoading} />
    </div>
  );
}

export default ChatArea;
