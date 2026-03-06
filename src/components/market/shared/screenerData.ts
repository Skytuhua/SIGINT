export interface ScreenerRow {
  sym: string;
  name: string;
  sector: string;
  marketCapB: number;
  price: number;
  chg1d: number;
  chg1w: number;
  pe: number | null;
  ps: number;
  pb: number;
  roe: number;
  grossMarginPct: number;
  netMarginPct: number;
  beta: number;
  avgVolM: number;
  divYield: number;
}

export const SCREENER_UNIVERSE: ScreenerRow[] = [
  // ── Technology ──────────────────────────────────────────────────────────
  { sym:"AAPL",  name:"Apple Inc.",          sector:"Technology",      marketCapB:2820, price:182.44, chg1d: 0.41, chg1w: 1.12, pe:29.4, ps:7.9,  pb:48.2, roe:163,  grossMarginPct:44.1, netMarginPct:24.3, beta:1.24, avgVolM:62.1, divYield:0.56 },
  { sym:"NVDA",  name:"NVIDIA Corp.",         sector:"Technology",      marketCapB:2090, price:847.20, chg1d: 8.43, chg1w: 11.2, pe:52.3, ps:22.4, pb:38.7, roe:86.2, grossMarginPct:74.6, netMarginPct:48.8, beta:1.72, avgVolM:41.8, divYield:0.03 },
  { sym:"MSFT",  name:"Microsoft Corp.",      sector:"Technology",      marketCapB:3110, price:415.20, chg1d: 0.68, chg1w: 1.88, pe:34.8, ps:12.1, pb:12.4, roe:35.1, grossMarginPct:69.4, netMarginPct:34.1, beta:0.88, avgVolM:19.4, divYield:0.73 },
  { sym:"GOOGL", name:"Alphabet Inc.",        sector:"Technology",      marketCapB:2140, price:174.90, chg1d: 0.24, chg1w: 0.88, pe:22.4, ps:5.8,  pb:6.1,  roe:28.4, grossMarginPct:56.1, netMarginPct:22.4, beta:1.05, avgVolM:22.6, divYield:0.00 },
  { sym:"META",  name:"Meta Platforms",       sector:"Technology",      marketCapB:1250, price:488.30, chg1d:-0.88, chg1w:-1.24, pe:24.1, ps:8.4,  pb:7.2,  roe:32.1, grossMarginPct:81.1, netMarginPct:29.9, beta:1.30, avgVolM:14.3, divYield:0.00 },
  { sym:"AMD",   name:"Advanced Micro Devices",sector:"Technology",     marketCapB: 272, price:168.55, chg1d: 4.71, chg1w: 6.82, pe:44.2, ps:7.8,  pb:3.8,  roe:8.6,  grossMarginPct:48.4, netMarginPct:5.5,  beta:1.61, avgVolM:42.1, divYield:0.00 },
  { sym:"INTC",  name:"Intel Corp.",          sector:"Technology",      marketCapB:  88, price:20.82,  chg1d:-1.24, chg1w:-3.41, pe:null, ps:1.2,  pb:1.0,  roe:-4.8, grossMarginPct:32.7, netMarginPct:-14.1,beta:0.98, avgVolM:38.4, divYield:1.44 },
  { sym:"AVGO",  name:"Broadcom Inc.",        sector:"Technology",      marketCapB: 714, price:168.20, chg1d: 2.51, chg1w: 3.88, pe:37.2, ps:10.4, pb:8.9,  roe:23.8, grossMarginPct:75.3, netMarginPct:28.1, beta:1.22, avgVolM:6.8,  divYield:1.54 },
  { sym:"CRM",   name:"Salesforce Inc.",      sector:"Technology",      marketCapB: 311, price:320.10, chg1d: 1.44, chg1w: 0.92, pe:42.8, ps:7.9,  pb:4.2,  roe:9.8,  grossMarginPct:75.8, netMarginPct:15.4, beta:1.18, avgVolM:5.4,  divYield:0.00 },
  { sym:"ORCL",  name:"Oracle Corp.",         sector:"Technology",      marketCapB: 331, price:122.40, chg1d: 0.88, chg1w: 2.14, pe:21.4, ps:5.8,  pb:null, roe:null, grossMarginPct:71.2, netMarginPct:19.8, beta:0.92, avgVolM:8.8,  divYield:1.48 },
  { sym:"PLTR",  name:"Palantir Tech.",       sector:"Technology",      marketCapB:  52, price:24.82,  chg1d: 3.44, chg1w: 8.21, pe:null, ps:14.2, pb:6.8,  roe:-2.1, grossMarginPct:80.1, netMarginPct:-1.2, beta:1.84, avgVolM:68.4, divYield:0.00 },
  { sym:"MRVL",  name:"Marvell Technology",   sector:"Technology",      marketCapB:  63, price:74.30,  chg1d: 2.18, chg1w: 4.44, pe:null, ps:7.6,  pb:3.1,  roe:-4.4, grossMarginPct:51.2, netMarginPct:-8.8, beta:1.56, avgVolM:12.4, divYield:0.45 },
  // ── Financials ──────────────────────────────────────────────────────────
  { sym:"JPM",   name:"JPMorgan Chase",       sector:"Financials",      marketCapB: 578, price:196.80, chg1d: 0.33, chg1w: 0.88, pe:12.1, ps:3.4,  pb:1.9,  roe:16.8, grossMarginPct:62.1, netMarginPct:27.4, beta:1.12, avgVolM:9.4,  divYield:2.24 },
  { sym:"BAC",   name:"Bank of America",      sector:"Financials",      marketCapB: 303, price:38.24,  chg1d: 0.12, chg1w: 0.44, pe:13.4, ps:2.8,  pb:1.1,  roe:8.6,  grossMarginPct:55.4, netMarginPct:20.1, beta:1.34, avgVolM:38.8, divYield:2.60 },
  { sym:"GS",    name:"Goldman Sachs",        sector:"Financials",      marketCapB: 132, price:488.10, chg1d: 1.44, chg1w: 2.88, pe:15.6, ps:2.4,  pb:1.6,  roe:10.4, grossMarginPct:70.1, netMarginPct:15.4, beta:1.48, avgVolM:2.8,  divYield:2.68 },
  { sym:"MS",    name:"Morgan Stanley",       sector:"Financials",      marketCapB: 163, price:98.40,  chg1d: 0.88, chg1w: 1.44, pe:17.8, ps:2.8,  pb:1.8,  roe:10.4, grossMarginPct:68.4, netMarginPct:15.6, beta:1.38, avgVolM:8.4,  divYield:3.24 },
  { sym:"V",     name:"Visa Inc.",            sector:"Financials",      marketCapB: 525, price:274.20, chg1d: 0.54, chg1w: 1.22, pe:29.4, ps:13.8, pb:12.4, roe:44.8, grossMarginPct:80.2, netMarginPct:52.6, beta:0.94, avgVolM:6.4,  divYield:0.76 },
  { sym:"MA",    name:"Mastercard Inc.",      sector:"Financials",      marketCapB: 414, price:445.80, chg1d: 0.68, chg1w: 1.44, pe:32.1, ps:14.8, pb:53.8, roe:166,  grossMarginPct:78.4, netMarginPct:46.2, beta:0.98, avgVolM:3.4,  divYield:0.58 },
  // ── Healthcare ──────────────────────────────────────────────────────────
  { sym:"JNJ",   name:"Johnson & Johnson",    sector:"Healthcare",      marketCapB: 392, price:160.40, chg1d: 0.22, chg1w:-0.44, pe:14.8, ps:4.2,  pb:5.4,  roe:36.8, grossMarginPct:68.8, netMarginPct:28.4, beta:0.58, avgVolM:7.2,  divYield:3.04 },
  { sym:"LLY",   name:"Eli Lilly & Co.",      sector:"Healthcare",      marketCapB: 714, price:748.20, chg1d: 1.24, chg1w: 2.88, pe:61.4, ps:18.2, pb:48.8, roe:78.4, grossMarginPct:82.1, netMarginPct:22.4, beta:0.42, avgVolM:3.8,  divYield:0.60 },
  { sym:"UNH",   name:"UnitedHealth Group",   sector:"Healthcare",      marketCapB: 462, price:494.10, chg1d: 0.44, chg1w: 0.88, pe:19.4, ps:0.9,  pb:5.4,  roe:28.4, grossMarginPct:23.8, netMarginPct:6.4,  beta:0.62, avgVolM:2.4,  divYield:1.56 },
  { sym:"MRNA",  name:"Moderna Inc.",         sector:"Healthcare",      marketCapB:  18, price:48.80,  chg1d:-1.88, chg1w:-4.12, pe:null, ps:2.8,  pb:1.0,  roe:-38,  grossMarginPct:47.4, netMarginPct:-96,  beta:1.24, avgVolM:8.4,  divYield:0.00 },
  // ── Energy ──────────────────────────────────────────────────────────────
  { sym:"XOM",   name:"ExxonMobil Corp.",     sector:"Energy",          marketCapB: 522, price:112.20, chg1d:-2.44, chg1w:-3.88, pe:13.4, ps:1.2,  pb:2.1,  roe:16.1, grossMarginPct:38.2, netMarginPct:9.8,  beta:0.82, avgVolM:18.4, divYield:3.40 },
  { sym:"CVX",   name:"Chevron Corp.",        sector:"Energy",          marketCapB: 267, price:155.40, chg1d:-2.11, chg1w:-3.24, pe:14.8, ps:1.4,  pb:1.9,  roe:13.8, grossMarginPct:36.4, netMarginPct:10.4, beta:0.88, avgVolM:8.8,  divYield:4.24 },
  { sym:"SLB",   name:"SLB (Schlumberger)",   sector:"Energy",          marketCapB:  62, price:46.70,  chg1d:-1.88, chg1w:-3.11, pe:12.4, ps:1.8,  pb:2.4,  roe:18.8, grossMarginPct:20.4, netMarginPct:10.8, beta:1.44, avgVolM:10.4, divYield:2.56 },
  { sym:"DVN",   name:"Devon Energy",         sector:"Energy",          marketCapB:  24, price:42.80,  chg1d:-1.44, chg1w:-2.88, pe:8.4,  ps:1.4,  pb:1.8,  roe:22.4, grossMarginPct:64.8, netMarginPct:18.4, beta:2.08, avgVolM:8.8,  divYield:5.48 },
  // ── Consumer Cyclical ────────────────────────────────────────────────────
  { sym:"AMZN",  name:"Amazon.com Inc.",      sector:"Consumer Cyclical",marketCapB:1910,price:184.60, chg1d: 0.68, chg1w: 1.88, pe:41.2, ps:3.2,  pb:8.6,  roe:20.5, grossMarginPct:47.6, netMarginPct:5.3,  beta:1.18, avgVolM:42.8, divYield:0.00 },
  { sym:"TSLA",  name:"Tesla Inc.",           sector:"Consumer Cyclical",marketCapB: 572,price:182.40, chg1d:-1.24, chg1w:-3.88, pe:76.4, ps:6.8,  pb:12.3, roe:15.6, grossMarginPct:17.9, netMarginPct:7.3,  beta:2.28, avgVolM:98.4, divYield:0.00 },
  { sym:"HD",    name:"Home Depot Inc.",      sector:"Consumer Cyclical",marketCapB: 342,price:345.20, chg1d: 0.44, chg1w: 0.88, pe:21.4, ps:2.4,  pb:null, roe:null, grossMarginPct:33.4, netMarginPct:10.4, beta:1.04, avgVolM:4.4,  divYield:2.40 },
  { sym:"MCD",   name:"McDonald's Corp.",     sector:"Consumer Cyclical",marketCapB: 218,price:297.40, chg1d: 0.12, chg1w:-0.44, pe:24.8, ps:7.4,  pb:null, roe:null, grossMarginPct:57.4, netMarginPct:30.4, beta:0.74, avgVolM:3.4,  divYield:2.36 },
  // ── Consumer Staples ─────────────────────────────────────────────────────
  { sym:"KO",    name:"Coca-Cola Co.",        sector:"Consumer Staples", marketCapB: 266,price:60.80,  chg1d: 0.22, chg1w: 0.44, pe:23.4, ps:6.4,  pb:9.8,  roe:41.8, grossMarginPct:60.4, netMarginPct:22.4, beta:0.58, avgVolM:12.4, divYield:3.04 },
  { sym:"PEP",   name:"PepsiCo Inc.",         sector:"Consumer Staples", marketCapB: 218,price:158.40, chg1d: 0.14, chg1w: 0.22, pe:22.4, ps:2.8,  pb:12.4, roe:54.8, grossMarginPct:54.8, netMarginPct:10.4, beta:0.56, avgVolM:5.8,  divYield:3.24 },
  { sym:"WMT",   name:"Walmart Inc.",         sector:"Consumer Staples", marketCapB: 584,price:72.40,  chg1d: 0.88, chg1w: 2.14, pe:30.8, ps:0.9,  pb:7.4,  roe:24.4, grossMarginPct:23.8, netMarginPct:2.4,  beta:0.52, avgVolM:9.4,  divYield:1.12 },
  // ── Industrials ─────────────────────────────────────────────────────────
  { sym:"CAT",   name:"Caterpillar Inc.",     sector:"Industrials",     marketCapB: 183, price:370.40, chg1d: 0.68, chg1w: 1.24, pe:17.4, ps:3.4,  pb:9.8,  roe:56.4, grossMarginPct:38.4, netMarginPct:17.4, beta:1.22, avgVolM:2.4,  divYield:1.62 },
  { sym:"BA",    name:"Boeing Co.",           sector:"Industrials",     marketCapB: 124, price:188.40, chg1d:-0.88, chg1w:-2.44, pe:null, ps:1.4,  pb:null, roe:null, grossMarginPct:2.4,  netMarginPct:-7.8, beta:1.54, avgVolM:8.4,  divYield:0.00 },
  { sym:"HON",   name:"Honeywell Intl.",      sector:"Industrials",     marketCapB: 130, price:196.20, chg1d: 0.44, chg1w: 0.88, pe:22.4, ps:3.4,  pb:6.8,  roe:30.4, grossMarginPct:32.4, netMarginPct:14.4, beta:1.04, avgVolM:3.4,  divYield:2.08 },
  // ── Communication Services ───────────────────────────────────────────────
  { sym:"NFLX",  name:"Netflix Inc.",         sector:"Comm Services",   marketCapB: 268, price:615.40, chg1d: 1.88, chg1w: 4.44, pe:42.4, ps:8.4,  pb:12.4, roe:28.4, grossMarginPct:42.4, netMarginPct:16.4, beta:1.24, avgVolM:4.4,  divYield:0.00 },
  { sym:"DIS",   name:"Walt Disney Co.",      sector:"Comm Services",   marketCapB: 197, price:108.40, chg1d: 0.44, chg1w: 1.24, pe:null, ps:2.4,  pb:1.8,  roe:-4.8, grossMarginPct:36.4, netMarginPct:-1.4, beta:1.08, avgVolM:10.4, divYield:0.36 },
  // ── Utilities ────────────────────────────────────────────────────────────
  { sym:"NEE",   name:"NextEra Energy",       sector:"Utilities",       marketCapB: 140, price:72.40,  chg1d:-0.22, chg1w:-0.88, pe:21.4, ps:5.4,  pb:2.8,  roe:12.4, grossMarginPct:65.4, netMarginPct:22.4, beta:0.58, avgVolM:8.4,  divYield:2.96 },
  { sym:"DUK",   name:"Duke Energy",          sector:"Utilities",       marketCapB: 114, price:100.40, chg1d: 0.12, chg1w:-0.24, pe:19.4, ps:2.4,  pb:1.8,  roe:9.4,  grossMarginPct:47.4, netMarginPct:14.4, beta:0.46, avgVolM:4.4,  divYield:4.24 },
  // ── Materials ────────────────────────────────────────────────────────────
  { sym:"FCX",   name:"Freeport-McMoRan",     sector:"Materials",       marketCapB:  62, price:42.40,  chg1d: 0.64, chg1w: 1.88, pe:21.4, ps:3.4,  pb:3.8,  roe:17.4, grossMarginPct:40.4, netMarginPct:14.4, beta:1.88, avgVolM:18.4, divYield:1.48 },
  { sym:"NEM",   name:"Newmont Corp.",        sector:"Materials",        marketCapB:  54, price:46.80,  chg1d: 1.24, chg1w: 2.88, pe:48.4, ps:2.8,  pb:1.8,  roe:3.8,  grossMarginPct:41.4, netMarginPct:6.4,  beta:0.52, avgVolM:10.4, divYield:2.56 },
  // ── Real Estate ──────────────────────────────────────────────────────────
  { sym:"AMT",   name:"American Tower",       sector:"Real Estate",     marketCapB:  92, price:198.40, chg1d:-0.44, chg1w:-0.88, pe:44.4, ps:8.4,  pb:null, roe:null, grossMarginPct:72.4, netMarginPct:12.4, beta:0.84, avgVolM:2.4,  divYield:3.04 },
  { sym:"PLD",   name:"Prologis Inc.",        sector:"Real Estate",     marketCapB: 104, price:126.40, chg1d:-0.22, chg1w:-0.44, pe:34.4, ps:14.4, pb:2.4,  roe:6.8,  grossMarginPct:75.4, netMarginPct:40.4, beta:1.02, avgVolM:4.4,  divYield:2.88 },
];
