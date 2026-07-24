// ksp-crime-analytics-platform/client/src/components/Dashboard/risk/RiskRankedView.jsx
//
// Scrollable table of persons ranked by risk score with severity badges.
// Shows Person Name, Total Cases, and Score columns.
// Handles empty state, responsive horizontal scroll.

import { Badge } from '../../ui/badge';

/**
 * Get Tailwind class for severity badge color.
 * @param {string} severity - 'low' | 'medium' | 'high' | 'critical'
 * @returns {string}
 */
function getSeverityClass(severity) {
  switch ((severity || '').toLowerCase()) {
    case 'critical':
      return 'bg-[#991B1B] text-white border-[#991B1B]';
    case 'high':
      return 'bg-[#DC2626] text-white border-[#DC2626]';
    case 'medium':
      return 'bg-[#D97706] text-white border-[#D97706]';
    case 'low':
    default:
      return 'bg-[#059669] text-white border-[#059669]';
  }
}

/**
 * Empty state when no risk-ranked data is available.
 * @returns {import('react').ReactElement}
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface px-4 py-8 text-center">
      <p className="text-sm text-foreground/60">
        No risk-ranked data available. Data may not be computed yet.
      </p>
    </div>
  );
}

/**
 * Risk-ranked persons table with severity badge scores.
 *
 * @param {{ data: Array<{name: string, caseCount: number, score: number, severity: string}>|null }} props
 * @returns {import('react').ReactElement}
 */
export default function RiskRankedView({ data }) {
  const validRows = data && data.filter(function (row) { return row && row.name; });

  if (!validRows || validRows.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-heading text-base font-semibold text-foreground">
          Risk-Ranked Persons
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-xs">
          <thead>
            <tr className="bg-secondary">
              <th className="whitespace-nowrap px-3 py-2 text-left font-semibold text-foreground">
                Person Name
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-left font-semibold text-foreground">
                Total Cases
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-left font-semibold text-foreground">
                Score
              </th>
            </tr>
          </thead>
          <tbody>
            {validRows.map(function (row, i) {
              return (
                <tr key={i} className="border-t border-border even:bg-dominant">
                  <td className="max-w-[200px] truncate px-3 py-1.5 text-foreground/80">
                    {row.name}
                  </td>
                  <td className="px-3 py-1.5 text-foreground/80">
                    {row.caseCount}
                  </td>
                  <td className="px-3 py-1.5">
                    <Badge className={getSeverityClass(row.severity)}>
                      {row.score}/10
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
