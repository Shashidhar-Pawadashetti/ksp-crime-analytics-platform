// ksp-crime-analytics-platform/client/src/components/Chat/ErrorMessage.jsx
//
// Inline error with fallback text and Retry button in the chat flow.
// Per D-16, UI-SPEC §Error state — inline error with retry.
// Retry button clears the error and re-sends the original query that failed.

import { useChat } from '../../hooks/useChat';
import { useAuth } from '../../hooks/useAuth';

function ErrorMessage() {
  const { error, dispatch, sessionId, sendMessage } = useChat();
  const { employee, sessionToken } = useAuth();

  if (!error) return null;

  const handleRetry = () => {
    dispatch({ type: 'CLEAR_ERROR' });
    if (error.query && employee?.employee_id) {
      sendMessage(error.query, employee.employee_id, sessionId, sessionToken);
    }
  };

  return (
    <div className="my-2 rounded-lg border border-red-200 bg-red-50 p-3 font-body" role="alert">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="font-semibold text-sm text-red-800">Error</span>
      </div>
      <p className="mb-2 text-sm leading-relaxed text-red-700">
        {error.fallback || error.message || 'An unexpected error occurred.'}
      </p>
      <button
        className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        onClick={handleRetry}
        aria-label="Retry query"
      >
        Retry
      </button>
    </div>
  );
}

export default ErrorMessage;
