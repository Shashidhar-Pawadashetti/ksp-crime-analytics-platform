import { render, screen } from '@testing-library/react';
import PageTransition from '../components/Layout/PageTransition';

describe('PageTransition', () => {
  test('renders children inside the transition wrapper', () => {
    render(
      <PageTransition>
        <div data-testid="child-content">Hello</div>
      </PageTransition>
    );
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  test('renders multiple children', () => {
    render(
      <PageTransition>
        <span>One</span>
        <span>Two</span>
      </PageTransition>
    );
    expect(screen.getByText('One')).toBeInTheDocument();
    expect(screen.getByText('Two')).toBeInTheDocument();
  });

  test('renders without children (empty wrapper)', () => {
    const { container } = render(<PageTransition />);
    expect(container.querySelector('div')).toBeInTheDocument();
  });

  test('creates a div wrapper with ref', () => {
    const { container } = render(
      <PageTransition>
        <span>Content</span>
      </PageTransition>
    );
    const outerDiv = container.querySelector('div > div');
    expect(outerDiv).toBeInTheDocument();
    expect(outerDiv).toContainElement(screen.getByText('Content'));
  });
});
