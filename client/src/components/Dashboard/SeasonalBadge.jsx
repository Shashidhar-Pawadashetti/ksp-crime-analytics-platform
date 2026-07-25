// ksp-crime-analytics-platform/client/src/components/Dashboard/SeasonalBadge.jsx
//
// Seasonal pattern annotation badge.
// Shows peak month and percent change as a shadcn Badge with variant="outline".
// Uses amber accent (#D97706) for highlight, green (#059669) for positive trend.

import { Badge } from '../ui/badge';

/**
 * Seasonal annotation badge showing peak month and percent change.
 *
 * @param {{ peaks: Array<{month: string, percent: number}>, trend: 'up'|'down'|'stable' }} props
 * @returns {import('react').ReactElement|null}
 */
export default function SeasonalBadge({ peaks, trend }) {
  if (!peaks || peaks.length === 0) return null;

  const peak = peaks[0];
  const percentStr = (peak.percent > 0 ? '+' : '') + peak.percent.toFixed(0) + '%';

  const badgeStyle = trend === 'up'
    ? 'border-green-200 bg-green-50 text-green-700'
    : trend === 'down'
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : 'border-amber-200 bg-amber-50 text-amber-700';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" className={'text-xs font-semibold ' + badgeStyle}>
        Peak {peak.month}: {percentStr}
      </Badge>
      {peaks.length > 1 && (
        <span className="text-[10px] text-foreground/50">
          +{peaks.length - 1} more
        </span>
      )}
    </div>
  );
}
