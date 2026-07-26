import React from 'react';

function RoleBadge({ label, count, color }) {
  if (!count) return null;
  return (
    <div className="flex items-center justify-between rounded-md bg-dominant px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="font-body text-xs text-foreground/70">{label}</span>
      </div>
      <span className="font-body text-sm font-semibold text-foreground">{count}</span>
    </div>
  );
}

function EdgeBreakdownRow({ label, count, color }) {
  if (!count) return null;
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        <span className="inline-block h-0.5 w-4 shrink-0 rounded" style={{ backgroundColor: color }} />
        <span className="font-body text-xs text-foreground/60">{label}</span>
      </div>
      <span className="font-body text-xs font-medium text-foreground/80">{count}</span>
    </div>
  );
}

export default function GraphInfoPanel({ person, onClose }) {
  if (!person) return null;

  var roles = person.roles_summary || {};
  var totalConnections = (roles.accused_count || 0) + (roles.victim_count || 0) + (roles.complainant_count || 0);
  var insights = [];

  if (roles.accused_count > 3) {
    insights.push('High-repeat accused across ' + roles.accused_count + ' cases');
  } else if (roles.accused_count > 0) {
    insights.push('Accused in ' + roles.accused_count + ' case(s)');
  }

  if (roles.victim_count > 0) {
    insights.push('Also appears as victim in ' + roles.victim_count + ' case(s)');
  }

  if (roles.complainant_count > 0) {
    insights.push('Filed complaints in ' + roles.complainant_count + ' case(s)');
  }

  if (totalConnections > 5) {
    insights.push('Wide network: connected to ' + totalConnections + ' entities');
  }

  if (insights.length === 0) {
    insights.push('No detailed role data available');
  }

  var degree = person.degree || 0;
  var neighborCount = person.neighborCount || degree;

  return (
    <div className="absolute right-0 top-0 z-30 h-full w-72 border-l border-border bg-dominant/98 shadow-xl backdrop-blur-sm">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="truncate font-heading text-sm font-semibold text-foreground">
            {person.label || 'Unknown'}
          </h3>
          <button
            className="flex h-6 w-6 items-center justify-center rounded-md text-foreground/40 transition-colors hover:bg-border/60 hover:text-foreground"
            onClick={onClose}
            aria-label="Close panel"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-5">
            <div>
              <h4 className="mb-2 font-body text-xs font-semibold text-foreground/50 uppercase tracking-wide">
                Role Breakdown
              </h4>
              <div className="space-y-1.5">
                <RoleBadge label="Accused" count={roles.accused_count} color="#E53935" />
                <RoleBadge label="Victim" count={roles.victim_count} color="#FF9800" />
                <RoleBadge label="Complainant" count={roles.complainant_count} color="#43A047" />
              </div>
            </div>

            <div>
              <h4 className="mb-2 font-body text-xs font-semibold text-foreground/50 uppercase tracking-wide">
                Network
              </h4>
              <div className="rounded-md bg-dominant px-2.5 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-body text-xs text-foreground/70">Direct connections</span>
                  <span className="font-body text-sm font-semibold text-foreground">{neighborCount}</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="mb-2 font-body text-xs font-semibold text-foreground/50 uppercase tracking-wide">
                Relationship Breakdown
              </h4>
              <div className="space-y-0.5">
                <EdgeBreakdownRow
                  label="Co-Accused"
                  count={person.edgeBreakdown && person.edgeBreakdown.CO_ACCUSED}
                  color="#E53935"
                />
                <EdgeBreakdownRow
                  label="Accused \u2192 Victim"
                  count={person.edgeBreakdown && person.edgeBreakdown.ACCUSED_TO_VICTIM}
                  color="#FF9800"
                />
                <EdgeBreakdownRow
                  label="Shared Location"
                  count={person.edgeBreakdown && person.edgeBreakdown.SHARED_LOCATION}
                  color="#2196F3"
                />
                <EdgeBreakdownRow
                  label="Unconfirmed Match"
                  count={person.edgeBreakdown && person.edgeBreakdown.UNCONFIRMED_MATCH}
                  color="#9E9E9E"
                />
              </div>
            </div>

            <div>
              <h4 className="mb-2 font-body text-xs font-semibold text-foreground/50 uppercase tracking-wide">
                Insights
              </h4>
              <ul className="space-y-1.5">
                {insights.map(function (text, i) {
                  return (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-cta" />
                      <span className="font-body text-xs leading-relaxed text-foreground/70">{text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
