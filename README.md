# WorldView

WorldView is an intel-style geospatial dashboard built with Next.js + CesiumJS. It renders a 3D globe, tactical UI controls, and pluggable data layers including satellites, flights, earthquakes, traffic simulation, and curated public CCTV mesh.

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`.

## Environment variables

`.env.local`

```bash
NEXT_PUBLIC_CESIUM_ION_TOKEN=
OPENSKY_USERNAME=
OPENSKY_PASSWORD=
MILITARY_PROVIDER_KEY=
```

## Implemented MVP layers

- **3D Tiles / Globe**: Cesium viewer with ion token support and tactical scope viewport.
- **Satellites**: CelesTrak TLE feed proxied by `/api/satellites`, rendered as orbit points and selectable entities.
- **Commercial flights**: OpenSky via `/api/opensky` with server caching + token-bucket limits.
- **Military flights**: `/api/military` mock provider (OFF by default) using normalized aircraft schema.
- **Earthquakes**: USGS 24h GeoJSON through `/api/earthquakes` with magnitude ring markers.
- **Street traffic**: Overpass major roads via `/api/overpass`, drawn as tactical road overlays.
- **CCTV mesh**: Curated list in `data/cctv_sources.json` with local placeholder snapshots.

## Controls

- Layer toggles: left panel
- Style preset (Normal / CRT / NVG / FLIR): right panel
- Detect labels (sparse / full): right panel
- Landmark jumps: **Q/W/E/R/T**
- Entity tracking: click a satellite/flight marker
- Perf debug panel: add `?debug=1`

## Security and compliance

- API keys stay server-side only.
- Route handlers apply in-memory caching and per-IP token-bucket limits.
- Military data provider is opt-in and defaults to mock data.
- CCTV usage must be official public traffic cameras only.

## Data Source Compliance

You are responsible for:
1. Complying with each provider Terms of Service.
2. Supplying your own authorized credentials.
3. Avoiding private camera ingestion.
4. Avoiding re-identification or personal tracking.

WorldView intentionally excludes private camera scraping, individual search, and hidden analytics.


## Troubleshooting

- **Hydration mismatch warning with `webcrx` attribute**: this is usually caused by browser extensions injecting attributes before React hydrates. The app now suppresses root hydration warnings and uses a client-safe HUD clock initialization. If you still see warnings, test in Incognito or disable DOM-modifying extensions for `localhost`.

## Testing

```bash
pnpm test
pnpm build
```

## How it works

1. Tactical UI shell + scoped Cesium viewport.
2. Provider adapters normalize source payloads into app contracts.
3. Cesium entities are refreshed on polling intervals per layer.
4. Post-process style stage swaps shader behavior for CRT/NVG/FLIR.
5. Extension path: add a provider and map payloads into Cesium entity collections.

See `docs/ROADMAP.md` for MVP, v1, v2 milestones.
