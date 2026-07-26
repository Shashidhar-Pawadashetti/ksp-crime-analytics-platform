import { useEffect, useRef } from 'react';
import { createScope, animate } from 'animejs';
import ChartSkeleton from './ChartSkeleton';
import DashboardErrorMessage from './DashboardErrorMessage';

export default function ChartCard({ title, loading, error, onRetry, children }) {
  const cardRef = useRef(null);
  const prevLoadingRef = useRef(loading);

  useEffect(() => {
    if (prevLoadingRef.current && !loading && !error && children && cardRef.current) {
      const scope = createScope({ root: cardRef.current }).add(() => {
        animate(cardRef.current, {
          scale: [0.96, 1],
          opacity: [0, 1],
          duration: 300,
          ease: 'out(2)',
        });
      });
      return () => scope.revert();
    }
    prevLoadingRef.current = loading;
  }, [loading, error, children]);

  return (
    <div ref={cardRef} className="flex flex-col rounded-lg border border-border bg-surface p-4">
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
