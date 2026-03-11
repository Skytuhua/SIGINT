# SIGINT

Real-time geospatial intelligence platform — three workspaces (OPS, NEWS, MARKET) unified in a single console for monitoring global events, conflicts, markets, and live feeds.

![Next.js](https://img.shields.io/badge/Next.js-14.2-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript)
![CesiumJS](https://img.shields.io/badge/CesiumJS-1.120-green)
![React](https://img.shields.io/badge/React-18.3-61dafb?logo=react)
![License](https://img.shields.io/badge/license-MIT-brightgreen)

---

## Workspaces

### OPS — 3D Globe & Operations

CesiumJS-powered 3D globe with 20+ toggleable data layers and a draggable panel dashboard.

- Live commercial & military flight tracking (OpenSky / ADS-B Exchange)
- Satellite positions with SGP4 propagation via Web Workers
- Disaster alerts (GDACS) with magnitude filtering
- GPS interference / jamming zone detection
- Trade route visualization with disruption signals
- CCTV mosaic wall — categorized YouTube webcam feeds with single-focus view
- KPI panel, flight table, earthquake table, satellite list, space weather alerts
- Visual presets: Normal, CRT scanline, Night Vision (NVG), Thermal (FLIR)
- Google Maps-style custom navigation (pan, orbit, zoom)

### NEWS — Intelligence & Geospatial Feeds

Multi-source news aggregation with MapLibre/Leaflet map layers and 13+ category feeds.

- Aggregation from NewsAPI, GDELT, ACLED, HackerNews, RSS, Wikimedia stream, SEC, YouTube
- Full-text search with boolean query parser and inverted index
- 22+ GeoJSON layers: conflict zones, sanctions entities, nuclear sites, military bases, trade routes, undersea cables, pipelines, ports, volcanoes, refugee camps, AI data centers, critical minerals, arms embargoes, and more
- Compliance panel: OFAC / UN / EU / UK sanctions with entity profiles
- Country detail profiles (World Bank indicators + Wikidata enrichment)
- Live video grid from YouTube news channels
- Prediction markets (Polymarket)
- AI article summarization (OpenAI)
- Daily briefing modal

### MARKET — Financial Analytics

47+ panels across 7 tabs covering global markets end-to-end.

| Tab | Panels |
|-----|--------|
| Overview | Global snapshot, market breadth, sector rotation, top movers, volatility, market regime, heatmap |
| Equities | Analyst ratings, earnings calendar, short interest, insider flows, fundamentals, stock comparison, equity watchlist, IPO calendar, dividend calendar |
| FX | Currency matrix, carry trade, EM currencies, converter, FX heatmap |
| Crypto | Market overview, on-chain metrics, charts |
| Commodities | Board, storage levels, shipping tracker |
| Rates | Yield curves, Fed funds futures, central bank decisions, credit spreads, breakeven inflation |
| Screener | Dynamic stock screener with technical indicators |

Additional: options chain/flow, order book, order ticket, correlation matrix, interactive charting (TradingView), market news tape, ticker bar, daily lineup.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14.2, React 18.3, TypeScript 5.5 |
| 3D Globe | CesiumJS 1.120 |
| Maps | MapLibre GL 5.19, Leaflet 1.9 |
| State | Zustand 4.5 (persist + subscribeWithSelector) |
| Layout | react-grid-layout, @dnd-kit |
| Styling | Tailwind CSS 3.4 |
| Tables | TanStack React Table + React Virtual |
| Workers | satellite.js (SGP4), traffic simulation |
| Validation | Zod 3.23 |
| Streaming | hls.js |
| LLM | @mlc-ai/web-llm (browser), OpenAI (server) |
| Package Manager | pnpm |

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm

### Install

```bash
git clone https://github.com/Skytuhua/SIGINT.git
cd SIGINT
pnpm install
```

### Environment

```bash
cp .env.example .env.local
```

**Required:**

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_CESIUM_ION_TOKEN` | Cesium terrain & 3D tiles |
| `NEXT_PUBLIC_MAPTILER_KEY` | MapTiler basemaps |

**Optional (enable full functionality):**

| Variable | Purpose |
|----------|---------|
| `YOUTUBE_API_KEY` | Live video feeds (falls back to RSS) |
| `OPENAI_API_KEY` | Article summarization |
| `NEWS_API_KEY` | NewsAPI articles |
| `OPENSKY_USERNAME` / `OPENSKY_PASSWORD` | Flight data |
| `ADSBX_COMMERCIAL_URL` / `ADSBX_MILITARY_URL` | Military aircraft |
| `NEXT_PUBLIC_FREE_LLM_BASE_URL` | Free LLM service |
| `INTEL_HOTSPOTS_URL` | Intel hotspot data |

See [.env.example](.env.example) for the full list.

### Run

```bash
pnpm dev          # http://localhost:3000
pnpm build        # Production build
pnpm start        # Start production server
pnpm test         # Run tests (vitest)
```

---

## Project Structure

```
src/
├── app/
│   ├── api/                  # 40+ API routes
│   │   ├── cctv/             # CCTV proxy & search
│   │   ├── market/           # Quotes, movers, earnings, historical, news
│   │   ├── news/             # ACLED, GDELT, sanctions, layers, RSS, search, stream
│   │   ├── earthquakes/      # USGS earthquake data
│   │   ├── gdacs/            # Disaster alerts
│   │   ├── military/         # Military flight tracking
│   │   ├── opensky/          # Commercial flights
│   │   ├── satellites/       # Satellite TLE data
│   │   └── space-weather/    # Solar activity
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── SIGINTApp.tsx         # Root shell — OPS / NEWS / MARKET workspace routing
│   ├── CesiumGlobe.tsx       # 3D globe (browser-only, ~1300 lines)
│   ├── dashboard/            # OPS panels, charts, controls, inspector, data table
│   ├── market/               # 47+ financial panels, 7 tabs, shared utilities
│   ├── news/                 # News panels, detail cards, maps, feeds, compliance
│   └── ui/                   # HUD, layer bar, left/right panels, style presets
├── config/                   # Feature flags, CCTV categories, news sources, RSS, LLM
├── lib/
│   ├── cesium/               # Viewer init, layers, navigation, GLSL post-processing
│   ├── news/                 # Search engine, categorization, streaming
│   ├── newsLayers/           # GeoJSON layer catalog, MapLibre & Leaflet renderers
│   ├── server/               # Server-only: news providers, sanctions, CCTV, Invidious
│   ├── runtime/              # Fetch wrappers, persistent feed cache (IndexedDB)
│   ├── dashboard/            # Dashboard types & selectors
│   ├── providers/            # Zod schemas for all data types
│   └── llm/                  # LLM integration
├── store/                    # Zustand global store
├── workers/                  # Web Workers (satellite propagation, traffic sim)
└── data/                     # Static data (market glossary)

public/
├── cesium/                   # CesiumJS static assets
└── data/
    ├── news-layers/          # 22+ GeoJSON layer files
    ├── cctv_sources.json     # Curated YouTube camera feeds
    └── ne_*.geojson          # Natural Earth boundaries
```

---

## Data Sources

| Source | Data |
|--------|------|
| OpenSky Network | Commercial flight positions |
| ADS-B Exchange | Military aircraft tracking |
| GDACS | Disaster alerts |
| USGS | Earthquake data |
| GDELT | Global event data |
| ACLED | Armed conflict events |
| UCDP | Conflict zone boundaries |
| NewsAPI | News articles |
| CoinGecko | Crypto market data |
| Polymarket | Prediction markets |
| SEC EDGAR | Financial filings |
| World Bank | Economic indicators |
| OFAC / UN / EU / UK | Sanctions lists |
| Wikidata | Entity enrichment |
| YouTube / Invidious | Live video streams |
| OpenStreetMap / Overpass | Geospatial queries |
| NOAA / SWPC | Space weather |

---

## Architecture

- **Browser-only Cesium** — all CesiumJS code loads client-side via dynamic imports, no SSR
- **Web Workers** — satellite propagation (SGP4) and traffic simulation offloaded from main thread
- **Zustand store** — single store with selective subscriptions for reactive layer rendering
- **GLSL post-processing** — custom shader stages for CRT, NVG, FLIR visual modes
- **Pluggable map renderers** — shared GeoJSON layer catalog with MapLibre and Leaflet backends
- **Preload system** — parallel bundle warmup for heavy components before first render
- **Persistent caching** — IndexedDB-backed feed cache with localStorage metadata
- **SSRF protection** — server-side URL validation for proxy endpoints

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` / `2` / `3` | Switch workspace (OPS / NEWS / MARKET) |
| `Ctrl+I` | Toggle inspector drawer |
| `Ctrl+Shift+R` | Refresh all feeds |
| `Ctrl+.` | Toggle hotkey overlay |
| Scroll wheel | Zoom globe / scroll panels |

---

## License

MIT
