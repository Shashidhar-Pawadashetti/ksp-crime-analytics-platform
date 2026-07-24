import { render, screen } from '@testing-library/react';
import { useAuth } from '../hooks/useAuth';

function TestComponent() {
  useAuth();
  return <div>test</div>;
}

describe('useAuth', () => {
  test('throws when used outside AuthProvider', () => {
    expect(() => render(<TestComponent />)).toThrow(
      'useAuth must be used within an AuthProvider'
    );
  });
});
