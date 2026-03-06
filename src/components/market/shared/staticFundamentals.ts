export interface TickerFundamentals {
  name: string;
  sector: string;
  description: string;
  metrics: {
    pe: number | null;
    pb: number;
    ps: number;
    evEbitda: number | null;
    roe: number;
    debtEquity: number;
    grossMarginPct: number;
    netMarginPct: number;
    marketCapB: number;
    beta: number;
    divYield: number;
  };
  income: {
    years: number[];
    revenue: number[];      // $M
    grossProfit: number[];
    operatingIncome: number[];
    netIncome: number[];
    eps: number[];
  };
  balanceSheet: {
    years: number[];
    totalAssets: number[];
    totalLiabilities: number[];
    equity: number[];
    cash: number[];
    longTermDebt: number[];
  };
  cashFlow: {
    years: number[];
    operatingCF: number[];
    capex: number[];
    freeCashFlow: number[];
  };
}

const Y = [2021, 2022, 2023, 2024];

export const FUNDAMENTALS: Record<string, TickerFundamentals> = {
  AAPL: {
    name: "Apple Inc.", sector: "Technology",
    description: "Apple designs and manufactures consumer electronics, software, and services. Key products include iPhone, Mac, iPad, Apple Watch, and the App Store / iCloud ecosystem.",
    metrics: { pe: 29.4, pb: 48.2, ps: 7.9, evEbitda: 22.1, roe: 163, debtEquity: 1.96, grossMarginPct: 44.1, netMarginPct: 24.3, marketCapB: 2820, beta: 1.24, divYield: 0.56 },
    income:       { years: Y, revenue: [365817,394328,383285,391035], grossProfit: [152836,170782,169148,172282], operatingIncome: [108949,119437,114301,123216], netIncome: [94680,99803,96995,101956], eps: [5.61,6.11,6.13,6.57] },
    balanceSheet: { years: Y, totalAssets: [351002,352755,352583,364980], totalLiabilities: [287912,302083,290437,308030], equity: [63090,50672,62146,56950], cash: [62639,48304,61555,65171], longTermDebt: [109106,98959,95281,85750] },
    cashFlow:     { years: Y, operatingCF: [104038,122151,110543,118254], capex: [-11085,-10708,-10959,-9448], freeCashFlow: [92953,111443,99584,108806] },
  },
  NVDA: {
    name: "NVIDIA Corp.", sector: "Technology",
    description: "NVIDIA designs graphics processing units (GPUs) and system-on-chip units. A dominant force in AI accelerators, data centers, gaming, and autonomous vehicles.",
    metrics: { pe: 52.3, pb: 38.7, ps: 22.4, evEbitda: 44.8, roe: 86.2, debtEquity: 0.42, grossMarginPct: 74.6, netMarginPct: 48.8, marketCapB: 2090, beta: 1.72, divYield: 0.03 },
    income:       { years: Y, revenue: [16675,26974,44870,130497], grossProfit: [10926,17475,26977,97293], operatingIncome: [4532,6803,17475,81453], netIncome: [4332,4368,14881,63706], eps: [1.73,1.74,5.98,25.78] },
    balanceSheet: { years: Y, totalAssets: [28791,41186,65728,111601], totalLiabilities: [11702,17575,22904,27733], equity: [16089,23591,42798,83868], cash: [1990,3649,10237,32073], longTermDebt: [5964,8977,9908,8464] },
    cashFlow:     { years: Y, operatingCF: [5822,9108,15904,81521], capex: [-974,-1833,-1069,-1069], freeCashFlow: [4848,7275,14835,80452] },
  },
  MSFT: {
    name: "Microsoft Corp.", sector: "Technology",
    description: "Microsoft develops software (Windows, Office 365), cloud services (Azure), gaming (Xbox), and LinkedIn. Azure is the #2 cloud platform globally by revenue.",
    metrics: { pe: 34.8, pb: 12.4, ps: 12.1, evEbitda: 26.3, roe: 35.1, debtEquity: 0.35, grossMarginPct: 69.4, netMarginPct: 34.1, marketCapB: 3110, beta: 0.88, divYield: 0.73 },
    income:       { years: Y, revenue: [168088,198270,211915,245122], grossProfit: [115856,135620,146052,169770], operatingIncome: [69916,83383,88523,109433], netIncome: [61271,72738,72361,88136], eps: [8.05,9.65,9.72,11.80] },
    balanceSheet: { years: Y, totalAssets: [333779,364840,411976,512163], totalLiabilities: [191791,198298,205753,243686], equity: [141988,166542,206223,268477], cash: [130334,99540,111262,75527], longTermDebt: [51072,47032,41990,42688] },
    cashFlow:     { years: Y, operatingCF: [76740,89035,87582,118548], capex: [-20622,-23886,-28107,-44482], freeCashFlow: [56118,65149,59475,74066] },
  },
  GOOGL: {
    name: "Alphabet Inc.", sector: "Technology",
    description: "Alphabet (Google) generates revenue from search ads, YouTube, Google Cloud, Waymo, and other bets. Google Cloud is #3 globally and growing rapidly.",
    metrics: { pe: 22.4, pb: 6.1, ps: 5.8, evEbitda: 15.2, roe: 28.4, debtEquity: 0.08, grossMarginPct: 56.1, netMarginPct: 22.4, marketCapB: 2140, beta: 1.05, divYield: 0.00 },
    income:       { years: Y, revenue: [257637,282836,307394,350018], grossProfit: [141665,156633,174062,196028], operatingIncome: [78714,74842,84293,112390], netIncome: [76033,59972,73795,100118], eps: [5.61,4.56,5.80,8.05] },
    balanceSheet: { years: Y, totalAssets: [359268,365264,402392,450256], totalLiabilities: [107633,109120,112668,119412], equity: [251635,256144,283379,330844], cash: [139649,113760,118331,110920], longTermDebt: [14817,14701,13253,10554] },
    cashFlow:     { years: Y, operatingCF: [91652,91495,101746,125277], capex: [-24173,-31485,-32251,-52045], freeCashFlow: [67479,60010,69495,73232] },
  },
  META: {
    name: "Meta Platforms", sector: "Technology",
    description: "Meta operates Facebook, Instagram, WhatsApp, and Messenger. Revenue is primarily advertising. Reality Labs is investing heavily in VR/AR hardware and the metaverse.",
    metrics: { pe: 24.1, pb: 7.2, ps: 8.4, evEbitda: 16.8, roe: 32.1, debtEquity: 0.15, grossMarginPct: 81.1, netMarginPct: 29.9, marketCapB: 1250, beta: 1.30, divYield: 0.00 },
    income:       { years: Y, revenue: [117929,116609,134902,164501], grossProfit: [96144,94479,109894,133343], operatingIncome: [46753,28940,46751,69381], netIncome: [39370,23200,39098,50708], eps: [13.77,8.59,14.87,19.43] },
    balanceSheet: { years: Y, totalAssets: [165987,185727,229623,265795], totalLiabilities: [31082,43510,59000,70016], equity: [134905,142227,170585,195779], cash: [48083,40754,65395,78174], longTermDebt: [10687,9923,18385,28826] },
    cashFlow:     { years: Y, operatingCF: [57683,50475,71113,91122], capex: [-19244,-31431,-28101,-37737], freeCashFlow: [38439,19044,43012,53385] },
  },
  AMZN: {
    name: "Amazon.com Inc.", sector: "Consumer Cyclical",
    description: "Amazon operates e-commerce, AWS (cloud), advertising, Prime, and Whole Foods. AWS is the #1 cloud platform globally and the primary profit driver.",
    metrics: { pe: 41.2, pb: 8.6, ps: 3.2, evEbitda: 22.1, roe: 20.5, debtEquity: 0.67, grossMarginPct: 47.6, netMarginPct: 5.3, marketCapB: 1910, beta: 1.18, divYield: 0.00 },
    income:       { years: Y, revenue: [469822,513983,574785,632000], grossProfit: [197478,225152,272550,300838], operatingIncome: [24879,12248,36852,68869], netIncome: [33364,-2722,30425,59248], eps: [6.52,-0.53,5.94,11.42] },
    balanceSheet: { years: Y, totalAssets: [420549,462675,527854,620265], totalLiabilities: [282304,316632,325981,389268], equity: [138245,146043,201875,230997], cash: [96049,70026,86780,101207], longTermDebt: [48744,67149,58314,52978] },
    cashFlow:     { years: Y, operatingCF: [46327,46752,84946,115880], capex: [-61053,-58321,-52729,-48148], freeCashFlow: [-14726,-11569,32217,67732] },
  },
  TSLA: {
    name: "Tesla Inc.", sector: "Consumer Cyclical",
    description: "Tesla designs and manufactures electric vehicles, energy storage, and solar products. Also developing autonomous driving (FSD) and humanoid robots (Optimus).",
    metrics: { pe: 76.4, pb: 12.3, ps: 6.8, evEbitda: 42.1, roe: 15.6, debtEquity: 0.17, grossMarginPct: 17.9, netMarginPct: 7.3, marketCapB: 572, beta: 2.28, divYield: 0.00 },
    income:       { years: Y, revenue: [53823,81462,96773,97690], grossProfit: [13656,20853,17660,17452], operatingIncome: [6523,13656,8891,7092], netIncome: [5644,12556,14997,7153], eps: [1.87,4.07,4.73,2.24] },
    balanceSheet: { years: Y, totalAssets: [62131,82338,106618,122070], totalLiabilities: [30548,36440,43009,48362], equity: [30189,44704,62634,72208], cash: [17576,22185,29094,36571], longTermDebt: [5245,1597,2431,5282] },
    cashFlow:     { years: Y, operatingCF: [11497,14185,13256,14923], capex: [-6515,-7158,-8897,-11093], freeCashFlow: [4982,7027,4359,3830] },
  },
  XOM: {
    name: "ExxonMobil Corp.", sector: "Energy",
    description: "ExxonMobil is one of the world's largest publicly traded oil & gas companies. Operations span upstream (E&P), downstream (refining), and chemicals.",
    metrics: { pe: 13.4, pb: 2.1, ps: 1.2, evEbitda: 6.8, roe: 16.1, debtEquity: 0.18, grossMarginPct: 38.2, netMarginPct: 9.8, marketCapB: 522, beta: 0.82, divYield: 3.4 },
    income:       { years: Y, revenue: [276692,398675,344582,425248], grossProfit: [105730,152346,131627,162469], operatingIncome: [23119,56248,36014,55808], netIncome: [23040,55740,36010,33679], eps: [5.39,13.26,8.89,8.41] },
    balanceSheet: { years: Y, totalAssets: [338923,369067,376317,453045], totalLiabilities: [163012,170766,167117,222714], equity: [157912,168268,168291,189817], cash: [6802,29640,31539,33240], longTermDebt: [43184,36197,37483,33878] },
    cashFlow:     { years: Y, operatingCF: [48129,76811,55367,67087], capex: [-12819,-16597,-17096,-22245], freeCashFlow: [35310,60214,38271,44842] },
  },
  JPM: {
    name: "JPMorgan Chase", sector: "Financials",
    description: "JPMorgan Chase is the largest US bank by assets. Operates consumer banking, commercial banking, investment banking (CIB), asset management, and treasury services.",
    metrics: { pe: 12.1, pb: 1.9, ps: 3.4, evEbitda: null, roe: 16.8, debtEquity: 1.22, grossMarginPct: 62.1, netMarginPct: 27.4, marketCapB: 578, beta: 1.12, divYield: 2.24 },
    income:       { years: Y, revenue: [121649,128695,162407,176176], grossProfit: [75499,79791,100892,109469], operatingIncome: [39991,40658,52892,64042], netIncome: [48334,37676,49552,58471], eps: [15.36,12.09,16.23,19.48] },
    balanceSheet: { years: Y, totalAssets: [3743567,3665743,3875393,4009662], totalLiabilities: [3460988,3390060,3583024,3693272], equity: [282579,292683,292369,316390], cash: [594872,620026,573046,623142], longTermDebt: [281940,302099,304041,318672] },
    cashFlow:     { years: Y, operatingCF: [27819,-48498,22437,88245], capex: [-3948,-4248,-4637,-5284], freeCashFlow: [23871,-52746,17800,82961] },
  },
  SPY: {
    name: "SPDR S&P 500 ETF", sector: "ETF",
    description: "The SPY ETF tracks the S&P 500 index, providing broad US large-cap equity exposure. It is the world's most liquid equity instrument by volume.",
    metrics: { pe: 22.4, pb: 4.1, ps: 2.6, evEbitda: 15.8, roe: 18.3, debtEquity: 0.00, grossMarginPct: 0, netMarginPct: 0, marketCapB: 520, beta: 1.00, divYield: 1.32 },
    income:       { years: Y, revenue: [0,0,0,0], grossProfit: [0,0,0,0], operatingIncome: [0,0,0,0], netIncome: [0,0,0,0], eps: [0,0,0,0] },
    balanceSheet: { years: Y, totalAssets: [0,0,0,0], totalLiabilities: [0,0,0,0], equity: [0,0,0,0], cash: [0,0,0,0], longTermDebt: [0,0,0,0] },
    cashFlow:     { years: Y, operatingCF: [0,0,0,0], capex: [0,0,0,0], freeCashFlow: [0,0,0,0] },
  },
  QQQ: {
    name: "Invesco QQQ ETF", sector: "ETF",
    description: "QQQ tracks the Nasdaq-100 index, giving exposure to the 100 largest non-financial companies listed on Nasdaq. Heavy tech weighting (~65%).",
    metrics: { pe: 31.8, pb: 6.8, ps: 4.1, evEbitda: 22.4, roe: 0, debtEquity: 0.00, grossMarginPct: 0, netMarginPct: 0, marketCapB: 252, beta: 1.14, divYield: 0.56 },
    income:       { years: Y, revenue: [0,0,0,0], grossProfit: [0,0,0,0], operatingIncome: [0,0,0,0], netIncome: [0,0,0,0], eps: [0,0,0,0] },
    balanceSheet: { years: Y, totalAssets: [0,0,0,0], totalLiabilities: [0,0,0,0], equity: [0,0,0,0], cash: [0,0,0,0], longTermDebt: [0,0,0,0] },
    cashFlow:     { years: Y, operatingCF: [0,0,0,0], capex: [0,0,0,0], freeCashFlow: [0,0,0,0] },
  },
};

export function getFundamentals(sym: string): TickerFundamentals | null {
  return FUNDAMENTALS[sym.toUpperCase()] ?? null;
}
