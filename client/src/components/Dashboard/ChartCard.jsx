// ksp-crime-analytics-platform/client/src/components/Dashboard/ChartCard.jsx
//
// Card wrapper for dashboard chart components.
// Shows title, loading skeleton, error state with retry, or the chart children.

import ChartSkeleton from './ChartSkeleton';
import DashboardErrorMessage from './DashboardErrorMessage';

/**
 * Chart card wrapper with title, skeleton, error, and content states.
 *
 * @param {{ title: string, loading: boolean, error: string|null, onRetry: function, children: import('react').ReactNode }} props
 * @returns {import('react').ReactElement}
 */
export default function ChartCard({ title, loading, error, onRetry, children }) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface p-4">
      <h3 className="font-heading text-base font-semibold text-foreground mb-3">
        {title}
      </h3>
      <div className="flex-1 min-h-[280px]">
        {loading ? (
          <ChartSkeleton />
        ) : error ? (
          <DashboardErrorMessage message={error} onRetry={onRetry} />
        ) : (
          children
        )}
      </div>
    </div>
  );
}
