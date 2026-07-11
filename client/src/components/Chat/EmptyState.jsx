// ksp-crime-analytics-platform/client/src/components/Chat/EmptyState.jsx
//
// Welcome message with example queries for first-time users.
// Per D-17, UI-SPEC §Copywriting Contract — welcome card centered.
// No emoji per user preference. Example queries as clickable cards.
// Clicking an example query dispatches the query to the chat input.

import { EXAMPLE_QUERIES } from '../../utils/constants';
import { useChat } from '../../hooks/useChat';
import { useAuth } from '../../hooks/useAuth';

function EmptyState() {
  const { dispatch, sendMessage } = useChat();
  const { employee, sessionId } = useAuth();

  const handleExampleClick = (query) => {
    if (employee?.employee_id && sessionId) {
      sendMessage(query, employee.employee_id, sessionId);
    }
  };

  return (
    <div className="mx-auto mt-20 max-w-[480px] px-6 py-8 text-center" role="status">
      <h2 className="font-heading text-[28px] font-semibold text-foreground">Ask a question about KSP crime data</h2>
      <p className="mt-2 font-body text-base leading-relaxed text-foreground/70">
        Try asking: &ldquo;How many FIRs were registered last month?&rdquo; or &ldquo;Show me cases with repeat offenders&rdquo;
      </p>
      <div className="mt-6">
        <h3 className="mb-3 font-body text-sm font-semibold text-foreground">Try asking:</h3>
        <ul className="space-y-2">
          {EXAMPLE_QUERIES.map((q, i) => (
            <li
              key={i}
              className="cursor-pointer rounded-lg border border-border bg-dominant px-4 py-2.5 font-body text-sm text-accent transition-all hover:bg-accent hover:text-white hover:border-accent"
              onClick={() => handleExampleClick(q)}
            >
              {q}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default EmptyState;
