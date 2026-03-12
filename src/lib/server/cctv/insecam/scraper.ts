import type { CctvCamera } from "../../../providers/types";
import { lookupCameraCoords } from "./cityCoords";
import { countryCodeToRegion } from "./regionMap";

const INSECAM_BASES = [
  "https://www.insecam.org",
  "http://www.insecam.org",
] as const;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.insecam.org/",
  DNT: "1",
  "Upgrade-Insecure-Requests": "1",
};

interface InsecamRawCamera {
  id: string;
  streamUrl: string;
  city: string;
  country: string;
  countryCode: string;
  manufacturer: string;
}

// Countries to scrape — trimmed for serverless reliability
const COUNTRIES_TO_SCRAPE = [
  // Americas
  "US", "CA", "BR", "MX",
  // Europe
  "DE", "IT", "FR", "GB", "RU", "NL", "CZ", "ES", "NO", "PL", "CH",
  // Asia
  "JP", "KR", "TW", "IN", "TH",
  // Mideast
  "TR", "IL",
  // Africa
  "ZA",
  // Oceania
  "AU",
];

const BATCH_SIZE = 3;

/**
 * Scrape a single insecam listing page (any URL) and extract camera entries.
 */
function parseInsecamHtml(html: string): InsecamRawCamera[] {
  const cameras: InsecamRawCamera[] = [];

  const itemRe =
    /<a[^>]*href="\/en\/view\/(\d+)\/"[^>]*title="Live camera in ([^"]+)"[\s\S]*?<img[^>]*src="([^"]+)"[^>]*title="Live camera (\w[\w-]*) in[^"]*"/g;

  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(html)) !== null) {
    const [, id, locationStr, rawStreamUrl, manufacturer] = match;

    // Location format: "Country, City" but country can contain commas
    // e.g. "Korea, Republic of, Seoul" → country="Korea, Republic of", city="Seoul"
    const parts = locationStr.split(",").map((s) => s.trim());
    const city = parts.length > 1 ? (parts[parts.length - 1] || "Unknown") : "Unknown";
    const country = parts.length > 1 ? parts.slice(0, -1).join(", ") : (parts[0] || "Unknown");

    let streamUrl = rawStreamUrl
      .replace(/&amp;amp;/g, "&")
      .replace(/&amp;/g, "&");
    streamUrl = streamUrl.replace("COUNTER", String(Date.now()));

    cameras.push({ id, streamUrl, city, country, countryCode: "", manufacturer });
  }

  return cameras;
}

async function fetchInsecamUrl(url: string): Promise<InsecamRawCamera[]> {
  // Try HTTPS first (some hosts block plain HTTP from datacenters), then HTTP
  for (const base of INSECAM_BASES) {
    const resolvedUrl = url.replace(/^https?:\/\/www\.insecam\.org/, base);
    try {
      const resp = await fetch(resolvedUrl, {
        headers: BROWSER_HEADERS,
      });
      if (!resp.ok) continue;
      const html = await resp.text();
      const cameras = parseInsecamHtml(html);
      if (cameras.length > 0) return cameras;
    } catch {
      // Try next base URL
    }
  }
  return [];
}

export async function scrapeInsecamPage(page: number): Promise<InsecamRawCamera[]> {
  return fetchInsecamUrl(`${INSECAM_BASES[0]}/en/byrating/?page=${page}`);
}

// Country name → ISO code lookup (covers insecam's most common countries)
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  "united states": "US", japan: "JP", italy: "IT", germany: "DE",
  "russian federation": "RU", austria: "AT", france: "FR",
  "czech republic": "CZ", "korea, republic of": "KR", romania: "RO",
  switzerland: "CH", norway: "NO", "taiwan, province of": "TW",
  poland: "PL", canada: "CA", sweden: "SE", netherlands: "NL",
  spain: "ES", "united kingdom": "GB", denmark: "DK", ukraine: "UA",
  serbia: "RS", bulgaria: "BG", india: "IN", slovakia: "SK",
  belgium: "BE", finland: "FI", "south africa": "ZA", greece: "GR",
  turkey: "TR", ireland: "IE", hungary: "HU",
  "bosnia and herzegovina": "BA", indonesia: "ID", "new zealand": "NZ",
  egypt: "EG", malaysia: "MY", argentina: "AR", "hong kong": "HK",
  thailand: "TH", australia: "AU", slovenia: "SI", lithuania: "LT",
  china: "CN", brazil: "BR", israel: "IL", "viet nam": "VN",
  kazakhstan: "KZ", armenia: "AM", moldova: "MD",
  "moldova, republic of": "MD", "faroe islands": "FO", honduras: "HN",
  chile: "CL", belarus: "BY", mexico: "MX", estonia: "EE",
  iceland: "IS", angola: "AO", panama: "PA", ecuador: "EC",
  guam: "GU", pakistan: "PK", bangladesh: "BD", colombia: "CO",
  syria: "SY", peru: "PE", "cayman islands": "KY", tanzania: "TZ",
  nicaragua: "NI", taiwan: "TW", korea: "KR", russia: "RU",
  "south korea": "KR",
};

function resolveCountryCode(country: string): string {
  return COUNTRY_NAME_TO_CODE[country.toLowerCase()] ?? "";
}

/**
 * Scrape insecam by country for regional diversity, plus top-rated pages.
 * Scrapes in parallel batches to avoid long sequential wait times.
 */
export async function scrapeInsecamCameras(): Promise<CctvCamera[]> {
  // Build list of URLs: page 1 of each country + 3 top-rated pages
  const urls = COUNTRIES_TO_SCRAPE.map(
    (cc) => `${INSECAM_BASES[0]}/en/bycountry/${cc}/?page=1`,
  );
  for (let p = 1; p <= 3; p++) {
    urls.push(`${INSECAM_BASES[0]}/en/byrating/?page=${p}`);
  }

  // Scrape in parallel batches
  const allRaw: InsecamRawCamera[] = [];
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((u) => fetchInsecamUrl(u)));
    for (const cams of results) allRaw.push(...cams);
  }

  // Dedup by camera ID
  const seen = new Set<string>();
  const unique: InsecamRawCamera[] = [];
  for (const raw of allRaw) {
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);
    unique.push(raw);
  }

  return unique.map(rawToCctvCamera);
}

function rawToCctvCamera(raw: InsecamRawCamera): CctvCamera {
  const countryCode = resolveCountryCode(raw.country);
  const region = countryCodeToRegion(countryCode);
  const coords = lookupCameraCoords(raw.city, countryCode);

  return {
    id: `insecam_${raw.id}`,
    city: raw.city,
    name: `${raw.city} — ${raw.manufacturer}`,
    lat: coords.lat,
    lon: coords.lon,
    snapshotUrl: `/api/cctv/insecam/proxy?url=${encodeURIComponent(raw.streamUrl)}`,
    streamUrl: raw.streamUrl,
    streamFormat: "JPEG" as const,
    refreshSeconds: 5,
    region,
    tags: ["insecam", raw.manufacturer.toLowerCase()],
    section: raw.country,
  };
}

/**
 * Search insecam.org by city name and return matching cameras.
 */
export async function searchInsecamByCity(query: string): Promise<CctvCamera[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const citySlug = encodeURIComponent(trimmed);
  const raw = await fetchInsecamUrl(`${INSECAM_BASES[0]}/en/bycity/${citySlug}/?page=1`);

  // Dedup
  const seen = new Set<string>();
  const unique: InsecamRawCamera[] = [];
  for (const cam of raw) {
    if (seen.has(cam.id)) continue;
    seen.add(cam.id);
    unique.push(cam);
  }

  return unique.map(rawToCctvCamera);
}
