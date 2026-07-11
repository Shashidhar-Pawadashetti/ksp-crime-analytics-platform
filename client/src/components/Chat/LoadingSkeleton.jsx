// ksp-crime-analytics-platform/client/src/components/Chat/LoadingSkeleton.jsx
//
// CSS-only shimmer skeleton for the loading state.
// Two animated message bubbles to indicate response length range.
// Uses `animate-shimmer` keyframe defined in index.css.
// Per D-15, UI-SPEC §UX States — animated message bubble skeletons (not spinners).

function LoadingSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading response" role="status">
      {[1, 2].map((i) => (
        <div key={i} className="max-w-[75%] rounded-xl border border-border bg-surface p-3">
          <div className="mb-2 h-3 w-1/4 animate-shimmer rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" />
          <div className="mb-2 h-3 w-full animate-shimmer rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" />
          <div className="mb-2 h-3 w-3/4 animate-shimmer rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" />
          <div className="h-3 w-1/2 animate-shimmer rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" />
        </div>
      ))}
    </div>
  );
}

export default LoadingSkeleton;
