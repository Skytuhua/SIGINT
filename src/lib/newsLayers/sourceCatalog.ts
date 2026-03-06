export interface NewsLayerSourceNote {
  layerId: string;
  source: string;
  url: string;
  cadence: string;
  attribution: string;
  notes: string;
}

export const NEWS_LAYER_SOURCE_CATALOG: NewsLayerSourceNote[] = [
  // Dynamic / real-time layers
  { layerId: "intel-hotspots",      source: "Configurable GeoJSON feed", url: "INTEL_HOTSPOTS_URL",                                     cadence: "Configured",       attribution: "External provider",        notes: "Intel/security hotspot events from a configurable GeoJSON endpoint (INTEL_HOTSPOTS_URL)." },
  { layerId: "conflict-zones",      source: "GDELT Geo 2.0 + UCDP GED", url: "/api/news/layers/conflict-zones", cadence: "2 min (120s TTL)", attribution: "GDELT Project / UCDP", notes: "Polygon conflict zones from GDELT events, GDELT Geo, and UCDP GED. Situational awareness from public reporting and structured datasets—not intelligence or targeting guidance." },
  { layerId: "military-activity",   source: "adsb.lol military feed", url: "https://api.adsb.lol/v2/mil",                           cadence: "Seconds",         attribution: "adsb.lol contributors",  notes: "Military aircraft activity." },
  { layerId: "ucdp-events",         source: "UCDP GED",               url: "https://ucdp.uu.se/downloads/index.html",                cadence: "Annual / point releases", attribution: "Uppsala Conflict Data Program (UCDP)", notes: "Verified (fatality-coded) organized violence events. Research-grade data from the UCDP Georeferenced Event Dataset (GED). Each event requires at least one recorded fatality." },
  { layerId: "space-launches",      source: "The Space Devs (LL2)",   url: "https://ll.thespacedevs.com/2.3.0/launch/previous/",   cadence: "1 hour",          attribution: "The Space Devs",         notes: "Recent orbital launches via Launch Library 2 free tier." },
  { layerId: "cyber-incidents",     source: "GDELT Geo 2.0",          url: "https://api.gdeltproject.org/api/v2/geo/geo",            cadence: "2 minutes",       attribution: "GDELT Project",          notes: "Cyber attack / ransomware events via GDELT theme query." },
  { layerId: "election-events",     source: "GDELT Geo 2.0",          url: "https://api.gdeltproject.org/api/v2/geo/geo",            cadence: "2 hours",         attribution: "GDELT Project",          notes: "Election, vote, referendum events via GDELT." },

  // Static snapshot layers
  { layerId: "military-bases",      source: "WorldView snapshot",     url: "/data/news-layers/military-bases.geojson",              cadence: "Project versioned", attribution: "OpenStreetMap / public datasets", notes: "Major military installations worldwide." },
  { layerId: "nuclear-sites",       source: "WorldView snapshot",     url: "/data/news-layers/nuclear-sites.geojson",               cadence: "Project versioned", attribution: "IAEA / NTI / public datasets",   notes: "Nuclear power plants and research reactors." },
  { layerId: "ai-data-centers",     source: "Wikidata SPARQL + OSM Overpass API", url: "/api/news/layers/ai-data-centers", cadence: "4 hours", attribution: "Wikidata (CC0) / OpenStreetMap contributors (ODbL)", notes: "AI/cloud data center clusters from Wikidata entities and OSM facilities. Deterministic confidence and importance scoring. Clusters merge nearby sites within 50 km." },
  { layerId: "trade-routes",        source: "WorldView snapshot",     url: "/data/news-layers/trade-routes.geojson",                cadence: "Project versioned", attribution: "IMO / public datasets",          notes: "Major global maritime trade routes." },
  { layerId: "economic-centers",    source: "Wikidata SPARQL + OSM Overpass + World Bank API", url: "/api/news/layers/economic-centers", cadence: "4 hours", attribution: "Wikidata (CC0) / OpenStreetMap contributors (ODbL) / World Bank Open Data (CC BY 4.0)", notes: "Major global economic hubs scored by finance infrastructure, trade gateway presence, urban scale, and country GDP. Up to 300 hubs, min score threshold applied server-side." },
  { layerId: "critical-minerals",   source: "WorldView snapshot",     url: "/data/news-layers/critical-minerals.geojson",           cadence: "Project versioned", attribution: "USGS / public datasets",         notes: "Key critical mineral deposits and processing sites." },
  { layerId: "internet-exchanges",  source: "WorldView snapshot",     url: "/data/news-layers/internet-exchanges.geojson",          cadence: "Project versioned", attribution: "PeeringDB / public",             notes: "Internet exchange points (IXPs)." },
  { layerId: "sanctions-entities",  source: "OFAC SDN + UN Consolidated + EU FSF + UK Sanctions List", url: "/api/news/sanctions/entities", cadence: "Daily (24h cache)", attribution: "US Treasury OFAC / UN Security Council / EU / UK Gov", notes: "Sanctioned individuals, organizations, vessels, aircraft from official bulk downloads with hybrid live-fetch + snapshot fallback." },
  { layerId: "refugee-camps",       source: "WorldView snapshot",     url: "/data/news-layers/refugee-camps.geojson",               cadence: "Project versioned", attribution: "UNHCR / public datasets",        notes: "Major UNHCR-registered refugee settlements and camps." },
  { layerId: "arms-embargo-zones",  source: "Official UN/EU/UK/US sources + Wikidata fallback", url: "/api/news/layers/arms-embargo-zones", cadence: "Daily (24h cache)", attribution: "UN / EU / UK / US + Wikidata", notes: "Country-level arms embargo zones from official sources with Wikidata SPARQL fallback." },
];
