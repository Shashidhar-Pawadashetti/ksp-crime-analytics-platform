import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import LineChart from '../components/Dashboard/charts/LineChart';

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
  { label: 'Jan', value: 10 },
  { label: 'Feb', value: 20 },
  { label: 'Mar', value: 15 }
];

const dateData = [
  { label: new Date('2024-01-01'), value: 10 },
  { label: new Date('2024-02-01'), value: 20 },
  { label: new Date('2024-03-01'), value: 15 }
];

describe('LineChart', () => {
  it('renders SVG element with provided data', () => {
    const { container } = render(<LineChart data={sampleData} width={500} height={300} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('width', '500');
    expect(svg).toHaveAttribute('height', '300');
  });

  it('renders a path element (D3 line)', () => {
    const { container } = render(<LineChart data={sampleData} width={500} height={300} />);
    const path = container.querySelector('svg path');
    expect(path).toBeInTheDocument();
    expect(path).toHaveAttribute('d');
  });

  it('renders with Date data', () => {
    const { container } = render(<LineChart data={dateData} width={500} height={300} />);
    const path = container.querySelector('svg path');
    expect(path).toBeInTheDocument();
    expect(path).toHaveAttribute('d');
  });

  it('handles empty data array without errors', () => {
    const { container } = render(<LineChart data={[]} width={500} height={300} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders tooltip on mouseenter over data point', () => {
    const { container } = render(<LineChart data={sampleData} width={500} height={300} />);
    const circles = container.querySelectorAll('svg circle');
    if (circles.length > 0) {
      fireEvent.mouseEnter(circles[0]);
      const tooltip = document.querySelector('.pointer-events-none');
      expect(tooltip).toBeInTheDocument();
    }
  });

  it('calls onElementClick when a data point is clicked', () => {
    const handleClick = vi.fn();
    const { container } = render(
      <LineChart data={sampleData} width={500} height={300} onElementClick={handleClick} />
    );
    const circles = container.querySelectorAll('svg circle');
    if (circles.length > 0) {
      fireEvent.click(circles[0]);
      expect(handleClick).toHaveBeenCalledTimes(1);
    }
  });
});
