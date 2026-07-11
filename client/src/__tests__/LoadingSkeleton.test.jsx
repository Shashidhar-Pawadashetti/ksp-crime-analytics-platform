import { render } from '@testing-library/react';
import LoadingSkeleton from '../components/Chat/LoadingSkeleton';

describe('LoadingSkeleton', () => {
  test('renders without crashing', () => {
    const { container } = render(<LoadingSkeleton />);
    expect(container.firstChild).toBeInTheDocument();
  });

  test('has loading aria-label for accessibility', () => {
    render(<LoadingSkeleton />);
    const skeleton = document.querySelector('[aria-label="Loading response"]');
    expect(skeleton).toBeInTheDocument();
  });

  test('has role="status" for accessibility', () => {
    render(<LoadingSkeleton />);
    expect(document.querySelector('[role="status"]')).toBeInTheDocument();
  });

  test('renders two shimmer skeleton bubbles', () => {
    const { container } = render(<LoadingSkeleton />);
    // The skeleton container has space-y-3 class
    const skeletonContainer = container.firstChild;
    expect(skeletonContainer).toBeInTheDocument();
    // Should have 2 child skeleton bubble divs
    expect(skeletonContainer.children.length).toBe(2);
  });
});
