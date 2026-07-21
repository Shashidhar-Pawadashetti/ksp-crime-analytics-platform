// ksp-crime-analytics-platform/client/src/components/Graph/GraphSkeleton.jsx
//
// Pulsing placeholder for graph while data is loading.
// Simulates a graph layout with pulsing circles and lines.

import React from 'react';

function PulsingCircle({ cx, cy, r, delay }) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill="#E9EEF6"
      className="animate-pulse"
      style={{ animationDelay: delay + 'ms' }}
    />
  );
}

function PulsingLine({ x1, y1, x2, y2, delay }) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke="#E9EEF6"
      strokeWidth={2}
      className="animate-pulse"
      style={{ animationDelay: delay + 'ms' }}
    />
  );
}

export default function GraphSkeleton() {
  return (
    <div
      className="flex h-full w-full items-center justify-center"
      aria-label="Loading graph"
      role="status"
    >
      <svg
        viewBox="0 0 400 300"
        className="h-3/4 w-3/4 max-h-64 max-w-md"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Lines simulating edges */}
        <PulsingLine x1={200} y1={60} x2={100} y2={150} delay={0} />
        <PulsingLine x1={200} y1={60} x2={300} y2={150} delay={100} />
        <PulsingLine x1={200} y1={60} x2={200} y2={230} delay={200} />
        <PulsingLine x1={100} y1={150} x2={300} y2={150} delay={300} />
        <PulsingLine x1={100} y1={150} x2={200} y2={230} delay={400} />

        {/* Nodes simulating person/case circles */}
        <PulsingCircle cx={200} cy={60} r={25} delay={0} />
        <PulsingCircle cx={100} cy={150} r={22} delay={100} />
        <PulsingCircle cx={300} cy={150} r={22} delay={200} />
        <PulsingCircle cx={200} cy={230} r={20} delay={300} />
      </svg>
    </div>
  );
}
