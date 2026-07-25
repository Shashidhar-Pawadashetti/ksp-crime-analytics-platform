import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { UIContext } from '../contexts/UIContext';
import { useEvidence } from '../hooks/useEvidence';

describe('useEvidence', () => {
  const mockDispatch = vi.fn();
  const uiValue = {
    evidencePanelOpen: false,
    activeCitation: null,
    sidebarOpen: true,
    activeView: 'chat',
    dispatch: mockDispatch
  };

  function TestEvidence() {
    const { evidencePanelOpen, activeCitation, openEvidence, closeEvidence } = useEvidence();
    return (
      <div>
        <span data-testid="panel-open">{String(evidencePanelOpen)}</span>
        <span data-testid="active-citation">{activeCitation?.reference || 'none'}</span>
        <button data-testid="open-btn" onClick={() => openEvidence({ index: 1, reference: 'CaseMasterID:123', sourceType: 'CaseMaster' })}>
          Open
        </button>
        <button data-testid="close-btn" onClick={() => closeEvidence()}>Close</button>
      </div>
    );
  }

  test('returns panel state from context', () => {
    render(
      <UIContext.Provider value={uiValue}>
        <TestEvidence />
      </UIContext.Provider>
    );
    expect(screen.getByTestId('panel-open').textContent).toBe('false');
    expect(screen.getByTestId('active-citation').textContent).toBe('none');
  });

  test('openEvidence dispatches OPEN_EVIDENCE with payload', () => {
    render(
      <UIContext.Provider value={uiValue}>
        <TestEvidence />
      </UIContext.Provider>
    );
    screen.getByTestId('open-btn').click();
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'OPEN_EVIDENCE',
      payload: { index: 1, reference: 'CaseMasterID:123', sourceType: 'CaseMaster' }
    });
  });

  test('closeEvidence dispatches CLOSE_EVIDENCE', () => {
    render(
      <UIContext.Provider value={uiValue}>
        <TestEvidence />
      </UIContext.Provider>
    );
    screen.getByTestId('close-btn').click();
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'CLOSE_EVIDENCE' });
  });

  test('throws when used outside UIProvider', () => {
    function BadComponent() {
      useEvidence();
      return <div>test</div>;
    }
    expect(() => render(<BadComponent />)).toThrow(
      'useUI must be used within a UIProvider'
    );
  });
});
