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
import * as session from '../../services/session';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import LoadingSkeleton from './LoadingSkeleton';
import EmptyState from './EmptyState';
import ErrorMessage from './ErrorMessage';

/**
 * Chat area — the primary content view when authenticated (Phase 1).
 * Manages scroll position, auto-scroll behavior, and user input submission.
 */
function ChatArea() {
  const { messages, isLoading, error, sessionId, sendMessage, dispatch } = useChat();
  const { employee, sessionToken, isAuthenticated } = useAuth();
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);
  const [isNearBottom, setIsNearBottom] = useState(true);

  // Persist real session_id across page refreshes
  useEffect(() => {
    if (sessionId && employee) {
      session.saveSession({ sessionId, employee });
    }
  }, [sessionId, employee]);

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

  // Bridge: extract employee_id and auth credentials from AuthContext, pass to sendMessage
  const handleSend = useCallback((query) => {
    if (employee?.employee_id) {
      sendMessage(query, employee.employee_id, sessionId, sessionToken);
    }
  }, [employee, sessionId, sessionToken, sendMessage]);

  return (
    <div className="flex h-full flex-col">
      {/* Message list */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {/* Empty state — first visit welcome with example queries */}
        {messages.length === 0 && !isLoading && <EmptyState />}

        {/* Message bubbles */}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Loading state — animated shimmer skeleton bubbles */}
        {isLoading && <LoadingSkeleton />}

        {/* Error state — inline error with retry */}
        {error && <ErrorMessage />}

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
