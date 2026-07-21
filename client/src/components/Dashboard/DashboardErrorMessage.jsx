// ksp-crime-analytics-platform/client/src/components/Dashboard/DashboardErrorMessage.jsx
//
// Per-chart-card error state with retry button.
// Follows the same pattern as ErrorMessage.jsx from Phase 1.

/**
 * Dashboard error message with optional retry button.
 *
 * @param {{ message: string, onRetry: function }} props
 * @returns {import('react').ReactElement}
 */
export default function DashboardErrorMessage({ message, onRetry }) {
  return (
    <div
      className="my-2 rounded-lg border border-red-200 bg-red-50 p-3 font-body"
      role="alert"
    >
      <p className="mb-2 text-sm leading-relaxed text-red-700">
        {message || 'Unable to load chart data. The dashboard service may be processing a complex query.'}
      </p>
      {onRetry && (
        <button
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          onClick={onRetry}
          aria-label="Retry"
        >
          Retry
        </button>
      )}
    </div>
  );
}
