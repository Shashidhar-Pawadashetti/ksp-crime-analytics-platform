// ksp-crime-analytics-platform/client/src/components/Chat/MessageBubble.jsx
//
// User/assistant message bubble with content, intent tag, confidence badge,
// data tables (max 6 cols x 10 rows), risk scores with severity color,
// and timestamp. All content rendered via JSX text interpolation
// (React auto-escapes by default, preventing XSS).

import CitationLink from '../Citations/CitationLink';

/**
 * Map backend intent string to human-readable label.
 * @type {Object<string, string>}
 */
const INTENT_LABELS = {
  structured: 'Structured Query',
  narrative: 'Narrative',
  network: 'Network',
  risk: 'Risk Score',
  analytical: 'Analytical'
};

/**
 * Get Tailwind classes for confidence level.
 * @param {number} confidence - 0.0 to 1.0
 * @returns {string} Tailwind classes
 */
function getConfidenceColor(confidence) {
  if (confidence >= 0.8) return 'bg-green-100 text-green-800';
  if (confidence >= 0.5) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}

/**
 * Get Tailwind text color class for risk severity.
 * @param {string} severity - low, medium, high, critical
 * @returns {string} Tailwind class
 */
function getRiskColor(severity) {
  const colors = {
    low: 'text-green-600',
    medium: 'text-amber-600',
    high: 'text-red-600',
    critical: 'text-red-800 font-bold'
  };
  return colors[severity?.toLowerCase()] || '';
}

/**
 * Render a data table from structured query results.
 * Max 6 columns, max 10 rows, horizontal scroll.
 *
 * @param {Array<Object>} data - Array of row objects
 * @returns {import('react').ReactElement|null}
 */
function renderDataTable(data) {
  if (!data || !Array.isArray(data) || data.length === 0) return null;

  const columns = Object.keys(data[0]).slice(0, 6);
  const rows = data.slice(0, 10);

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse font-mono text-xs">
        <thead>
          <tr className="bg-secondary">
            {columns.map((col) => (
              <th key={col} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-foreground">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border even:bg-dominant">
              {columns.map((col) => (
                <td key={col} className="max-w-[200px] truncate px-3 py-1.5 text-foreground/80">
                  {row[col] != null ? String(row[col]) : '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Message bubble — renders user and assistant messages.
 * User messages: right-aligned, compact, accent background.
 * Assistant messages: left-aligned, full-width, with intent tag, confidence badge,
 * data table, risk score, and timestamp.
 *
 * @param {{ message: object }} props
 */
function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  const intentLabel = message.intent
    ? INTENT_LABELS[message.intent] || message.intent
    : null;

  const confidenceColor = message.confidence != null
    ? getConfidenceColor(message.confidence)
    : null;

  const riskColor = message.severity
    ? getRiskColor(message.severity)
    : '';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3 animate-[message-fade-in_200ms_ease-out]`}
      role="listitem"
    >
      <div
        className={`max-w-[80%] rounded-xl p-3 ${
          isUser
            ? 'bg-accent text-white'
            : 'border border-border bg-surface text-foreground'
        }`}
      >
        {/* Sender label */}
        <div className={`mb-1 font-body text-xs font-semibold ${isUser ? 'text-white/80' : 'text-foreground/60'}`}>
          {isUser ? 'You' : 'KSP AI Assistant'}
        </div>

        {/* Intent tag (assistant only) */}
        {!isUser && intentLabel && (
          <span className="mb-2 inline-block rounded-full bg-secondary px-2 py-0.5 font-body text-xs font-medium text-foreground/70">
            {intentLabel}
          </span>
        )}

        {/* Confidence badge (assistant only) */}
        {!isUser && confidenceColor && (
          <span className={'mb-2 ml-1 inline-block rounded-full px-2 py-0.5 font-body text-xs font-medium ' + confidenceColor}>
            {(message.confidence * 100).toFixed(0)}% confidence
          </span>
        )}

        {/* Message content — rendered as text, auto-escaped by React JSX */}
        <div className="font-body text-base leading-relaxed">
          {message.content}
        </div>

        {/* Citations (assistant only) — max 3 inline with [+N more] overflow */}
        {!isUser && message.source_refs && message.source_refs.length > 0 && (
          <div className="mt-2 font-body text-sm leading-relaxed">
            <span className="text-xs font-medium text-foreground/60">Sources: </span>
            {message.source_refs.slice(0, 3).map((ref, index) => (
              <CitationLink
                key={`${ref}-${index}`}
                index={index + 1}
                reference={ref}
                sourceType={ref.split(':')[0]}
              />
            ))}
            {message.source_refs.length > 3 && (
              <span className="cursor-pointer text-xs text-foreground/60 hover:underline">
                {' '}[+{message.source_refs.length - 3} more]
              </span>
            )}
          </div>
        )}

        {/* Data table (assistant only) */}
        {!isUser && renderDataTable(message.data)}

        {/* Risk score (assistant only) */}
        {!isUser && message.risk_score != null && (
          <div className={'mt-2 font-body text-sm font-medium ' + riskColor}>
            Risk Score: {message.risk_score}/10
            {message.severity && <span className="ml-1">({message.severity})</span>}
          </div>
        )}

        {/* Timestamp */}
        <div className={`mt-1 font-body text-xs ${isUser ? 'text-white/50' : 'text-foreground/40'}`}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

export default MessageBubble;
