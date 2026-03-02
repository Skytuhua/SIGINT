// News system configuration — curated data sources, channel lists, keyword weights.
// This file is safe to import client-side (no secrets).

import type { YouTubeChannel, NewsCategory, VideoPanelCategory } from "../lib/news/types";

export interface RssFeedSource {
  id: string;
  label: string;
  url: string;
  category: Exclude<NewsCategory, "watchlist" | "filings">;
  region: "global" | "us" | "eu" | "uk" | "asia" | "mena";
  language?: string;
}

export interface CategoryPanelConfig {
  id: string;
  title: string;
  category: NewsCategory;
  dedicatedFeeds?: string[];
  apiEndpoint?: string;
  refreshMs?: number;
  icon?: string;
}

// ---- YouTube live news channels ----

export const NEWS_VIDEO_CHANNELS: YouTubeChannel[] = [
  // Business & Financial (Bloomberg, CNBC)
  { channelId: "UCVTomc35agH1SM6kCKzwW_g", label: "Bloomberg TV", priority: 100, region: "global", categories: ["tech", "business", "financial"] },
  { channelId: "UCtn-u5YH-y5R2Cob8vvpKLg", label: "Reuters", priority: 96, region: "global", categories: ["tech", "business", "general"] },
  { channelId: "UCvJJ_dzjViJCoLf5uKUTwoA", label: "CNBC TV18", priority: 87, region: "asia", categories: ["business", "financial"] },
  // General news
  { channelId: "UCIALMKvObZNtJ6AmdCLP7Lg", label: "AP News", priority: 95, region: "global", categories: ["general"] },
  { channelId: "UCBi2mrWuNuyYy4gbM6fU18Q", label: "ABC News", priority: 90, region: "us", categories: ["general"] },
  { channelId: "UCeY0bbntWzzVIaj2z3QigXg", label: "NBC News", priority: 90, region: "us", categories: ["general"] },
  { channelId: "UCupvZG-5ko_eiXAupbDfxWw", label: "CNN", priority: 88, region: "us", categories: ["general"] },
  { channelId: "UC16niRr50-MSBwiO3YDb3RA", label: "Sky News", priority: 86, region: "uk", categories: ["general"] },
  { channelId: "UCNye-wNBqNL5ZzHSJj3l8Bg", label: "DW News", priority: 84, region: "eu", categories: ["general"] },
  { channelId: "UCHKkHPkL0IePiQMNcFwIpzQ", label: "France 24 EN", priority: 82, region: "eu", categories: ["general"] },
  { channelId: "UCWX3yGbODI3HLiRPFcYIBGg", label: "Al Jazeera EN", priority: 80, region: "mena", categories: ["general"] },
  { channelId: "UCaXkIU1QidjPwiAYu6GcHjg", label: "WION", priority: 74, region: "asia", categories: ["general", "tech"] },
];

/** Live video panel definitions: main category + subcategory (source) choices */
export const LIVE_VIDEO_PANELS: Array<{
  id: string;
  category: VideoPanelCategory;
  title: string;
  subtitle: string;
}> = [
  { id: "news-video-tech", category: "tech", title: "LIVE TECH", subtitle: "Tech & startup news streams" },
  { id: "news-video-business", category: "business", title: "LIVE BUSINESS", subtitle: "Business & markets streams" },
  { id: "news-video-general", category: "general", title: "LIVE NEWS", subtitle: "General news from global sources" },
  { id: "news-video-financial", category: "financial", title: "LIVE MARKETS", subtitle: "Financial & markets streams" },
];

// Backward-compatible export name for existing imports.
export const NEWS_CHANNELS = NEWS_VIDEO_CHANNELS;

// ---- Free RSS text-news feeds ----

export const NEWS_RSS_FEEDS: RssFeedSource[] = [
  { id: "reuters-world", label: "Reuters World", url: "https://feeds.reuters.com/reuters/worldNews", category: "world", region: "global", language: "en" },
  { id: "reuters-business", label: "Reuters Business", url: "https://feeds.reuters.com/reuters/businessNews", category: "markets", region: "global", language: "en" },
  { id: "bbc-world", label: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", category: "world", region: "global", language: "en" },
  { id: "bbc-business", label: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", category: "markets", region: "global", language: "en" },
  { id: "guardian-world", label: "The Guardian World", url: "https://www.theguardian.com/world/rss", category: "world", region: "uk", language: "en" },
  { id: "guardian-business", label: "The Guardian Business", url: "https://www.theguardian.com/business/rss", category: "markets", region: "uk", language: "en" },
  { id: "cnbc-top", label: "CNBC Top News", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", category: "markets", region: "us", language: "en" },
  { id: "npr-world", label: "NPR World", url: "https://feeds.npr.org/1004/rss.xml", category: "world", region: "us", language: "en" },
  { id: "dw-top", label: "DW Top Stories", url: "https://rss.dw.com/rdf/rss-en-top", category: "world", region: "eu", language: "en" },
  { id: "aljazeera-all", label: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", category: "world", region: "mena", language: "en" },
  { id: "techcrunch", label: "TechCrunch", url: "https://techcrunch.com/feed/", category: "startups", region: "global", language: "en" },
  { id: "verge", label: "The Verge", url: "https://www.theverge.com/rss/index.xml", category: "tech", region: "us", language: "en" },
  { id: "ars", label: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", category: "tech", region: "us", language: "en" },
  { id: "wired", label: "Wired", url: "https://www.wired.com/feed/rss", category: "tech", region: "us", language: "en" },
  { id: "coindesk", label: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", category: "crypto", region: "global", language: "en" },
  { id: "krebs", label: "Krebs on Security", url: "https://krebsonsecurity.com/feed/", category: "cyber", region: "us", language: "en" },
  { id: "therecord", label: "The Record", url: "https://therecord.media/feed", category: "cyber", region: "global", language: "en" },
  { id: "venturebeat-ai", label: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/", category: "ai", region: "us", language: "en" },
  { id: "semafor-tech", label: "Semafor Tech", url: "https://www.semafor.com/vertical/tech/rss", category: "tech", region: "global", language: "en" },
  { id: "spacenews", label: "SpaceNews", url: "https://spacenews.com/feed/", category: "space", region: "global", language: "en" },
  { id: "fierce-biotech", label: "Fierce Biotech", url: "https://www.fiercebiotech.com/rss/xml", category: "biotech", region: "us", language: "en" },
  { id: "ft-banking", label: "FT Banking", url: "https://www.ft.com/banking-finance?format=rss", category: "financial", region: "global", language: "en" },
  // Government & Policy
  { id: "hill-policy", label: "The Hill", url: "https://thehill.com/feed/", category: "government", region: "us", language: "en" },
  { id: "politico-top", label: "Politico", url: "https://rss.politico.com/politics-news.xml", category: "government", region: "us", language: "en" },
  { id: "lawfare", label: "Lawfare", url: "https://www.lawfaremedia.org/rss.xml", category: "government", region: "us", language: "en" },
  // Energy
  { id: "oilprice", label: "OilPrice.com", url: "https://oilprice.com/rss/main", category: "energy", region: "global", language: "en" },
  { id: "utility-dive", label: "Utility Dive", url: "https://www.utilitydive.com/feeds/news/", category: "energy", region: "us", language: "en" },
  // Military & Defense
  { id: "defense-one", label: "Defense One", url: "https://www.defenseone.com/rss/", category: "defense", region: "us", language: "en" },
  { id: "breaking-defense", label: "Breaking Defense", url: "https://breakingdefense.com/feed/", category: "defense", region: "us", language: "en" },
  { id: "war-on-rocks", label: "War on the Rocks", url: "https://warontherocks.com/feed/", category: "defense", region: "global", language: "en" },
  // Semiconductors
  { id: "semi-engineering", label: "Semiconductor Engineering", url: "https://semiengineering.com/feed/", category: "semiconductors", region: "global", language: "en" },
  { id: "eetimes", label: "EE Times", url: "https://www.eetimes.com/feed/", category: "semiconductors", region: "global", language: "en" },
  // Finance & Markets
  { id: "seeking-alpha", label: "Seeking Alpha", url: "https://seekingalpha.com/market_currents.xml", category: "financial", region: "us", language: "en" },
  { id: "marketwatch", label: "MarketWatch", url: "https://feeds.marketwatch.com/marketwatch/topstories/", category: "markets", region: "us", language: "en" },
  // AI
  { id: "mit-ai", label: "MIT Tech Review AI", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed", category: "ai", region: "global", language: "en" },
  { id: "the-decoder", label: "The Decoder", url: "https://the-decoder.com/feed/", category: "ai", region: "global", language: "en" },
  // Hacker News (RSS mirror)
  { id: "hn-front", label: "Hacker News", url: "https://hnrss.org/frontpage", category: "tech", region: "global", language: "en" },
];

// ---- Market-moving keyword weights for scoring ----

export const MARKET_MOVING_KEYWORDS: Record<string, number> = {
  // High impact (weight 8)
  "fed rate": 8,
  "interest rate": 8,
  "federal reserve": 8,
  "rate hike": 8,
  "rate cut": 8,
  "emergency": 8,
  "sanctions": 8,
  "war": 8,
  "invasion": 8,
  "collapse": 8,
  // Medium-high impact (weight 5)
  earnings: 5,
  "beat expectations": 5,
  "missed expectations": 5,
  merger: 5,
  acquisition: 5,
  "chapter 11": 5,
  bankruptcy: 5,
  layoffs: 5,
  inflation: 5,
  recession: 5,
  gdp: 5,
  unemployment: 5,
  "trade war": 5,
  tariff: 5,
  // Medium impact (weight 3)
  guidance: 3,
  dividend: 3,
  buyback: 3,
  ipo: 3,
  "secondary offering": 3,
  downgrade: 3,
  upgrade: 3,
  "price target": 3,
  "short squeeze": 3,
  // Crypto
  bitcoin: 3,
  ethereum: 3,
  crypto: 3,
  blockchain: 3,
  // Energy
  opec: 5,
  "oil price": 4,
  "natural gas": 3,
  pipeline: 3,
};

// ---- Category classification keywords ----

export const CATEGORY_KEYWORDS: Record<NewsCategory, string[]> = {
  markets: [
    "stock", "market", "shares", "nasdaq", "nyse", "dow", "s&p", "equity",
    "earnings", "dividend", "fed", "treasury", "bond", "yield", "rate",
    "inflation", "gdp", "economy", "fiscal", "monetary", "central bank",
    "hedge fund", "private equity", "merger", "acquisition",
  ],
  financial: [
    "bank", "banking", "fintech", "payments", "credit", "lending", "mortgage",
    "insurance", "wealth management", "asset management", "investment bank",
    "jpmorgan", "goldman sachs", "visa", "mastercard", "paypal", "stripe",
    "square", "revolut", "neobank", "debit", "wire transfer", "swift",
  ],
  ipo: [
    "ipo", "initial public offering", "public offering", "spac", "direct listing",
    "roadshow", "prospectus", "s-1 filing", "underwriter", "going public",
    "stock debut", "market debut", "newly listed", "pre-ipo",
  ],
  tech: [
    "software", "tech giant", "silicon valley", "apple", "google", "microsoft",
    "meta", "amazon", "tesla", "developer", "open source", "programming",
    "algorithm", "api", "computing", "digital transformation",
  ],
  ai: [
    "artificial intelligence", "ai", "machine learning", "deep learning",
    "neural network", "large language model", "llm", "gpt", "chatgpt",
    "generative ai", "openai", "anthropic", "gemini", "copilot",
    "computer vision", "natural language processing", "nlp", "transformer",
    "diffusion model", "foundation model", "ai safety", "agi",
  ],
  cyber: [
    "cybersecurity", "cyber attack", "hack", "hacker", "data breach",
    "ransomware", "malware", "phishing", "vulnerability", "zero-day",
    "exploit", "firewall", "encryption", "infosec", "threat actor",
    "crowdstrike", "palo alto networks", "fortinet", "ciso",
    "incident response", "apt", "ddos",
  ],
  semiconductors: [
    "semiconductor", "chip", "chipmaker", "wafer", "fab", "foundry",
    "nvidia", "tsmc", "intel", "amd", "qualcomm", "broadcom", "asml",
    "arm holdings", "samsung semiconductor", "microchip", "processor",
    "gpu", "cpu", "soc", "nanometer", "node", "lithography", "eda",
  ],
  cloud: [
    "cloud computing", "cloud infrastructure", "aws", "azure", "gcp",
    "google cloud", "saas", "paas", "iaas", "serverless", "kubernetes",
    "docker", "microservices", "data center", "cloud migration",
    "multi-cloud", "hybrid cloud", "snowflake", "cloudflare", "databricks",
  ],
  startups: [
    "startup", "venture capital", "seed round", "series a", "series b",
    "series c", "fundraise", "unicorn", "accelerator", "incubator",
    "y combinator", "techstars", "pitch deck", "founder", "co-founder",
    "angel investor", "pre-seed", "valuation", "pivot", "scale-up",
  ],
  events: [
    "ces", "mwc", "wwdc", "google i/o", "re:invent", "aws summit",
    "techcrunch disrupt", "web summit", "sxsw", "gdc", "computex",
    "black hat", "def con", "rsa conference", "conference", "summit",
    "keynote", "product launch", "developer conference", "tech event",
  ],
  energy: [
    "oil", "gas", "opec", "petroleum", "pipeline", "refinery", "energy",
    "solar", "wind", "renewable", "nuclear", "coal", "lng", "crude",
  ],
  defense: [
    "military", "defense", "pentagon", "nato", "army", "navy", "air force",
    "weapon", "missile", "drone", "war", "conflict", "soldier", "troops",
    "intelligence", "cia", "nsa", "geopolitical",
  ],
  space: [
    "nasa", "spacex", "satellite", "orbit", "launch", "rocket", "astronaut",
    "space station", "iss", "mars", "moon", "lunar", "blue origin",
    "starlink", "space force", "esa", "isro", "constellation",
    "payload", "reentry", "spacecraft",
  ],
  biotech: [
    "biotech", "pharmaceutical", "pharma", "fda", "clinical trial",
    "drug approval", "crispr", "gene therapy", "mrna", "vaccine",
    "biologic", "oncology", "genomics", "pfizer", "moderna", "eli lilly",
    "abbvie", "pipeline drug", "phase 3", "phase 2", "nih",
  ],
  crypto: [
    "bitcoin", "ethereum", "crypto", "blockchain", "nft", "defi", "web3",
    "digital currency", "stablecoin", "binance", "coinbase",
  ],
  world: [
    "election", "government", "president", "minister", "parliament",
    "united nations", "diplomacy", "sanctions", "treaty", "protest",
    "humanitarian", "climate", "pandemic",
  ],
  local: [
    "city council", "mayor", "county", "state legislature", "traffic", "wildfire",
    "flood", "storm", "school board", "district", "local government", "regional",
  ],
  filings: [
    "10-K", "10-Q", "8-K", "S-1", "filing", "sec", "edgar",
    "annual report", "quarterly report",
  ],
  government: [
    "congress", "senate", "house of representatives", "legislation", "executive order",
    "white house", "state department", "pentagon", "regulation", "policy",
    "bipartisan", "filibuster", "committee", "hearing", "subpoena",
    "cabinet", "attorney general", "federal", "appropriations",
  ],
  watchlist: [],
};

// ---- GDELT theme → our category mapping ----

export const GDELT_THEME_CATEGORY: Record<string, NewsCategory> = {
  ECON: "markets",
  ECON_BANKRUPTCY: "markets",
  ECON_CENTRAL_BANK: "financial",
  ECON_DEBT: "financial",
  ECON_HOUSING: "markets",
  ECON_INFLATION: "markets",
  ECON_TRADE: "markets",
  ECON_IPO: "ipo",
  MILITARY: "defense",
  CRISISLEX_C03_ARMED_CONFLICT: "defense",
  CYBER_ATTACK: "cyber",
  TAX_CRYPTOCURRENCY: "crypto",
  ENERGY: "energy",
  ENV: "world",
  MEDICAL: "biotech",
  SCIENCE_SPACE: "space",
  SCIENCE: "tech",
  UNGP_HUMAN_RIGHTS: "world",
  GOV: "government",
  GOV_ELECTION: "government",
  GOV_LEGISLATION: "government",
  LEADER: "government",
};

// ---- GDELT country code → ISO2 mapping (FIPS to ISO2 for common ones) ----
// GDELT uses FIPS codes; Cesium/standard mapping uses ISO2.

export const GDELT_FIPS_TO_ISO2: Record<string, string> = {
  US: "US", UK: "GB", FR: "FR", GM: "DE", IT: "IT", JA: "JP",
  CH: "CN", IN: "IN", RS: "RU", CA: "CA", AU: "AU", BR: "BR",
  SF: "ZA", MX: "MX", KS: "KR", TW: "TW", IS: "IL", EG: "EG",
  SA: "SA", IR: "IR", SY: "SY", UP: "UA", PL: "PL", SP: "ES",
};

// ---- Default query presets shown in search panel ----

export const PRESET_QUERIES = [
  { label: "Market movers", query: "cat:markets time:24h" },
  { label: "Tech news", query: "cat:tech time:24h" },
  { label: "AI & ML", query: "cat:ai time:24h" },
  { label: "Cybersecurity", query: "cat:cyber time:24h" },
  { label: "Semiconductors", query: "cat:semiconductors time:7d" },
  { label: "Cloud infra", query: "cat:cloud time:7d" },
  { label: "Startups & VC", query: "cat:startups time:7d" },
  { label: "IPOs", query: "cat:ipo time:7d" },
  { label: "Financial", query: "cat:financial time:24h" },
  { label: "Geopolitics", query: "cat:world time:24h" },
  { label: "Energy", query: "cat:energy time:7d" },
  { label: "Defense & conflict", query: "cat:defense time:7d" },
  { label: "Space", query: "cat:space time:7d" },
  { label: "Biotech & pharma", query: "cat:biotech time:7d" },
  { label: "Crypto", query: "cat:crypto time:24h" },
  { label: "Tech events", query: "cat:events time:7d" },
  { label: "Recent 8-K filings", query: "type:filing form:8-K time:7d" },
  { label: "NVDA news", query: "sym:NVDA time:7d" },
  { label: "Fed / rates", query: "\"federal reserve\" OR \"interest rate\" time:24h" },
] as const;

// ---- News globe marker colors by category ----

export const CATEGORY_COLORS: Record<NewsCategory, string> = {
  world: "#ff5630",          // red
  markets: "#36b37e",        // green
  financial: "#26a69a",      // teal
  ipo: "#66bb6a",            // light green
  tech: "#00e5ff",           // cyan
  ai: "#7c4dff",             // deep purple
  cyber: "#ff1744",          // hot red
  semiconductors: "#00bfa5", // teal accent
  cloud: "#448aff",          // indigo
  startups: "#ff9100",       // deep orange
  events: "#e040fb",         // pink-purple
  energy: "#ffab40",         // amber
  defense: "#ea80fc",        // purple
  space: "#304ffe",          // deep blue
  biotech: "#00e676",        // green accent
  crypto: "#76ff03",         // lime
  local: "#4fc3f7",          // blue
  filings: "#7f9fbe",        // accent blue
  government: "#b388ff",      // light purple
  watchlist: "#f4d03f",       // yellow
};

// ---- News TV auto-rotate interval options (minutes) ----

export const ROTATE_INTERVAL_OPTIONS = [5, 10, 15, 30] as const;

// ---- Category display labels ----

export const CATEGORY_LABELS: Record<NewsCategory, string> = {
  world: "World",
  markets: "Markets",
  financial: "Financial",
  ipo: "IPO",
  tech: "Tech",
  ai: "AI",
  cyber: "Cybersecurity",
  semiconductors: "Semiconductors",
  cloud: "Cloud",
  startups: "Startups",
  events: "Tech Events",
  energy: "Energy",
  defense: "Defense",
  space: "Space",
  biotech: "Biotech",
  crypto: "Crypto",
  local: "Local",
  filings: "Filings",
  government: "Government",
  watchlist: "Watchlist",
};

// ---- Category panel definitions for dedicated feed windows ----

export const CATEGORY_PANEL_CONFIGS: CategoryPanelConfig[] = [
  { id: "news-cat-tech", title: "TECHNOLOGY", category: "tech", dedicatedFeeds: ["verge", "ars", "wired", "hn-front"], icon: "", refreshMs: 10_000 },
  { id: "news-cat-ai", title: "AI / ML", category: "ai", dedicatedFeeds: ["venturebeat-ai", "mit-ai", "the-decoder"], icon: "", refreshMs: 10_000 },
  { id: "news-cat-crypto", title: "CRYPTO", category: "crypto", dedicatedFeeds: ["coindesk"], apiEndpoint: "/api/news/coingecko?mode=markets&limit=10", icon: "", refreshMs: 12_000 },
  { id: "news-cat-markets", title: "MARKETS", category: "markets", dedicatedFeeds: ["cnbc-top", "reuters-business", "bbc-business", "marketwatch"], icon: "", refreshMs: 8_000 },
  { id: "news-cat-cyber", title: "CYBERSECURITY", category: "cyber", dedicatedFeeds: ["krebs", "therecord"], icon: "", refreshMs: 12_000 },
  { id: "news-cat-semis", title: "SEMICONDUCTORS", category: "semiconductors", dedicatedFeeds: ["semi-engineering", "eetimes"], icon: "", refreshMs: 15_000 },
  { id: "news-cat-cloud", title: "CLOUD & INFRA", category: "cloud", icon: "", refreshMs: 15_000 },
  { id: "news-cat-startups", title: "STARTUPS & VC", category: "startups", dedicatedFeeds: ["techcrunch"], icon: "", refreshMs: 12_000 },
  { id: "news-cat-ipo", title: "IPO & SPAC", category: "ipo", icon: "", refreshMs: 15_000 },
  { id: "news-cat-funding", title: "FUNDING & VC", category: "startups", dedicatedFeeds: ["techcrunch"], icon: "", refreshMs: 15_000 },
  { id: "news-cat-energy", title: "ENERGY", category: "energy", dedicatedFeeds: ["oilprice", "utility-dive"], icon: "", refreshMs: 15_000 },
  { id: "news-cat-defense", title: "DEFENSE & MILITARY", category: "defense", dedicatedFeeds: ["defense-one", "breaking-defense", "war-on-rocks"], icon: "", refreshMs: 15_000 },
  { id: "news-cat-govt", title: "GOVERNMENT & POLICY", category: "government", dedicatedFeeds: ["hill-policy", "politico-top", "lawfare"], icon: "", refreshMs: 12_000 },
  { id: "news-cat-finance", title: "FINANCE", category: "financial", dedicatedFeeds: ["ft-banking", "seeking-alpha"], icon: "", refreshMs: 10_000 },
  { id: "news-cat-space", title: "SPACE", category: "space", dedicatedFeeds: ["spacenews"], icon: "", refreshMs: 20_000 },
  { id: "news-cat-biotech", title: "BIOTECH & PHARMA", category: "biotech", dedicatedFeeds: ["fierce-biotech"], icon: "", refreshMs: 20_000 },
];
