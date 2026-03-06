export interface RssDefaultFeed {
  url: string;
  title: string;
  group: "news" | "tech" | "business" | "government" | "research" | "energy" | "defense" | "cyber";
}

export const RSS_DEFAULT_FEEDS: RssDefaultFeed[] = [
  // News
  { url: "https://feeds.reuters.com/reuters/worldNews", title: "Reuters World", group: "news" },
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", title: "BBC World", group: "news" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", title: "NYTimes World", group: "news" },
  { url: "https://www.theguardian.com/world/rss", title: "The Guardian World", group: "news" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", title: "Al Jazeera", group: "news" },
  { url: "https://english.alarabiya.net/rss.xml", title: "Al Arabiya English", group: "news" },
  { url: "https://feeds.skynews.com/feeds/rss/world.xml", title: "Sky News World", group: "news" },
  { url: "https://www.euronews.com/rss", title: "Euronews", group: "news" },
  { url: "https://www.france24.com/en/rss", title: "France 24 English", group: "news" },
  { url: "https://feeds.npr.org/1004/rss.xml", title: "NPR World", group: "news" },
  { url: "https://rss.dw.com/rdf/rss-en-top", title: "DW Top Stories", group: "news" },

  // Tech
  { url: "https://techcrunch.com/feed/", title: "TechCrunch", group: "tech" },
  { url: "https://www.theverge.com/rss/index.xml", title: "The Verge", group: "tech" },
  { url: "https://feeds.arstechnica.com/arstechnica/index", title: "Ars Technica", group: "tech" },
  { url: "https://www.wired.com/feed/rss", title: "Wired", group: "tech" },
  { url: "https://hnrss.org/frontpage", title: "Hacker News (RSS)", group: "tech" },
  { url: "https://venturebeat.com/category/ai/feed/", title: "VentureBeat AI", group: "tech" },
  { url: "https://www.technologyreview.com/topic/artificial-intelligence/feed", title: "MIT Tech Review AI", group: "tech" },

  // Business
  { url: "https://feeds.reuters.com/reuters/businessNews", title: "Reuters Business", group: "business" },
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml", title: "BBC Business", group: "business" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", title: "CNBC Top News", group: "business" },
  { url: "https://feeds.marketwatch.com/marketwatch/topstories/", title: "MarketWatch", group: "business" },
  { url: "https://seekingalpha.com/market_currents.xml", title: "Seeking Alpha", group: "business" },

  // Government
  { url: "https://thehill.com/feed/", title: "The Hill", group: "government" },
  { url: "https://rss.politico.com/politics-news.xml", title: "Politico", group: "government" },
  { url: "https://www.lawfaremedia.org/rss.xml", title: "Lawfare", group: "government" },

  // Research
  { url: "https://the-decoder.com/feed/", title: "The Decoder", group: "research" },
  { url: "https://semiengineering.com/feed/", title: "Semiconductor Engineering", group: "research" },

  // Energy
  { url: "https://oilprice.com/rss/main", title: "OilPrice.com", group: "energy" },
  { url: "https://www.utilitydive.com/feeds/news/", title: "Utility Dive", group: "energy" },

  // Defense
  { url: "https://www.defenseone.com/rss/", title: "Defense One", group: "defense" },
  { url: "https://breakingdefense.com/feed/", title: "Breaking Defense", group: "defense" },
  { url: "https://warontherocks.com/feed/", title: "War on the Rocks", group: "defense" },

  // Cyber
  { url: "https://krebsonsecurity.com/feed/", title: "Krebs on Security", group: "cyber" },
  { url: "https://therecord.media/feed", title: "The Record", group: "cyber" },
];
