import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import PieChart from '../components/Dashboard/charts/PieChart';

// jsdom does not implement window.matchMedia — provide a stub
beforeAll(function () {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(function (query) {
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      };
    })
  });
});

const sampleData = [
  { label: 'Theft', value: 40 },
  { label: 'Assault', value: 25 },
  { label: 'Fraud', value: 20 }
];

describe('PieChart', () => {
  it('renders SVG element with provided data', () => {
    const { container } = render(<PieChart data={sampleData} width={500} height={300} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('width', '500');
    expect(svg).toHaveAttribute('height', '300');
  });

  it('renders arc path elements (one per data item)', () => {
    const { container } = render(<PieChart data={sampleData} width={500} height={300} />);
    const paths = container.querySelectorAll('svg path');
    // Should have at least 3 arcs (one per data item)
    // Note: may include extra defs/gradient paths
    expect(paths.length).toBeGreaterThanOrEqual(3);
  });

  it('renders legend items matching data labels', () => {
    const { container } = render(<PieChart data={sampleData} width={500} height={300} />);
    const svg = container.querySelector('svg');
    // Legend text elements should contain category names
    const texts = svg.querySelectorAll('text');
    const textContent = Array.from(texts).map(function (t) { return t.textContent; });
    expect(textContent).toContain('Theft');
    expect(textContent).toContain('Assault');
    expect(textContent).toContain('Fraud');
  });

  it('handles single-item data', () => {
    const { container } = render(<PieChart data={[{ label: 'Only', value: 100 }]} width={500} height={300} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // Should render at least 1 arc
    const paths = container.querySelectorAll('svg path');
    expect(paths.length).toBeGreaterThanOrEqual(1);
  });

  it('handles empty data', () => {
    const { container } = render(<PieChart data={[]} width={500} height={300} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('calls onElementClick when arc is clicked', () => {
    const handleClick = vi.fn();
    const { container } = render(
      <PieChart data={sampleData} width={500} height={300} onElementClick={handleClick} />
    );
    const paths = container.querySelectorAll('svg path');
    // Click the first arc path
    if (paths.length > 0) {
      fireEvent.click(paths[0]);
      expect(handleClick).toHaveBeenCalledTimes(1);
    }
  });
});
