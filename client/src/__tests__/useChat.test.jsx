import { render } from '@testing-library/react';
import { useChat } from '../hooks/useChat';

function TestComponent() {
  useChat();
  return <div>test</div>;
}

describe('useChat', () => {
  test('throws when used outside ChatProvider', () => {
    expect(() => render(<TestComponent />)).toThrow(
      'useChat must be used within a ChatProvider'
    );
  });
});
