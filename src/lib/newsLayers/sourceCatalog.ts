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
  { layerId: "intel-hotspots",      source: "GDELT Geo 2.0",          url: "https://api.gdeltproject.org/api/v2/geo/geo",            cadence: "Near real-time",  attribution: "GDELT Project",          notes: "Keyword-based hotspot events." },
  { layerId: "conflict-zones",      source: "GDELT Geo 2.0",          url: "https://api.gdeltproject.org/api/v2/geo/geo",            cadence: "Near real-time",  attribution: "GDELT Project",          notes: "Conflict query events." },
  { layerId: "military-activity",   source: "adsb.lol military feed", url: "https://api.adsb.lol/v2/mil",                           cadence: "Seconds",         attribution: "adsb.lol contributors",  notes: "Military aircraft activity." },
  { layerId: "flight-delays",       source: "OpenSky Network",        url: "https://opensky-network.org/api",                       cadence: "2 minutes",       attribution: "OpenSky Network",        notes: "Flight density as delay proxy (4°×4° grid cells)." },
  { layerId: "protests",            source: "GDELT Geo 2.0",          url: "https://api.gdeltproject.org/api/v2/geo/geo",            cadence: "2 minutes",       attribution: "GDELT Project",          notes: "Protest/demonstration events." },
  { layerId: "ucdp-events",         source: "GDELT Geo 2.0",          url: "https://api.gdeltproject.org/api/v2/geo/geo",            cadence: "6 hours",         attribution: "GDELT Project",          notes: "UCDP-correlated conflict events via GDELT." },
  { layerId: "weather-alerts",      source: "NOAA/NWS Alerts",        url: "https://api.weather.gov/alerts/active",                 cadence: "3 minutes",       attribution: "NOAA / NWS",             notes: "US active weather alert polygons/points." },
  { layerId: "natural-events",      source: "NASA EONET",             url: "https://eonet.gsfc.nasa.gov/api/v3/events",             cadence: "Near real-time",  attribution: "NASA Earth Observatory", notes: "Open natural events feed." },
  { layerId: "fires",               source: "NASA EONET Wildfires",   url: "https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open", cadence: "Near real-time", attribution: "NASA Earth Observatory", notes: "Wildfire subset." },
  { layerId: "climate-anomalies",   source: "NASA GIBS WMTS",         url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best",    cadence: "Daily",           attribution: "NASA GIBS",              notes: "MODIS Land Surface Temperature raster anomaly layer." },
  { layerId: "earthquakes-live",    source: "USGS Earthquake Hazards",url: "https://earthquake.usgs.gov/earthquakes/feed/",         cadence: "Minutes",         attribution: "USGS",                   notes: "Live seismic events from USGS feed." },
  { layerId: "disaster-alerts",     source: "GDACS",                  url: "https://www.gdacs.org/xml/rss_24h.xml",                 cadence: "5 minutes",       attribution: "GDACS / ECHO",           notes: "Global Disaster Alert & Coordination System events." },
  { layerId: "piracy-incidents",    source: "GDELT Geo 2.0",          url: "https://api.gdeltproject.org/api/v2/geo/geo",            cadence: "2 hours",         attribution: "GDELT Project",          notes: "Maritime piracy/hijack events via GDELT theme query." },
  { layerId: "space-launches",      source: "The Space Devs (LL2)",   url: "https://ll.thespacedevs.com/2.3.0/launch/previous/",   cadence: "1 hour",          attribution: "The Space Devs",         notes: "Recent orbital launches via Launch Library 2 free tier." },
  { layerId: "cyber-incidents",     source: "GDELT Geo 2.0",          url: "https://api.gdeltproject.org/api/v2/geo/geo",            cadence: "2 minutes",       attribution: "GDELT Project",          notes: "Cyber attack / ransomware events via GDELT theme query." },
  { layerId: "election-events",     source: "GDELT Geo 2.0",          url: "https://api.gdeltproject.org/api/v2/geo/geo",            cadence: "2 hours",         attribution: "GDELT Project",          notes: "Election, vote, referendum events via GDELT." },
  { layerId: "disease-outbreaks",   source: "GDELT Geo 2.0",          url: "https://api.gdeltproject.org/api/v2/geo/geo",            cadence: "1 hour",          attribution: "GDELT Project",          notes: "Disease outbreak/epidemic events via GDELT." },

  // Static snapshot layers
  { layerId: "military-bases",      source: "WorldView snapshot",     url: "/data/news-layers/military-bases.geojson",              cadence: "Project versioned", attribution: "OpenStreetMap / public datasets", notes: "Major military installations worldwide." },
  { layerId: "nuclear-sites",       source: "WorldView snapshot",     url: "/data/news-layers/nuclear-sites.geojson",               cadence: "Project versioned", attribution: "IAEA / NTI / public datasets",   notes: "Nuclear power plants and research reactors." },
  { layerId: "gamma-irradiators",   source: "WorldView snapshot",     url: "/data/news-layers/gamma-irradiators.geojson",           cadence: "Project versioned", attribution: "IAEA / NRC public datasets",     notes: "Industrial gamma irradiator facilities." },
  { layerId: "spaceports",          source: "WorldView snapshot",     url: "/data/news-layers/spaceports.geojson",                  cadence: "Project versioned", attribution: "Wikipedia / FAA / public",       notes: "Orbital launch pads and spaceports." },
  { layerId: "undersea-cables",     source: "WorldView snapshot",     url: "/data/news-layers/undersea-cables.geojson",             cadence: "Project versioned", attribution: "TeleGeography / public",         notes: "Submarine telecommunications cables." },
  { layerId: "pipelines",           source: "WorldView snapshot",     url: "/data/news-layers/pipelines.geojson",                   cadence: "Project versioned", attribution: "EIA / public datasets",          notes: "Major oil and gas pipelines." },
  { layerId: "ai-data-centers",     source: "WorldView snapshot",     url: "/data/news-layers/ai-data-centers.geojson",             cadence: "Project versioned", attribution: "Public reporting / company filings","notes": "Large-scale AI/cloud data center facilities." },
  { layerId: "trade-routes",        source: "WorldView snapshot",     url: "/data/news-layers/trade-routes.geojson",                cadence: "Project versioned", attribution: "IMO / public datasets",          notes: "Major global maritime trade routes." },
  { layerId: "displacement-flows",  source: "WorldView snapshot",     url: "/data/news-layers/displacement-flows.geojson",          cadence: "Project versioned", attribution: "UNHCR / IOM / public",           notes: "Major refugee and displacement corridors." },
  { layerId: "strategic-waterways", source: "WorldView snapshot",     url: "/data/news-layers/strategic-waterways.geojson",         cadence: "Project versioned", attribution: "Public / USNI datasets",         notes: "Strategically significant maritime waterways." },
  { layerId: "economic-centers",    source: "WorldView snapshot",     url: "/data/news-layers/economic-centers.geojson",            cadence: "Project versioned", attribution: "World Bank / public datasets",   notes: "Major global economic hubs." },
  { layerId: "critical-minerals",   source: "WorldView snapshot",     url: "/data/news-layers/critical-minerals.geojson",           cadence: "Project versioned", attribution: "USGS / public datasets",         notes: "Key critical mineral deposits and processing sites." },
  { layerId: "volcanoes",           source: "WorldView snapshot",     url: "/data/news-layers/volcanoes.geojson",                   cadence: "Project versioned", attribution: "Smithsonian GVP / USGS",         notes: "Holocene volcanoes and active volcanic systems." },
  { layerId: "ports",               source: "WorldView snapshot",     url: "/data/news-layers/ports.geojson",                       cadence: "Project versioned", attribution: "NOAA / public datasets",         notes: "Major international commercial seaports." },
  { layerId: "internet-exchanges",  source: "WorldView snapshot",     url: "/data/news-layers/internet-exchanges.geojson",          cadence: "Project versioned", attribution: "PeeringDB / public",             notes: "Internet exchange points (IXPs)." },
  { layerId: "sanctions-entities",  source: "WorldView snapshot",     url: "/data/news-layers/sanctions-entities.geojson",          cadence: "Project versioned", attribution: "US OFAC / UN Security Council",  notes: "Country-level sanctioned state entities (US, EU, UN regimes)." },
  { layerId: "radiation-stations",  source: "WorldView snapshot",     url: "/data/news-layers/radiation-stations.geojson",          cadence: "Project versioned", attribution: "IAEA / EPA / CTBTO / national agencies", notes: "Fixed environmental radiation monitoring stations." },
  { layerId: "maritime-chokepoints",source: "WorldView snapshot",     url: "/data/news-layers/maritime-chokepoints.geojson",        cadence: "Project versioned", attribution: "USNI / EIA / public sources",    notes: "Key global maritime chokepoints with throughput data." },
  { layerId: "refugee-camps",       source: "WorldView snapshot",     url: "/data/news-layers/refugee-camps.geojson",               cadence: "Project versioned", attribution: "UNHCR / public datasets",        notes: "Major UNHCR-registered refugee settlements and camps." },
  { layerId: "water-stress-zones",  source: "WorldView snapshot",     url: "/data/news-layers/water-stress-zones.geojson",          cadence: "Project versioned", attribution: "WRI Aqueduct / public",          notes: "Regions of extreme or high water stress (simplified polygons)." },
  { layerId: "arms-embargo-zones",  source: "WorldView snapshot",     url: "/data/news-layers/arms-embargo-zones.geojson",          cadence: "Project versioned", attribution: "UN Security Council",            notes: "Areas under UN arms embargo resolutions (simplified polygons)." },
];
