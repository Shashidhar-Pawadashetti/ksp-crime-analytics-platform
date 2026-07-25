// ksp-crime-analytics-platform/client/src/components/Citations/EvidencePanel.jsx
//
// Slide-out panel showing citation source record details.
// Uses shadcn Sheet component for the slide-out animation.
// Per UI-SPEC §Motion & Animation: slide-in from right (250ms, ease-out),
// prefers-reduced-motion respected via index.css media query.
//
// Props from UIContext: evidencePanelOpen, activeCitation, closeEvidence.
// Panel closes on X button click or overlay backdrop click (Sheet handles this).

import { useEffect } from 'react';
import { useUI } from '../../hooks/useUI';
import { Button } from '../ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '../ui/sheet';

function EvidencePanel() {
  const { activeCitation, evidencePanelOpen, closeEvidence } = useUI();

  if (!activeCitation) return null;

  const [sourceTable, recordId] = (activeCitation.reference || ':').split(':');

  return (
    <Sheet open={evidencePanelOpen} onOpenChange={(open) => !open && closeEvidence()}>
      <SheetContent side="right" className="w-[400px] bg-secondary font-body">
        <SheetHeader>
          <SheetTitle className="font-heading text-heading font-semibold text-foreground">Source Evidence</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block font-body text-xs font-semibold uppercase tracking-wide text-foreground/60">Source Table</label>
            <span className="font-body text-base text-foreground">{sourceTable || 'Unknown'}</span>
          </div>
          <div>
            <label className="block font-body text-xs font-semibold uppercase tracking-wide text-foreground/60">Record ID</label>
            <span className="font-body text-base text-foreground">{recordId || 'Unknown'}</span>
          </div>
          <div>
            <label className="block font-body text-xs font-semibold uppercase tracking-wide text-foreground/60">Citation Index</label>
            <span className="font-body text-base text-foreground">{activeCitation.index}</span>
          </div>

          {/* Phase 2 prep: disabled "View in Network Graph" link per D-21, UI-SPEC */}
          <div className="mt-6 border-t border-border pt-4">
            <Button variant="outline" disabled className="w-full font-body text-sm cursor-not-allowed opacity-50" title="Available in Phase 2: Network Graph">
              View in Network Graph
            </Button>
            <p className="mt-2 text-center font-body text-xs text-foreground/50">
              Entity relationship visualization coming in Phase 2.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default EvidencePanel;
