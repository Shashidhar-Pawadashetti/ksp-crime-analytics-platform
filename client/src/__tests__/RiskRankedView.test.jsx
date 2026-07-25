import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RiskRankedView from '../components/Dashboard/risk/RiskRankedView';

const sampleData = [
  { name: 'John Doe', caseCount: 5, score: 8, severity: 'high' },
  { name: 'Jane Smith', caseCount: 3, score: 6, severity: 'medium' },
  { name: 'Bob Wilson', caseCount: 1, score: 3, severity: 'low' }
];

describe('RiskRankedView', () => {
  it('renders table with provided data rows', () => {
    render(<RiskRankedView data={sampleData} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Wilson')).toBeInTheDocument();
  });

  it('renders person case count and score in each row', () => {
    render(<RiskRankedView data={sampleData} />);

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('8/10')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('6/10')).toBeInTheDocument();
  });

  it('renders severity badge with correct score text', () => {
    render(<RiskRankedView data={sampleData} />);

    // Check that all score badges are rendered with /10 format
    expect(screen.getByText('8/10')).toBeInTheDocument();
    expect(screen.getByText('6/10')).toBeInTheDocument();
    expect(screen.getByText('3/10')).toBeInTheDocument();
  });

  it('renders empty state when data is null', () => {
    render(<RiskRankedView data={null} />);

    expect(screen.getByText(/no risk-ranked data available/i)).toBeInTheDocument();
  });

  it('renders empty state when data is empty array', () => {
    render(<RiskRankedView data={[]} />);

    expect(screen.getByText(/no risk-ranked data available/i)).toBeInTheDocument();
  });

  it('shows table header columns', () => {
    render(<RiskRankedView data={sampleData} />);

    expect(screen.getByText('Person Name')).toBeInTheDocument();
    expect(screen.getByText('Total Cases')).toBeInTheDocument();
    expect(screen.getByText('Score')).toBeInTheDocument();
  });

  it('renders correct number of table rows matching data length', () => {
    const { container } = render(<RiskRankedView data={sampleData} />);

    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
  });

  it('handles critical severity data', () => {
    const criticalData = [
      { name: 'Dangerous Person', caseCount: 10, score: 10, severity: 'critical' }
    ];
    render(<RiskRankedView data={criticalData} />);

    expect(screen.getByText('10/10')).toBeInTheDocument();
    expect(screen.getByText('Dangerous Person')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });
});
