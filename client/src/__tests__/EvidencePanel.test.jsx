import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { UIContext } from '../contexts/UIContext';
import EvidencePanel from '../components/Citations/EvidencePanel';

const mockUIValue = {
  evidencePanelOpen: true,
  activeCitation: { index: 1, reference: 'CaseMasterID:123', sourceType: 'CaseMaster' },
  closeEvidence: vi.fn(),
  dispatch: vi.fn(),
  sidebarOpen: true,
  activeView: 'chat'
};

function renderWithUI(uiOverrides = {}) {
  return render(
    <UIContext.Provider value={{ ...mockUIValue, ...uiOverrides }}>
      <EvidencePanel />
    </UIContext.Provider>
  );
}

describe('EvidencePanel', () => {
  test('renders citation source table and record ID', () => {
    renderWithUI();
    expect(screen.getByText('CaseMasterID')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
  });

  test('displays Source Evidence header', () => {
    renderWithUI();
    expect(screen.getByText('Source Evidence')).toBeInTheDocument();
  });

  test('shows disabled View in Network Graph button', () => {
    renderWithUI();
    const btn = screen.getByText('View in Network Graph');
    expect(btn).toBeDisabled();
  });

  test('returns null when no activeCitation', () => {
    const { container } = renderWithUI({ activeCitation: null });
    expect(container.firstChild).toBeNull();
  });

  test('returns null when evidencePanelOpen is false', () => {
    const { container } = renderWithUI({ evidencePanelOpen: false, activeCitation: null });
    expect(container.firstChild).toBeNull();
  });
});
