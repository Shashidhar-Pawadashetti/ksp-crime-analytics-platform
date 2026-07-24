import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { UIContext } from '../contexts/UIContext';
import { useUI, useEvidence } from '../hooks/useUI';

describe('useUI', () => {
  function TestComponent() {
    useUI();
    return <div>test</div>;
  }

  test('throws when used outside UIProvider', () => {
    expect(() => render(<TestComponent />)).toThrow(
      'useUI must be used within a UIProvider'
    );
  });
});

describe('useEvidence convenience hook', () => {
  const mockDispatch = vi.fn();
  const uiValue = {
    evidencePanelOpen: true,
    activeCitation: { index: 1, reference: 'CaseMasterID:123' },
    sidebarOpen: true,
    activeView: 'chat',
    dispatch: mockDispatch
  };

  function TestEvidence({ action }) {
    const { evidencePanelOpen, activeCitation, openEvidence, closeEvidence } = useEvidence();
    return (
      <div>
        <span data-testid="panel-open">{String(evidencePanelOpen)}</span>
        <span data-testid="active-citation">{activeCitation?.reference || 'none'}</span>
        <button data-testid="open-btn" onClick={() => openEvidence({ index: 2, reference: 'VictimMasterID:456' })}>Open</button>
        <button data-testid="close-btn" onClick={() => closeEvidence()}>Close</button>
      </div>
    );
  }

  test('provides evidence panel state from context', () => {
    render(
      <UIContext.Provider value={uiValue}>
        <TestEvidence />
      </UIContext.Provider>
    );
    expect(screen.getByTestId('panel-open').textContent).toBe('true');
    expect(screen.getByTestId('active-citation').textContent).toBe('CaseMasterID:123');
  });

  test('openEvidence dispatches OPEN_EVIDENCE', () => {
    render(
      <UIContext.Provider value={uiValue}>
        <TestEvidence />
      </UIContext.Provider>
    );
    screen.getByTestId('open-btn').click();
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'OPEN_EVIDENCE',
      payload: { index: 2, reference: 'VictimMasterID:456' }
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
});
