import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { DashboardProvider } from '../contexts/DashboardContext';
import { UIContext } from '../contexts/UIContext';
import HotspotMapView from '../components/Dashboard/hotspot/HotspotMapView';

// Mock react-leaflet and react-leaflet-cluster to avoid Leaflet DOM issues in jsdom
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, className }) => (
    <div data-testid="map-container" className={className}>{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ children, position }) => (
    <div data-testid="marker" data-lat={position[0]} data-lng={position[1]}>{children}</div>
  ),
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
  useMap: () => ({
    invalidateSize: vi.fn(),
    fitBounds: vi.fn(),
    addTo: vi.fn(),
    removeFrom: vi.fn(),
  }),
}));

vi.mock('react-leaflet-cluster', () => ({
  default: ({ children }) => <div data-testid="marker-cluster">{children}</div>,
}));

// Mock leaflet CSS imports (they resolve to nothing in jsdom)
vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('react-leaflet-cluster/dist/assets/MarkerCluster.css', () => ({}));
vi.mock('react-leaflet-cluster/dist/assets/MarkerCluster.Default.css', () => ({}));

// Mock leaflet L object
vi.mock('leaflet', () => ({
  default: {
    Icon: {
      Default: {
        prototype: { _getIconUrl: undefined },
        mergeOptions: vi.fn(),
      },
    },
    latLngBounds: () => ({
      extend: vi.fn(),
    }),
    circleMarker: () => ({
      addTo: vi.fn(),
      removeFrom: vi.fn(),
    }),
  },
}));

const uiValue = {
  dispatch: vi.fn(),
  evidencePanelOpen: false,
  activeCitation: null,
  sidebarOpen: true,
  activeView: 'hotspots',
};

const sampleHotspots = [
  {
    CaseMasterID: '123',
    Latitude: 15.3173,
    Longitude: 75.7139,
    CrimeGroupName: 'Theft',
    CrimeRegisteredDate: '2024-01-15',
  },
  {
    CaseMasterID: '456',
    Latitude: 12.9716,
    Longitude: 77.5946,
    CrimeGroupName: 'Assault',
    CrimeRegisteredDate: '2024-02-20',
  },
];

function renderWithProviders(component) {
  return render(
    <UIContext.Provider value={uiValue}>
      <DashboardProvider>
        {component}
      </DashboardProvider>
    </UIContext.Provider>
  );
}

describe('HotspotMapView', () => {
  test('renders MapContainer with hotspot data markers', () => {
    renderWithProviders(
      <HotspotMapView hotspots={sampleHotspots} loading={false} />
    );
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.getByTestId('tile-layer')).toBeInTheDocument();
    expect(screen.getByTestId('marker-cluster')).toBeInTheDocument();
    const markers = screen.getAllByTestId('marker');
    expect(markers).toHaveLength(2);
  });

  test('shows loading skeleton while fetching', () => {
    renderWithProviders(
      <HotspotMapView hotspots={null} loading={true} />
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading hotspot map')).toBeInTheDocument();
  });

  test('shows empty state when no data', () => {
    renderWithProviders(
      <HotspotMapView hotspots={[]} loading={false} />
    );
    expect(screen.getByText('No location data available')).toBeInTheDocument();
  });

  test('shows toggle button on map with data', () => {
    renderWithProviders(
      <HotspotMapView hotspots={sampleHotspots} loading={false} />
    );
    expect(screen.getByText('Show Heatmap')).toBeInTheDocument();
  });

  test('shows retry button on error', () => {
    const onRetry = vi.fn();
    renderWithProviders(
      <HotspotMapView hotspots={null} loading={false} error="Failed to load" onRetry={onRetry} />
    );
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
