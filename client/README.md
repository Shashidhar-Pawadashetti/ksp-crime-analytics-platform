# KSP Crime Analytics \u2014 Frontend

React 19 + Vite 8 + Tailwind CSS 4 UI for the KSP Crime Analytics Platform.

## Views

| View | Route | Description |
|------|-------|-------------|
| **Chat** | `/chat` | Conversational AI interface with session memory, cited answers, and evidence panel |
| **Dashboard** | `/dashboard` | Analytics dashboard with D3.js charts (crime trend, breakdown, location, seasonal), summary KPI cards, risk-ranked persons table, and Leaflet hotspot map |
| **Graph** | `/graph` | Network graph visualization using Cytoscape.js with interactive layout (cose), degree-based node sizing, hop-based opacity, and edge type filtering |
| **Person Search** | `/graph?search=...` | Entity resolution search and person profile lookup |

## Dashboard Components

The analytics dashboard (`src/components/Dashboard/`) includes:

| Component | Description |
|-----------|-------------|
| `DashboardView` | Main orchestrator \u2014 mounts FilterBar, SummaryCards, chart grid, RiskRankedView |
| `FilterBar` | Time period, district, and crime type dropdown filters |
| `SummaryCards` | KPI row: Total Cases, Crime Categories, Districts, Peak Period |
| `GridLayout` | Responsive CSS grid (1-col mobile, 2-col desktop) with full-width spans for trend and seasonal charts |
| `ChartCard` | Wrapper with title, loading skeleton, error state with retry |
| `charts/LineChart` | D3 line with tick culling, -35\u00b0 rotation for dense data, hover tooltip |
| `charts/PieChart` | D3 donut with larger radius, compact legend, percentage tooltip |
| `charts/HorizontalBarChart` | D3 sorted horizontal bars for location breakdown with rank badges |
| `charts/BarChart` | D3 vertical bars with hover tooltip and enter animation |
| `charts/SeasonalPatterns` | D3 dual-panel: aggregated monthly bars + weekday bars with auto-generated insight annotations (peak month, weekend ratio, seasonal range) |
| `risk/RiskRankedView` | Scrollable table of persons ranked by risk score with severity badges |
| `hotspot/HotspotMapView` | Leaflet map with marker clusters for geographic crime distribution |

## Chat Components

| Component | Description |
|-----------|-------------|
| `ChatArea` | Message list with auto-scroll, typing indicator, empty state |
| `ChatInput` | Query input with send button, keyboard submit |
| `MessageBubble` | Message display with intent badge, citations, \u201cView in Dashboard\u201d button for analytical results |
| `EvidencePanel` | Source citation panel with CaseMasterID references |
| `CitationLink` | Clickable source citation linking to case details |

## Graph Components

| Component | Description |
|-----------|-------------|
| `GraphView` | Cytoscape.js canvas with legend, skeleton loading, error state. Layout: `cose` (built-in) with small-graph `grid` fallback |
| `PersonSearch` | Search input with autocomplete for person lookup |
| `GraphLegend` | Edge type legend (Accused In, Victim In, Filed, Co-Accused) |
| `GraphSkeleton` | Loading placeholder for graph view |

## Tech Stack

| Dependency | Purpose |
|-----------|---------|
| React 19 | UI framework |
| Vite 8 | Build tool with HMR |
| Tailwind CSS 4 | Utility-first styling with custom design tokens (`--color-accent`, `--color-foreground`, etc.) |
| D3.js 7 | Chart visualizations (Line, Pie, Bar, HorizontalBar, Heatmap, Area) |
| Cytoscape.js 3 | Network graph rendering with `cose` layout |
| Leaflet + react-leaflet | Hotspot map with marker clustering |
| shadcn/ui (Base UI) | Accessible component primitives (Select, Badge, etc.) |
| Vitest | Test runner (178 tests) |
| Lucide React | Icons |

## Scripts

```bash
npm run dev       # Start dev server (localhost:5173)
npm run build     # Production build to dist/
npm run preview   # Preview production build
npm test          # Run 178 test suites
npm run test:watch  # Watch mode
npm run lint      # Oxlint code linting
```

## API Proxy

The dev server proxies Catalyst API calls through Vite:

| Local path | Proxied to |
|-----------|------------|
| `/__catalyst/*` | Catalyst serverless instance |
| `/baas/*` | Catalyst backend-as-a-service |
| `/api/*` | Catalyst function endpoints |

## Design Tokens

Defined in `src/index.css` via Tailwind `@theme`:

- `--color-accent`: `#1E40AF` (primary blue)
- `--color-accent-hover`: `#3B82F6`
- `--color-cta`: `#D97706` (amber)
- `--color-foreground`: `#1E3A8A`
- `--color-dominant`: `#F8FAFC` (background)
- `--color-surface`: `#FFFFFF` (card backgrounds)
- `--color-border`: `#DBEAFE`
- `--font-heading`: `'Fira Code', monospace`
- `--font-body`: `'Fira Sans', sans-serif`
