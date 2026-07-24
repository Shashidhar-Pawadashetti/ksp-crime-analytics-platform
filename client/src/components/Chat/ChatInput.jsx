// ksp-crime-analytics-platform/client/src/components/Chat/ChatInput.jsx
//
// Auto-resizing textarea with Enter-to-submit, Shift+Enter newline, Send button disabled states.
// Uses Tailwind utility classes exclusively — no CSS files.

import { useState, useRef, useCallback } from 'react';

/**
 * Chat input component with auto-resizing textarea.
 *
 * @param {{ onSend: (query: string) => void, isLoading: boolean }} props
 */
function ChatInput({ onSend, isLoading }) {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setInput('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, isLoading, onSend]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e) => {
    setInput(e.target.value);
    // Auto-resize: reset then set to scrollHeight (max ~4 lines = 120px)
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  return (
    <div className="flex items-end gap-2 border-t border-border bg-dominant p-4">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Ask a question about KSP crime data..."
        disabled={isLoading}
        rows={1}
        className="min-h-[44px] flex-1 resize-none rounded-lg border border-border bg-input-bg px-4 py-2.5 font-body text-base text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Ask a question about KSP crime data"
      />
      <button
        onClick={handleSubmit}
        disabled={!input.trim() || isLoading}
        className="flex h-[44px] w-[44px] items-center justify-center rounded-lg bg-cta text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Send message"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

export default ChatInput;
