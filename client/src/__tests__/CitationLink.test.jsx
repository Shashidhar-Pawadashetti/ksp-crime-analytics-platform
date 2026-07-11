import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { UIContext } from '../contexts/UIContext';
import CitationLink from '../components/Citations/CitationLink';

describe('CitationLink', () => {
  test('renders superscript [N] button', () => {
    render(
      <UIContext.Provider value={{ dispatch: vi.fn(), evidencePanelOpen: false, activeCitation: null, sidebarOpen: true, activeView: 'chat' }}>
        <CitationLink index={1} reference="CaseMasterID:123" sourceType="CaseMaster" />
      </UIContext.Provider>
    );
    expect(screen.getByText('[1]')).toBeInTheDocument();
  });

  test('dispatches OPEN_EVIDENCE on click', () => {
    const dispatch = vi.fn();
    render(
      <UIContext.Provider value={{ dispatch, evidencePanelOpen: false, activeCitation: null, sidebarOpen: true, activeView: 'chat' }}>
        <CitationLink index={1} reference="CaseMasterID:123" sourceType="CaseMaster" />
      </UIContext.Provider>
    );
    fireEvent.click(screen.getByText('[1]'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'OPEN_EVIDENCE',
      payload: { index: 1, reference: 'CaseMasterID:123', sourceType: 'CaseMaster' }
    });
  });

  test('renders with correct aria-label', () => {
    render(
      <UIContext.Provider value={{ dispatch: vi.fn(), evidencePanelOpen: false, activeCitation: null, sidebarOpen: true, activeView: 'chat' }}>
        <CitationLink index={2} reference="VictimMasterID:456" sourceType="VictimMaster" />
      </UIContext.Provider>
    );
    expect(screen.getByLabelText(/Citation 2/)).toBeInTheDocument();
  });
});
