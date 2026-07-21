// ksp-crime-analytics-platform/client/src/components/Dashboard/hotspot/HotspotMapView.jsx
//
// Full-page Leaflet hotspot map with marker clustering, toggle between marker
// clusters and density circles, loading skeleton, error state with retry,
// and empty state. Data fetched from the dashboard function /dashboard/hotspots
// endpoint.

import { useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';
import L from 'leaflet';

// Fix default marker icons (MANDATORY for Vite bundler — without this,
// Leaflet default icons show as broken images in production builds).
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

import { useDashboard, useDashboardActions } from '../../../hooks/useDashboard';
import HotspotSkeleton from './HotspotSkeleton';

/**
 * Karnataka center coordinates.
 */
const KARNATAKA_CENTER = [15.3173, 75.7139];

/**
 * Component that re-centers and re-zooms the map when the dataset changes,
 * and calls invalidateSize() to fix initial render sizing issues.
 */
function MapBoundsUpdater({ hotspots }) {
  const map = useMap();

  useEffect(() => {
    // Fix Leaflet container sizing when the view first mounts (Pitfall 5)
    setTimeout(() => {
      map.invalidateSize();
    }, 100);
  }, [map]);

  useEffect(() => {
    if (hotspots && hotspots.length > 0) {
      const bounds = L.latLngBounds(hotspots.map(h => [h.Latitude, h.Longitude]));
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
    }
  }, [hotspots, map]);

  return null;
}

/**
 * Density circles overlay component.
 * Renders semi-transparent SVG circles as a simple heatmap approximation
 * when toggleHeatmap is active (D-21: circle-marker approach).
 */
function DensityCircles({ hotspots }) {
  const map = useMap();

  useEffect(() => {
    if (!hotspots || hotspots.length === 0) return;

    const layer = [];
    hotspots.forEach((h) => {
      const circle = L.circleMarker([h.Latitude, h.Longitude], {
        radius: 14,
        fillColor: '#DC2626',
        fillOpacity: 0.25,
        color: '#1E40AF',
        weight: 0,
      });
      circle.addTo(map);
      layer.push(circle);
    });

    return () => {
      layer.forEach(c => c.removeFrom(map));
    };
  }, [hotspots, map]);

  return null;
}

/**
 * HotspotMapView — full-page Leaflet map.
 *
 * @param {{ hotspots: Array|null, loading?: boolean, error?: string|null, onRetry?: function }} props
 *   If rendered standalone (via App.jsx without DashboardProvider wrapping),
 *   it fetches its own data via useDashboard / useDashboardActions.
 */
export default function HotspotMapView({ hotspots: hotspotsProp, loading: loadingProp, error: errorProp, onRetry: onRetryProp }) {
  // Internal state for standalone usage (when no props passed from parent)
  const { chartData, dispatch } = useDashboard();
  const { fetchChart } = useDashboardActions();
  const [heatmapMode, setHeatmapMode] = useState(false);

  // Use props if provided, otherwise from DashboardContext
  const hotspots = hotspotsProp !== undefined ? hotspotsProp : chartData?.hotspots?.data;
  const isLoading = loadingProp !== undefined ? loadingProp : (chartData?.hotspots?.loading === true);
  const error = errorProp !== undefined ? errorProp : chartData?.hotspots?.error;

  // Fetch hotspot data on mount if not already loaded
  useEffect(() => {
    if (hotspots === null && !isLoading && !error) {
      fetchChart('hotspots');
    }
  }, [hotspots, isLoading, error, fetchChart]);

  const handleRetry = useCallback(() => {
    if (onRetryProp) {
      onRetryProp();
    } else {
      dispatch({ type: 'SET_CHART_DATA', payload: { chart: 'hotspots', data: null } });
      fetchChart('hotspots');
    }
  }, [onRetryProp, dispatch, fetchChart]);

  // Loading state
  if (isLoading) {
    return <HotspotSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-dominant font-body">
        <p className="text-sm text-foreground/70">
          {error || 'Unable to load hotspot data.'}
        </p>
        <button
          onClick={handleRetry}
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          aria-label="Retry loading hotspot data"
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (!hotspots || hotspots.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-dominant font-body">
        <p className="text-sm text-foreground/50">No location data available</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* Toggle button — top-right */}
      <button
        onClick={() => setHeatmapMode(prev => !prev)}
        className="absolute right-3 top-3 z-[1000] rounded-md bg-white px-3 py-1.5 text-xs font-medium text-foreground/80 shadow-md transition-colors hover:bg-secondary"
        aria-label={heatmapMode ? 'Show marker clusters' : 'Show density heatmap'}
        style={{ minWidth: '44px', minHeight: '44px' }}
      >
        {heatmapMode ? 'Show Clusters' : 'Show Heatmap'}
      </button>

      <MapContainer center={KARNATAKA_CENTER} zoom={7} className="h-full w-full" zoomControl={true}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <MapBoundsUpdater hotspots={hotspots} />

        {heatmapMode ? (
          <DensityCircles hotspots={hotspots} />
        ) : (
          <MarkerClusterGroup chunkedLoading>
            {hotspots.map((point, i) => (
              <Marker key={point.CaseMasterID || i} position={[point.Latitude, point.Longitude]}>
                <Popup>
                  <div className="font-body text-xs">
                    <strong className="text-foreground">{point.CrimeGroupName}</strong>
                    <br />
                    <span className="text-foreground/60">{point.CrimeRegisteredDate}</span>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        )}
      </MapContainer>
    </div>
  );
}
