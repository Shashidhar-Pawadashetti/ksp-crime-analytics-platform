// ksp-crime-analytics-platform/client/src/components/Dashboard/GridLayout.jsx
//
// Responsive CSS grid for dashboard chart cards.
// Breakpoints: 1 col <768px, 2 cols 768-1399px, 3 cols 1400px+

/**
 * Responsive grid layout for chart cards.
 *
 * @param {{ children: import('react').ReactNode, columns?: number }} props
 * @returns {import('react').ReactElement}
 */
export default function GridLayout({ children, columns }) {
  const gridCols = columns
    ? 'grid-cols-' + columns
    : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';

  return (
    <div className={'grid ' + gridCols + ' gap-4 px-4 py-4'}>
      {children}
    </div>
  );
}
