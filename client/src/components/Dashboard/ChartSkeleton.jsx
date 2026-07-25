// ksp-crime-analytics-platform/client/src/components/Dashboard/ChartSkeleton.jsx
//
// CSS-only shimmer skeleton matching chart card aspect ratio (~3:2).
// Reuses the shimmer animation pattern from LoadingSkeleton.jsx.

/**
 * Chart skeleton loading placeholder.
 * @returns {import('react').ReactElement}
 */
export default function ChartSkeleton() {
  return (
    <div className="h-full w-full rounded-lg" aria-label="Loading chart" role="status">
      <div className="mb-3 h-4 w-1/3 animate-shimmer rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" />
      <div className="h-[80%] w-full animate-shimmer rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" />
    </div>
  );
}
