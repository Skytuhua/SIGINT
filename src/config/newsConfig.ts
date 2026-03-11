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

export type IntelHotspotsMode = "registry" | "conflict" | "external" | "mixed";

/** Controls how the `intel-hotspots` layer sources its data. */
export const INTEL_HOTSPOTS_MODE: IntelHotspotsMode =
  (process.env.INTEL_HOTSPOTS_MODE as IntelHotspotsMode) ?? "registry";

export interface CategoryPanelConfig {
  id: string;
  title: string;
  category: NewsCategory;
  /** When set, the panel aggregates articles from multiple categories. */
  categories?: NewsCategory[];
  dedicatedFeeds?: string[];
  apiEndpoint?: string;
  refreshMs?: number;
  icon?: string;
}

// ---- YouTube live news channels ----
// Channel IDs verified against youtube.com/channel/<ID> pages and Invidious.
// Every channel is assigned to "general" so it always appears in the LIVE NEWS
// panel, plus any specialist categories it fits.

export const NEWS_VIDEO_CHANNELS: YouTubeChannel[] = [
  // ── Business & Financial ──────────────────────────────────────────
  { channelId: "UCVTomc35agH1SM6kCKzwW_g", label: "Bloomberg TV",           priority: 100, region: "global", categories: ["general", "tech", "business", "financial"] },
  { channelId: "UChirEOpgFCupRAk5etXqPaA", label: "Bloomberg News",         priority: 97,  region: "global", categories: ["general", "business", "financial"] },
  { channelId: "UC7UFcUbAd8oyCBWCogVpJ6g", label: "Bloomberg Live",         priority: 95,  region: "global", categories: ["general", "business", "financial"] },
  { channelId: "UCtn-u5YH-y5R2Cob8vvpKLg", label: "Reuters",               priority: 94,  region: "global", categories: ["general", "tech", "business", "financial"] },
  { channelId: "UCF8HUTbUwPKh2Q-KpGOCVGw", label: "CNBC Intl Live",        priority: 92,  region: "global", categories: ["general", "business", "financial"] },

  // ── US General / Cable ────────────────────────────────────────────
  { channelId: "UCIALMKvObZNtJ6AmdCLP7Lg", label: "AP News",               priority: 96,  region: "global", categories: ["general", "business", "tech", "financial"] },
  { channelId: "UCupvZG-5ko_eiXAupbDfxWw", label: "CNN",                    priority: 93,  region: "us",     categories: ["general", "business", "financial"] },
  { channelId: "UCBi2mrWuNuyYy4gbM6fU18Q", label: "ABC News",              priority: 91,  region: "us",     categories: ["general", "business"] },
  { channelId: "UCeY0bbntWzzVIaj2z3QigXg", label: "NBC News",              priority: 90,  region: "us",     categories: ["general", "business"] },
  { channelId: "UC8p1vwvWtl6T73JiExfWs1g", label: "CBS News",              priority: 89,  region: "us",     categories: ["general"] },
  { channelId: "UCXIJgqnII2ZOINSWNOGFThA", label: "Fox News",              priority: 88,  region: "us",     categories: ["general"] },
  { channelId: "UCaXkIU1QidjPwiAYu6GcHjg", label: "MSNBC",                 priority: 87,  region: "us",     categories: ["general"] },
  { channelId: "UC6ZFN9Tx6xh-skXCuRHCDpQ", label: "PBS NewsHour",          priority: 85,  region: "us",     categories: ["general"] },
  { channelId: "UCJg9wBPyKMNA5sRDnvzmkdg", label: "LiveNOW from FOX",      priority: 84,  region: "us",     categories: ["general"] },

  // ── Europe / UK ───────────────────────────────────────────────────
  { channelId: "UC16niRr50-MSBwiO3YDb3RA", label: "BBC News",              priority: 93,  region: "uk",     categories: ["general", "business", "tech", "financial"] },
  { channelId: "UCoMdktPbSTixAyNGwb-UYkQ", label: "Sky News",              priority: 90,  region: "uk",     categories: ["general", "business"] },
  { channelId: "UCknLrEdhRCp1aegoMqRaCZg", label: "DW News",               priority: 87,  region: "eu",     categories: ["general", "business"] },
  { channelId: "UCHKkHPkL0IePiQMNcFwIpzQ", label: "France 24 EN",          priority: 86,  region: "eu",     categories: ["general", "business"] },
  { channelId: "UCSrZ3UV4jOidv8ppoVuvW9Q", label: "Euronews",              priority: 84,  region: "eu",     categories: ["general", "business"] },
  { channelId: "UC0vn8ISa4LKMunLbzaXLnOQ", label: "GB News",               priority: 78,  region: "uk",     categories: ["general"] },

  // ── Middle East ───────────────────────────────────────────────────
  { channelId: "UCNye-wNBqNL5ZzHSJj3l8Bg", label: "Al Jazeera EN",        priority: 91,  region: "mena",   categories: ["general", "business"] },
  { channelId: "UCIZJ9a6P_nxCFJTmL0gh_IQ", label: "Al Arabiya EN",        priority: 85,  region: "mena",   categories: ["general"] },
  { channelId: "UC7fWeaHhqgM4Ry-RMpM2YYw", label: "TRT World",            priority: 83,  region: "mena",   categories: ["general"] },
  { channelId: "UCvHDpsWKADrDia0c99X37vg", label: "i24NEWS EN",            priority: 80,  region: "mena",   categories: ["general"] },

  // ── Asia / Oceania ────────────────────────────────────────────────
  { channelId: "UCSPEjw8F2nQDtmUKPFNF7_A", label: "NHK World",             priority: 78,  region: "asia",   categories: ["general"] },
  { channelId: "UC-PHIZjV-oX8H7zD1cCN2NQ", label: "Arirang (Korea)",       priority: 75,  region: "asia",   categories: ["general"] },
  { channelId: "UCO0akufu9MOzyz3nvGIXAAw", label: "Sky News Australia",    priority: 77,  region: "asia",   categories: ["general"] },

  // ── Canada ────────────────────────────────────────────────────────
  { channelId: "UChLtXXpo4Ge1ReTEboVvTDg", label: "Global News (CA)",      priority: 76,  region: "global", categories: ["general"] },

  // ── India ────────────────────────────────────────────────────────
  { channelId: "UCt4t-jeY85JegMlZ-E5UWtA", label: "WION",                  priority: 82,  region: "asia",   categories: ["general"] },
  { channelId: "UCYPvAwZP8pZhSMW8qs7cVCw", label: "India Today",           priority: 79,  region: "asia",   categories: ["general"] },
  { channelId: "UC_gUM8rL-Lrg6O3adPW9K1g", label: "NDTV",                  priority: 78,  region: "asia",   categories: ["general"] },
  { channelId: "UCPMTrBl-bPlxnAULzaxPjPg", label: "Times Now",             priority: 74,  region: "asia",   categories: ["general"] },
  { channelId: "UCwqusr8YDwM-0gEU1UrYBYQ", label: "Republic World",        priority: 73,  region: "asia",   categories: ["general"] },

  // ── Southeast Asia ──────────────────────────────────────────────
  { channelId: "UCm1Q9MYyFxCsOgLSiPKBiDg", label: "CNA (Singapore)",       priority: 80,  region: "asia",   categories: ["general", "business"] },
  { channelId: "UCLVoFwXt1JE-UOE64SAexXA", label: "ABS-CBN News",          priority: 72,  region: "asia",   categories: ["general"] },

  // ── Africa ──────────────────────────────────────────────────────
  { channelId: "UC3E9rIoLKXgs0SmhQo3tIug", label: "SABC News (SA)",        priority: 74,  region: "mena",   categories: ["general"] },
  { channelId: "UCd3TBEvIDaAuaQGA-ipmG4A", label: "Channels TV (Nigeria)", priority: 71,  region: "mena",   categories: ["general"] },
  { channelId: "UCuHSZMGrjlmMZR9nfJkV0Ig", label: "KTN News (Kenya)",      priority: 70,  region: "mena",   categories: ["general"] },
  { channelId: "UC65DXOO0TOFm7gfkC3WAHLA", label: "Africa News (EN)",      priority: 69,  region: "mena",   categories: ["general"] },

  // ── China / Other Asia ──────────────────────────────────────────
  { channelId: "UCgrNz-aDmcr2uuto8_DL2jg", label: "CGTN",                  priority: 76,  region: "asia",   categories: ["general"] },

  // ── Europe (additional) ─────────────────────────────────────────
  { channelId: "UCeEQFJiMYwPCjgmDRoJZ_DQ", label: "RTÉ News (Ireland)",   priority: 73,  region: "eu",     categories: ["general"] },
];

/** Live video panel definitions: main category + subcategory (source) choices */
export const LIVE_VIDEO_PANELS: Array<{
  id: string;
  category: VideoPanelCategory;
  title: string;
  subtitle: string;
}> = [
  { id: "news-video-1", category: "general", title: "NEWS VIDEO 1", subtitle: "Live news stream" },
  { id: "news-video-2", category: "general", title: "NEWS VIDEO 2", subtitle: "Live news stream" },
  { id: "news-video-3", category: "general", title: "NEWS VIDEO 3", subtitle: "Live news stream" },
  { id: "news-video-4", category: "general", title: "NEWS VIDEO 4", subtitle: "Live news stream" },
];

// Backward-compatible export name for existing imports.
export const NEWS_CHANNELS = NEWS_VIDEO_CHANNELS;

// ---- Free RSS text-news feeds ----

export const NEWS_RSS_FEEDS: RssFeedSource[] = [
  { id: "reuters-world", label: "Reuters World", url: "https://www.reutersagency.com/feed/?taxonomy=best-sectors&post_type=best", category: "world", region: "global", language: "en" },
  { id: "bbc-world", label: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", category: "world", region: "global", language: "en" },
  { id: "bbc-business", label: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", category: "markets", region: "global", language: "en" },
  { id: "guardian-world", label: "The Guardian World", url: "https://www.theguardian.com/world/rss", category: "world", region: "uk", language: "en" },
  { id: "guardian-business", label: "The Guardian Business", url: "https://www.theguardian.com/business/rss", category: "markets", region: "uk", language: "en" },
  { id: "cnbc-top", label: "CNBC Top News", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114", category: "markets", region: "us", language: "en" },
  { id: "npr-world", label: "NPR World", url: "https://feeds.npr.org/1004/rss.xml", category: "world", region: "us", language: "en" },
  { id: "dw-top", label: "DW Top Stories", url: "https://rss.dw.com/rdf/rss-en-top", category: "world", region: "eu", language: "en" },
  { id: "aljazeera-all", label: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", category: "world", region: "mena", language: "en" },
  // Additional world/general coverage
  { id: "nyt-world", label: "NYTimes World", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", category: "world", region: "us", language: "en" },
  { id: "ft-world", label: "FT World", url: "https://www.ft.com/world?format=rss", category: "world", region: "global", language: "en" },
  { id: "sky-world", label: "Sky News World", url: "https://feeds.skynews.com/feeds/rss/world.xml", category: "world", region: "uk", language: "en" },
  { id: "economist-world", label: "The Economist World This Week", url: "https://www.economist.com/the-world-this-week/rss.xml", category: "world", region: "global", language: "en" },
  { id: "techcrunch", label: "TechCrunch", url: "https://techcrunch.com/feed/", category: "startups", region: "global", language: "en" },
  { id: "verge", label: "The Verge", url: "https://www.theverge.com/rss/index.xml", category: "tech", region: "us", language: "en" },
  { id: "ars", label: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", category: "tech", region: "us", language: "en" },
  { id: "wired", label: "Wired", url: "https://www.wired.com/feed/rss", category: "tech", region: "us", language: "en" },
  { id: "coindesk", label: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", category: "crypto", region: "global", language: "en" },
  { id: "krebs", label: "Krebs on Security", url: "https://krebsonsecurity.com/feed/", category: "cyber", region: "us", language: "en" },
  { id: "therecord", label: "The Record", url: "https://therecord.media/feed", category: "cyber", region: "global", language: "en" },
  { id: "venturebeat-ai", label: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/", category: "ai", region: "us", language: "en" },
  { id: "spacenews", label: "SpaceNews", url: "https://spacenews.com/feed/", category: "space", region: "global", language: "en" },
  { id: "fierce-biotech", label: "Fierce Biotech", url: "https://www.fiercebiotech.com/rss/xml", category: "biotech", region: "us", language: "en" },
  // Government & Policy
  { id: "hill-policy", label: "The Hill", url: "https://thehill.com/feed/", category: "government", region: "us", language: "en" },
  { id: "politico-top", label: "Politico", url: "https://rss.politico.com/politics-news.xml", category: "government", region: "us", language: "en" },
  // Energy
  { id: "oilprice", label: "OilPrice.com", url: "https://oilprice.com/rss/main", category: "energy", region: "global", language: "en" },
  { id: "utility-dive", label: "Utility Dive", url: "https://www.utilitydive.com/feeds/news/", category: "energy", region: "us", language: "en" },
  // Military & Defense
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

  // ── World / International ─────────────────────────────────────────
  { id: "ap-world", label: "AP Top News", url: "https://rsshub.app/apnews/topics/apf-topnews", category: "world", region: "global", language: "en" },
  { id: "france24-en", label: "France 24 English", url: "https://www.france24.com/en/rss", category: "world", region: "eu", language: "en" },
  { id: "euronews-en", label: "Euronews", url: "https://www.euronews.com/rss", category: "world", region: "eu", language: "en" },
  { id: "al-arabiya-en", label: "Al Arabiya English", url: "https://english.alarabiya.net/rss.xml", category: "world", region: "mena", language: "en" },
  { id: "rfi-en", label: "RFI English", url: "https://www.rfi.fr/en/rss", category: "world", region: "eu", language: "en" },
  { id: "independent-world", label: "The Independent World", url: "https://www.independent.co.uk/news/world/rss", category: "world", region: "uk", language: "en" },
  { id: "foreign-policy", label: "Foreign Policy", url: "https://foreignpolicy.com/feed/", category: "world", region: "global", language: "en" },
  { id: "foreign-affairs", label: "Foreign Affairs", url: "https://www.foreignaffairs.com/rss.xml", category: "world", region: "global", language: "en" },
  { id: "japan-times", label: "Japan Times", url: "https://www.japantimes.co.jp/feed/", category: "world", region: "asia", language: "en" },
  { id: "dawn-pk", label: "Dawn (Pakistan)", url: "https://www.dawn.com/feeds/home", category: "world", region: "asia", language: "en" },
  { id: "bbc-politics", label: "BBC UK Politics", url: "https://feeds.bbci.co.uk/news/politics/rss.xml", category: "government", region: "uk", language: "en" },
  { id: "bbc-tech", label: "BBC Technology", url: "https://feeds.bbci.co.uk/news/technology/rss.xml", category: "tech", region: "global", language: "en" },

  // ── Defense / Intelligence / Geopolitics ──────────────────────────
  { id: "cipher-brief", label: "The Cipher Brief", url: "https://www.thecipherbrief.com/feed", category: "defense", region: "global", language: "en" },
  { id: "just-security", label: "Just Security", url: "https://www.justsecurity.org/feed/", category: "defense", region: "global", language: "en" },
  { id: "bellingcat", label: "Bellingcat", url: "https://www.bellingcat.com/feed/", category: "defense", region: "global", language: "en" },
  { id: "c4isrnet", label: "C4ISRNET", url: "https://www.c4isrnet.com/arc/outboundfeeds/rss/?rss=true", category: "defense", region: "global", language: "en" },

  // ── Financial / Markets ──────────────────────────────────────────

  // ── Cryptocurrency ───────────────────────────────────────────────
  { id: "cointelegraph", label: "CoinTelegraph", url: "https://cointelegraph.com/rss", category: "crypto", region: "global", language: "en" },
  { id: "decrypt", label: "Decrypt", url: "https://decrypt.co/feed", category: "crypto", region: "global", language: "en" },

  // ── Cybersecurity ────────────────────────────────────────────────
  { id: "bleepingcomputer", label: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/", category: "cyber", region: "global", language: "en" },
  { id: "dark-reading", label: "Dark Reading", url: "https://www.darkreading.com/rss.xml", category: "cyber", region: "global", language: "en" },
  { id: "securityweek", label: "SecurityWeek", url: "https://www.securityweek.com/feed/", category: "cyber", region: "global", language: "en" },
  { id: "sans-isc", label: "SANS ISC", url: "https://isc.sans.edu/rssfeed_full.xml", category: "cyber", region: "global", language: "en" },

  // ── Tech ─────────────────────────────────────────────────────────
  { id: "the-register", label: "The Register", url: "https://www.theregister.com/headlines.atom", category: "tech", region: "uk", language: "en" },
  { id: "zdnet", label: "ZDNet", url: "https://www.zdnet.com/news/rss.xml", category: "tech", region: "us", language: "en" },

  // ── AI ───────────────────────────────────────────────────────────
  { id: "mit-tech-full", label: "MIT Tech Review", url: "https://www.technologyreview.com/feed/", category: "ai", region: "global", language: "en" },
  { id: "ai-news", label: "AI News", url: "https://www.artificialintelligence-news.com/feed/", category: "ai", region: "global", language: "en" },

  // ── Markets & Analysis (additional) ─────────────────────────────
  { id: "yahoo-finance", label: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex", category: "markets", region: "us", language: "en" },
  { id: "bloomberg-markets", label: "Bloomberg Markets", url: "https://news.google.com/rss/search?q=bloomberg+markets+stocks&hl=en-US&gl=US&ceid=US:en", category: "markets", region: "global", language: "en" },
  { id: "investing-com", label: "Investing.com News", url: "https://news.google.com/rss/search?q=site%3Ainvesting.com+markets&hl=en-US&gl=US&ceid=US:en", category: "markets", region: "global", language: "en" },
  { id: "market-outlook", label: "Market Outlook", url: "https://news.google.com/rss/search?q=market+outlook+stock+market+forecast&hl=en-US&gl=US&ceid=US:en", category: "markets", region: "global", language: "en" },
  { id: "risk-volatility", label: "Risk & Volatility", url: "https://news.google.com/rss/search?q=VIX+market+volatility+stock+correction&hl=en-US&gl=US&ceid=US:en", category: "markets", region: "global", language: "en" },
  { id: "bank-research", label: "Bank Research", url: "https://news.google.com/rss/search?q=%22Goldman+Sachs%22+OR+%22JPMorgan%22+OR+%22Morgan+Stanley%22+research+outlook&hl=en-US&gl=US&ceid=US:en", category: "financial", region: "global", language: "en" },
  { id: "economic-data", label: "Economic Data", url: "https://news.google.com/rss/search?q=CPI+inflation+GDP+%22jobs+report%22+NFP+PMI&hl=en-US&gl=US&ceid=US:en", category: "markets", region: "us", language: "en" },
  { id: "trade-tariffs", label: "Trade & Tariffs", url: "https://news.google.com/rss/search?q=tariffs+%22trade+war%22+trade+deficit+sanctions&hl=en-US&gl=US&ceid=US:en", category: "markets", region: "global", language: "en" },
  { id: "housing-market", label: "Housing Market", url: "https://news.google.com/rss/search?q=home+prices+mortgage+rates+REITs+housing+market&hl=en-US&gl=US&ceid=US:en", category: "markets", region: "us", language: "en" },
  { id: "earnings-reports", label: "Earnings Reports", url: "https://news.google.com/rss/search?q=quarterly+earnings+revenue+%22beat+expectations%22+%22missed+expectations%22&hl=en-US&gl=US&ceid=US:en", category: "markets", region: "global", language: "en" },
  { id: "ma-news", label: "M&A News", url: "https://news.google.com/rss/search?q=merger+acquisition+takeover+buyout&hl=en-US&gl=US&ceid=US:en", category: "markets", region: "global", language: "en" },
  { id: "options-market", label: "Options Market", url: "https://news.google.com/rss/search?q=options+trading+%22put+call+ratio%22+VIX+derivatives&hl=en-US&gl=US&ceid=US:en", category: "markets", region: "global", language: "en" },
  { id: "futures-trading", label: "Futures Trading", url: "https://news.google.com/rss/search?q=%22S%26P+500+futures%22+%22Nasdaq+futures%22+trading&hl=en-US&gl=US&ceid=US:en", category: "markets", region: "global", language: "en" },
  { id: "ipo-news-agg", label: "IPO News", url: "https://news.google.com/rss/search?q=IPO+SPAC+%22direct+listing%22+%22going+public%22&hl=en-US&gl=US&ceid=US:en", category: "ipo", region: "global", language: "en" },

  // ── Forex & Fixed Income ─────────────────────────────────────────
  { id: "forex-news", label: "Forex News", url: "https://news.google.com/rss/search?q=forex+currency+trading+FX&hl=en-US&gl=US&ceid=US:en", category: "forex", region: "global", language: "en" },
  { id: "dollar-watch", label: "Dollar Watch", url: "https://news.google.com/rss/search?q=DXY+USD+dollar+EUR+USD+exchange+rate&hl=en-US&gl=US&ceid=US:en", category: "forex", region: "global", language: "en" },
  { id: "central-bank-rates", label: "Central Bank Rates", url: "https://news.google.com/rss/search?q=central+bank+interest+rate+decision+monetary+policy&hl=en-US&gl=US&ceid=US:en", category: "forex", region: "global", language: "en" },
  { id: "bond-market", label: "Bond Market", url: "https://news.google.com/rss/search?q=treasury+yields+bond+market+fixed+income&hl=en-US&gl=US&ceid=US:en", category: "forex", region: "global", language: "en" },
  { id: "treasury-watch", label: "Treasury Watch", url: "https://news.google.com/rss/search?q=US+Treasury+auction+10+year+yield+2+year&hl=en-US&gl=US&ceid=US:en", category: "forex", region: "us", language: "en" },
  { id: "corporate-bonds", label: "Corporate Bonds", url: "https://news.google.com/rss/search?q=corporate+bonds+high+yield+credit+spreads+investment+grade&hl=en-US&gl=US&ceid=US:en", category: "forex", region: "global", language: "en" },

  // ── Commodities ──────────────────────────────────────────────────
  { id: "oil-gas-news", label: "Oil & Gas", url: "https://news.google.com/rss/search?q=oil+price+OPEC+natural+gas+WTI+Brent+crude&hl=en-US&gl=US&ceid=US:en", category: "commodities", region: "global", language: "en" },
  { id: "gold-metals", label: "Gold & Metals", url: "https://news.google.com/rss/search?q=gold+price+silver+copper+precious+metals+platinum&hl=en-US&gl=US&ceid=US:en", category: "commodities", region: "global", language: "en" },
  { id: "agriculture-news", label: "Agriculture", url: "https://news.google.com/rss/search?q=wheat+corn+soybeans+coffee+sugar+agriculture+commodity&hl=en-US&gl=US&ceid=US:en", category: "commodities", region: "global", language: "en" },
  { id: "commodity-trading", label: "Commodity Trading", url: "https://news.google.com/rss/search?q=CME+NYMEX+COMEX+futures+commodities+trading&hl=en-US&gl=US&ceid=US:en", category: "commodities", region: "global", language: "en" },

  // ── Crypto (additional) ──────────────────────────────────────────
  { id: "the-block", label: "The Block", url: "https://news.google.com/rss/search?q=site%3Atheblock.co+crypto&hl=en-US&gl=US&ceid=US:en", category: "crypto", region: "global", language: "en" },
  { id: "crypto-news-agg", label: "Crypto News", url: "https://news.google.com/rss/search?q=bitcoin+ethereum+crypto+digital+assets&hl=en-US&gl=US&ceid=US:en", category: "crypto", region: "global", language: "en" },
  { id: "defi-news", label: "DeFi News", url: "https://news.google.com/rss/search?q=DeFi+DEX+yield+farming+decentralized+finance&hl=en-US&gl=US&ceid=US:en", category: "crypto", region: "global", language: "en" },

  // ── Central Banks ────────────────────────────────────────────────
  { id: "federal-reserve", label: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_all.xml", category: "financial", region: "us", language: "en" },
  { id: "ecb-watch", label: "ECB Watch", url: "https://news.google.com/rss/search?q=European+Central+Bank+ECB+monetary+policy&hl=en-US&gl=US&ceid=US:en", category: "financial", region: "eu", language: "en" },
  { id: "boj-watch", label: "Bank of Japan Watch", url: "https://news.google.com/rss/search?q=Bank+of+Japan+BOJ+monetary+policy&hl=en-US&gl=US&ceid=US:en", category: "financial", region: "asia", language: "en" },
  { id: "boe-watch", label: "Bank of England Watch", url: "https://news.google.com/rss/search?q=Bank+of+England+BOE+monetary+policy&hl=en-US&gl=US&ceid=US:en", category: "financial", region: "uk", language: "en" },
  { id: "pboc-watch", label: "PBoC Watch", url: "https://news.google.com/rss/search?q=PBoC+%22People%27s+Bank+of+China%22+monetary+policy&hl=en-US&gl=US&ceid=US:en", category: "financial", region: "asia", language: "en" },
  { id: "global-central-banks", label: "Global Central Banks", url: "https://news.google.com/rss/search?q=central+bank+rate+hike+rate+cut+global&hl=en-US&gl=US&ceid=US:en", category: "financial", region: "global", language: "en" },

  // ── Fintech ──────────────────────────────────────────────────────
  { id: "fintech-news", label: "Fintech News", url: "https://news.google.com/rss/search?q=fintech+neobank+%22digital+banking%22+%22payment+technology%22&hl=en-US&gl=US&ceid=US:en", category: "fintech", region: "global", language: "en" },
  { id: "trading-tech", label: "Trading Tech", url: "https://news.google.com/rss/search?q=%22algorithmic+trading%22+%22quantitative+finance%22+%22trading+technology%22&hl=en-US&gl=US&ceid=US:en", category: "fintech", region: "global", language: "en" },
  { id: "blockchain-finance", label: "Blockchain Finance", url: "https://news.google.com/rss/search?q=tokenization+%22digital+securities%22+CBDC+%22blockchain+finance%22&hl=en-US&gl=US&ceid=US:en", category: "fintech", region: "global", language: "en" },

  // ── Financial Regulation ─────────────────────────────────────────
  { id: "sec-releases", label: "SEC", url: "https://www.sec.gov/news/pressreleases.rss", category: "regulation", region: "us", language: "en" },
  { id: "financial-regulation", label: "Financial Regulation", url: "https://news.google.com/rss/search?q=SEC+CFTC+FINRA+FCA+%22financial+regulation%22&hl=en-US&gl=US&ceid=US:en", category: "regulation", region: "global", language: "en" },
  { id: "banking-rules", label: "Banking Rules", url: "https://news.google.com/rss/search?q=Basel+%22capital+requirements%22+%22banking+regulation%22&hl=en-US&gl=US&ceid=US:en", category: "regulation", region: "global", language: "en" },
  { id: "crypto-regulation", label: "Crypto Regulation", url: "https://news.google.com/rss/search?q=%22crypto+regulation%22+%22digital+asset+regulation%22&hl=en-US&gl=US&ceid=US:en", category: "regulation", region: "global", language: "en" },

  // ── Institutional Investors ──────────────────────────────────────
  { id: "hedge-fund-news", label: "Hedge Fund News", url: "https://news.google.com/rss/search?q=Bridgewater+Citadel+%22Renaissance+Technologies%22+%22hedge+fund%22&hl=en-US&gl=US&ceid=US:en", category: "institutional", region: "global", language: "en" },
  { id: "private-equity", label: "Private Equity", url: "https://news.google.com/rss/search?q=Blackstone+KKR+Apollo+Carlyle+%22private+equity%22&hl=en-US&gl=US&ceid=US:en", category: "institutional", region: "global", language: "en" },
  { id: "sovereign-wealth", label: "Sovereign Wealth", url: "https://news.google.com/rss/search?q=%22sovereign+wealth+fund%22+%22pension+fund%22&hl=en-US&gl=US&ceid=US:en", category: "institutional", region: "global", language: "en" },

  // ── Gulf / MENA Finance ──────────────────────────────────────────
  { id: "arabian-business", label: "Arabian Business", url: "https://www.arabianbusiness.com/rss", category: "world", region: "mena", language: "en" },
  { id: "the-national", label: "The National", url: "https://www.thenationalnews.com/arc/outboundfeeds/rss/", category: "world", region: "mena", language: "en" },
  { id: "arab-news", label: "Arab News", url: "https://www.arabnews.com/rss.xml", category: "world", region: "mena", language: "en" },
  { id: "gulf-fdi", label: "Gulf FDI", url: "https://news.google.com/rss/search?q=PIF+%22DP+World%22+Mubadala+ADNOC+Masdar+%22ACWA+Power%22&hl=en-US&gl=US&ceid=US:en", category: "world", region: "mena", language: "en" },
  { id: "gulf-investments", label: "Gulf Investments", url: "https://news.google.com/rss/search?q=Saudi+UAE+%22Abu+Dhabi%22+investment+fund&hl=en-US&gl=US&ceid=US:en", category: "world", region: "mena", language: "en" },
  { id: "vision-2030", label: "Vision 2030", url: "https://news.google.com/rss/search?q=%22Vision+2030%22+Saudi+Arabia&hl=en-US&gl=US&ceid=US:en", category: "world", region: "mena", language: "en" },
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
  forex: [
    "forex", "currency", "dxy", "usd", "eur/usd", "fx", "exchange rate", "dollar",
    "treasury yield", "bond yield", "fixed income", "boe", "boj", "ecb",
    "central bank", "rate decision", "monetary policy", "10-year", "2-year",
    "corporate bonds", "high yield", "credit spread",
  ],
  commodities: [
    "commodity", "oil price", "crude", "wti", "brent", "opec", "natural gas",
    "gold", "silver", "copper", "precious metals", "wheat", "corn", "soybeans",
    "coffee", "sugar", "agriculture", "cme", "nymex", "comex", "futures",
  ],
  fintech: [
    "fintech", "neobank", "digital banking", "payment technology",
    "algorithmic trading", "quantitative finance", "tokenization",
    "digital securities", "cbdc", "regtech", "insurtech", "open banking",
    "embedded finance",
  ],
  regulation: [
    "sec", "cftc", "finra", "fca", "financial regulation", "basel",
    "capital requirements", "dodd-frank", "compliance", "crypto regulation",
    "digital asset regulation", "enforcement action", "consent order",
  ],
  institutional: [
    "hedge fund", "private equity", "sovereign wealth", "bridgewater",
    "citadel", "renaissance", "blackstone", "kkr", "apollo", "carlyle",
    "pension fund", "endowment", "family office", "asset allocation", "alternatives",
  ],
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
  forex: "#0288d1",           // light blue
  commodities: "#f57c00",     // deep orange
  fintech: "#00acc1",         // cyan-teal
  regulation: "#c62828",      // dark red
  institutional: "#4527a0",   // deep purple
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
  forex: "Forex & Fixed Income",
  commodities: "Commodities",
  fintech: "Fintech",
  regulation: "Regulation",
  institutional: "Institutional",
};

// ---- Category panel definitions for dedicated feed windows ----

export const CATEGORY_PANEL_CONFIGS: CategoryPanelConfig[] = [
  { id: "news-cat-tech", title: "TECHNOLOGY", category: "tech", dedicatedFeeds: ["verge", "ars", "wired", "hn-front", "the-register", "zdnet", "bbc-tech", "reuters-tech"], icon: "", refreshMs: 10_000 },
  { id: "news-cat-ai", title: "AI / ML", category: "ai", dedicatedFeeds: ["venturebeat-ai", "mit-ai", "the-decoder", "mit-tech-full", "ai-news"], icon: "", refreshMs: 10_000 },
  { id: "news-cat-crypto", title: "CRYPTO", category: "crypto", dedicatedFeeds: ["coindesk", "cointelegraph", "decrypt", "the-block", "crypto-news-agg", "defi-news"], apiEndpoint: "/api/news/coingecko?mode=markets&limit=10", icon: "", refreshMs: 12_000 },
  { id: "news-cat-markets", title: "MARKETS", category: "markets", dedicatedFeeds: ["cnbc-top", "reuters-business", "bbc-business", "marketwatch", "yahoo-finance", "bloomberg-markets", "investing-com", "market-outlook", "risk-volatility", "economic-data", "trade-tariffs", "housing-market", "earnings-reports", "ma-news", "options-market", "futures-trading"], icon: "", refreshMs: 8_000 },
  { id: "news-cat-cyber", title: "CYBERSECURITY", category: "cyber", dedicatedFeeds: ["krebs", "therecord", "bleepingcomputer", "dark-reading", "securityweek", "sans-isc"], icon: "", refreshMs: 12_000 },
  { id: "news-cat-semis", title: "SEMICONDUCTORS", category: "semiconductors", dedicatedFeeds: ["semi-engineering", "eetimes"], icon: "", refreshMs: 15_000 },
  { id: "news-cat-other", title: "OTHER", category: "cloud", categories: ["cloud", "startups", "ipo", "space", "biotech"], dedicatedFeeds: ["techcrunch", "spacenews", "fierce-biotech"], icon: "", refreshMs: 15_000 },
  { id: "news-cat-energy", title: "ENERGY", category: "energy", dedicatedFeeds: ["oilprice", "utility-dive"], icon: "", refreshMs: 15_000 },
  { id: "news-cat-defense", title: "DEFENSE & MILITARY", category: "defense", dedicatedFeeds: ["defense-one", "breaking-defense", "war-on-rocks", "cipher-brief", "just-security", "bellingcat", "c4isrnet", "rand-news"], icon: "", refreshMs: 15_000 },
  { id: "news-cat-govt", title: "GOVERNMENT & POLICY", category: "government", dedicatedFeeds: ["hill-policy", "politico-top", "lawfare", "bbc-politics"], icon: "", refreshMs: 12_000 },
  { id: "news-cat-finance", title: "FINANCE", category: "financial", dedicatedFeeds: ["ft-banking", "seeking-alpha", "reuters-finance", "investopedia", "bank-research", "federal-reserve", "ecb-watch", "boj-watch", "boe-watch", "pboc-watch", "global-central-banks"], icon: "", refreshMs: 10_000 },
  { id: "news-cat-world", title: "WORLD NEWS", category: "world", dedicatedFeeds: ["bbc-world", "reuters-world", "sky-world", "dw-top", "france24-en", "euronews-en", "aljazeera-all", "al-arabiya-en", "bloomberg-markets", "ap-world", "rfi-en", "kyiv-independent", "foreign-policy", "foreign-affairs", "japan-times", "dawn-pk", "independent-world"], icon: "", refreshMs: 10_000 },
  { id: "news-cat-forex", title: "FOREX & FIXED INCOME", category: "forex", dedicatedFeeds: ["forex-news", "dollar-watch", "central-bank-rates", "bond-market", "treasury-watch", "corporate-bonds"], icon: "", refreshMs: 10_000 },
  { id: "news-cat-commodities", title: "COMMODITIES", category: "commodities", dedicatedFeeds: ["oil-gas-news", "gold-metals", "agriculture-news", "commodity-trading"], icon: "", refreshMs: 12_000 },
  { id: "news-cat-central-banks", title: "CENTRAL BANKS", category: "financial", dedicatedFeeds: ["federal-reserve", "ecb-watch", "boj-watch", "boe-watch", "pboc-watch", "global-central-banks"], icon: "", refreshMs: 15_000 },
  { id: "news-cat-fintech", title: "FINTECH", category: "fintech", dedicatedFeeds: ["fintech-news", "trading-tech", "blockchain-finance"], icon: "", refreshMs: 12_000 },
  { id: "news-cat-regulation", title: "FINANCIAL REGULATION", category: "regulation", dedicatedFeeds: ["sec-releases", "financial-regulation", "banking-rules", "crypto-regulation"], icon: "", refreshMs: 15_000 },
  { id: "news-cat-institutional", title: "INSTITUTIONAL INVESTORS", category: "institutional", dedicatedFeeds: ["hedge-fund-news", "private-equity", "sovereign-wealth"], icon: "", refreshMs: 15_000 },
  { id: "news-cat-gulf", title: "GULF / MENA FINANCE", category: "world", dedicatedFeeds: ["arabian-business", "the-national", "arab-news", "gulf-fdi", "gulf-investments", "vision-2030"], icon: "", refreshMs: 12_000 },
];
