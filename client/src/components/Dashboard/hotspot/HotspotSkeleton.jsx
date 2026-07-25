// ksp-crime-analytics-platform/client/src/components/Dashboard/hotspot/HotspotSkeleton.jsx
//
// Loading skeleton for the hotspot map view.
// Renders a grey grid pattern with pulsing overlay to approximate
// map tiles during data fetch.

export default function HotspotSkeleton() {
  return (
    <div className="flex h-full w-full flex-col" aria-label="Loading hotspot map" role="status">
      {/* Tile grid rows */}
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex flex-1">
          {[0, 1, 2, 3].map((col) => (
            <div
              key={col}
              className="flex-1 animate-[map-tile-pulse_2s_ease-in-out_infinite] border border-border/30"
              style={{ backgroundColor: '#E9EEF6', animationDelay: `${(row * 4 + col) * 0.15}s` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
