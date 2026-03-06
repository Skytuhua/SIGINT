/**
 * Module-level singleton for the country borders GeoJSON (~1.7 MB).
 * The preloader writes here during the loading screen; MapLibreNewsMap reads it
 * on mount — eliminating the duplicate network request.
 */

let _cached: GeoJSON.FeatureCollection | null = null;
let _inflight: Promise<GeoJSON.FeatureCollection | null> | null = null;

export function setCountryBordersCache(data: GeoJSON.FeatureCollection): void {
  _cached = data;
  _inflight = null;
}

export function getCountryBordersCache(): GeoJSON.FeatureCollection | null {
  return _cached;
}

/**
 * Returns the cached GeoJSON immediately if available, otherwise fetches it.
 * Deduplicates concurrent callers — only one network request is ever issued.
 */
export function getOrFetchCountryBorders(
  url = "/data/ne_50m_admin_0_countries.geojson"
): Promise<GeoJSON.FeatureCollection | null> {
  if (_cached) return Promise.resolve(_cached);
  if (_inflight) return _inflight;

  _inflight = fetch(url)
    .then((r) => (r.ok ? (r.json() as Promise<GeoJSON.FeatureCollection>) : null))
    .then((data) => {
      if (data) _cached = data;
      _inflight = null;
      return _cached;
    })
    .catch(() => {
      _inflight = null;
      return null;
    });

  return _inflight;
}
