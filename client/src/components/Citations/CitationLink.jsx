// ksp-crime-analytics-platform/client/src/components/Citations/CitationLink.jsx
//
// Superscript [N] link that dispatches OPEN_EVIDENCE on click.
// Clicking navigates to the evidence panel slide-out with source record details.
// Per UI-SPEC §Citations — superscript links with monospace Fira Code.
// Hit area padded to 44x44px for touch accessibility per UI-SPEC §Spacing exceptions.

import { useUI } from '../../hooks/useUI';

function CitationLink({ index, reference, sourceType }) {
  const { dispatch } = useUI();

  const handleClick = () => {
    dispatch({
      type: 'OPEN_EVIDENCE',
      payload: { index, reference, sourceType }
    });
  };

  return (
    <sup className="font-heading text-xs">
      <button
        className="inline-flex items-center justify-center border-none bg-transparent p-2 text-accent underline transition-colors hover:text-accent-hover focus:outline-none focus:ring-2 focus:ring-accent/30"
        onClick={handleClick}
        title={`View source: ${reference}`}
        aria-label={`Citation ${index}: ${reference}`}
      >
        [{index}]
      </button>
    </sup>
  );
}

export default CitationLink;
