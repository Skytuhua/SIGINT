"use client";

import React, { useRef, useEffect, useState } from "react";

/* ── Types ────────────────────────────────────────────────────── */
interface Stock  { sym: string; name: string; pct: number; mcap: number; sub?: string; }
interface Sector { id: string; label: string; stocks: Stock[]; }
interface TRect  { x: number; y: number; w: number; h: number; }
interface Placed { index: number; x: number; y: number; w: number; h: number; }

/* ── Heat Colour ──────────────────────────────────────────────── */
function heatBg(pct: number): string {
  const a = Math.abs(pct);
  if (pct >= 0) {
    if (a < 0.5) return "#0d2115";
    if (a < 2)   return "#133520";
    if (a < 5)   return "#18562a";
    if (a < 10)  return "#1b7533";
    if (a < 20)  return "#1d9e3d";
    return "#15c042";
  } else {
    if (a < 0.5) return "#1c0e0e";
    if (a < 2)   return "#391212";
    if (a < 5)   return "#591616";
    if (a < 10)  return "#781b1b";
    if (a < 20)  return "#9e1c1c";
    return "#c41818";
  }
}

function heatBorder(pct: number): string {
  if (pct > 15)  return "rgba(22,190,66,0.5)";
  if (pct > 3)   return "rgba(27,117,51,0.35)";
  if (pct < -15) return "rgba(196,24,24,0.5)";
  if (pct < -3)  return "rgba(120,27,27,0.35)";
  return "rgba(255,255,255,0.06)";
}

/* ── Squarified Treemap ───────────────────────────────────────── */
function squarify(rawWeights: number[], rect: TRect): Placed[] {
  const items = rawWeights
    .map((w, i) => ({ w: Math.max(w, 0.001), i }))
    .sort((a, b) => b.w - a.w);
  const results: Placed[] = new Array(rawWeights.length);

  function layout(arr: { w: number; i: number }[], r: TRect) {
    if (!arr.length) return;
    if (arr.length === 1) {
      results[arr[0].i] = { index: arr[0].i, x: r.x, y: r.y, w: r.w, h: r.h };
      return;
    }
    const total = arr.reduce((s, it) => s + it.w, 0);
    if (total <= 0) {
      arr.forEach(it => { results[it.i] = { index: it.i, x: r.x, y: r.y, w: 0, h: 0 }; });
      return;
    }
    const horiz    = r.w >= r.h;
    const crossLen = horiz ? r.h : r.w;
    const mainLen  = horiz ? r.w : r.h;

    let strip: typeof arr = [], stripSum = 0, prevWorst = Infinity;
    for (const item of arr) {
      const cStrip = [...strip, item];
      const cSum   = stripSum + item.w;
      const stripM = (cSum / total) * mainLen;
      let worst = 0;
      for (const si of cStrip) {
        const cross = (si.w / cSum) * crossLen;
        worst = Math.max(worst, stripM / cross, cross / stripM);
      }
      if (strip.length > 0 && worst > prevWorst + 0.001) break;
      strip = cStrip; stripSum = cSum; prevWorst = worst;
    }

    const stripM = (stripSum / total) * mainLen;
    let pos = horiz ? r.y : r.x;
    for (const si of strip) {
      const cross = (si.w / stripSum) * crossLen;
      results[si.i] = horiz
        ? { index: si.i, x: r.x, y: pos, w: stripM, h: cross }
        : { index: si.i, x: pos, y: r.y, w: cross, h: stripM };
      pos += cross;
    }
    const nextR: TRect = horiz
      ? { x: r.x + stripM, y: r.y, w: r.w - stripM, h: r.h }
      : { x: r.x, y: r.y + stripM, w: r.w, h: r.h - stripM };
    layout(arr.slice(strip.length), nextR);
  }

  layout(items, rect);
  return results;
}

/* ── Data ─────────────────────────────────────────────────────── */
const SECTORS: Sector[] = [
  { id: "tech", label: "TECHNOLOGY", stocks: [
    { sym: "MSFT",   name: "Microsoft",    pct:  14.89, mcap: 2850, sub: "SOFTWARE - INFRASTRUCTURE" },
    { sym: "NVDA",   name: "Nvidia",       pct:  39.56, mcap: 2200, sub: "SEMICONDUCTORS" },
    { sym: "AAPL",   name: "Apple",        pct:   8.87, mcap: 2750, sub: "CONSUMER ELECTRONICS" },
    { sym: "AVGO",   name: "Broadcom",     pct:  49.86, mcap:  660 },
    { sym: "ORCL",   name: "Oracle",       pct:  17.22, mcap:  430 },
    { sym: "AMD",    name: "AMD",          pct:  77.90, mcap:  290 },
    { sym: "IBM",    name: "IBM",          pct:   4.80, mcap:  190 },
    { sym: "CRM",    name: "Salesforce",   pct: -20.66, mcap:  230, sub: "SOFTWARE - APPLI" },
    { sym: "ADBE",   name: "Adobe",        pct:  -3.12, mcap:  210 },
    { sym: "CSCO",   name: "Cisco",        pct:   2.10, mcap:  220, sub: "COMPUTE" },
    { sym: "INTC",   name: "Intel",        pct:  -8.20, mcap:  160 },
    { sym: "UBER",   name: "Uber",         pct:   9.30, mcap:  130 },
    { sym: "PLTR",   name: "Palantir",     pct:  27.40, mcap:  180 },
    { sym: "PANW",   name: "Palo Alto",    pct:   5.10, mcap:  130 },
    { sym: "CRWD",   name: "CrowdStrike",  pct:  37.65, mcap:  110 },
    { sym: "MU",     name: "Micron",       pct: 239.39, mcap:  130 },
    { sym: "TXN",    name: "Texas Instr",  pct:  -7.21, mcap:  150 },
    { sym: "ADI",    name: "Analog Dev",   pct:   1.20, mcap:   90 },
    { sym: "KLAC",   name: "KLA Corp",     pct:   3.40, mcap:   90 },
    { sym: "APH",    name: "Amphenol",     pct:   5.10, mcap:   80 },
    { sym: "INFOR",  name: "Informatica",  pct:   3.20, mcap:   55 },
    { sym: "TEL",    name: "TE Connect",   pct:   2.10, mcap:   55 },
    { sym: "NOW",    name: "ServiceNow",   pct:   8.50, mcap:  130 },
    { sym: "COMMUNI",name: "Commun Co",    pct:   1.40, mcap:   40 },
    { sym: "SEMIC",  name: "Semi Co",      pct:   0.80, mcap:   40 },
    { sym: "ACN",    name: "Accenture",    pct:   0.80, mcap:   55 },
  ]},
  { id: "cy", label: "CONSUMER CYCLICAL", stocks: [
    { sym: "AMZN",   name: "Amazon",       pct:   5.37, mcap: 1850, sub: "INTERNET RETAIL" },
    { sym: "TSLA",   name: "Tesla",        pct:  11.44, mcap:  680, sub: "AUTO MAN" },
    { sym: "HD",     name: "Home Depot",   pct: -11.26, mcap:  340, sub: "HOME IM" },
    { sym: "MCD",    name: "McDonald's",   pct:   1.10, mcap:  210 },
    { sym: "BKNG",   name: "Booking",      pct:   3.20, mcap:  140, sub: "TRAV" },
    { sym: "NKE",    name: "Nike",         pct:  -4.20, mcap:  130 },
    { sym: "SBUX",   name: "Starbucks",    pct:  -3.10, mcap:  100, sub: "RESTAU" },
    { sym: "RCL",    name: "Royal Carib",  pct:   6.40, mcap:   60 },
    { sym: "APPA",   name: "Apparel Co",   pct:  -2.10, mcap:   45 },
    { sym: "TRAV2",  name: "Travel Co",    pct:   1.20, mcap:   42 },
    { sym: "AUTO",   name: "AutoNation",   pct:  -0.80, mcap:   38 },
  ]},
  { id: "comm", label: "COMMUNICATION SERVICES", stocks: [
    { sym: "GOOGL",  name: "Alphabet",     pct:  65.37, mcap: 2050, sub: "INTERNET CONTENT" },
    { sym: "META",   name: "Meta",         pct:  12.67, mcap: 1300 },
    { sym: "NFLX",   name: "Netflix",      pct:   5.23, mcap:  270, sub: "ENTERTAIN" },
    { sym: "DIS",    name: "Disney",       pct:   2.23, mcap:  200 },
    { sym: "TMUS",   name: "T-Mobile",     pct:   2.35, mcap:  190, sub: "TELECOM S" },
    { sym: "VZ",     name: "Verizon",      pct:   2.35, mcap:  160 },
    { sym: "T",      name: "AT&T",         pct:  -1.20, mcap:  130 },
    { sym: "EA",     name: "Elec Arts",    pct:  -0.80, mcap:   40, sub: "ADVER" },
  ]},
  { id: "fin", label: "FINANCIAL", stocks: [
    { sym: "BRK-B",  name: "Berkshire",    pct:  11.26, mcap:  820, sub: "INSURAN" },
    { sym: "JPM",    name: "JPMorgan",     pct:  35.05, mcap:  580, sub: "BANKS - DIVER" },
    { sym: "V",      name: "Visa",         pct:   4.80, mcap:  530, sub: "CREDIT SERVI" },
    { sym: "MA",     name: "Mastercard",   pct:   8.64, mcap:  460 },
    { sym: "BAC",    name: "Bank of Am",   pct:   2.30, mcap:  290 },
    { sym: "WFC",    name: "Wells Fargo",  pct:   3.20, mcap:  220 },
    { sym: "AXP",    name: "Amex",         pct:  25.03, mcap:  180 },
    { sym: "GS",     name: "Goldman",      pct:   5.10, mcap:  160, sub: "CAPITAL MA" },
    { sym: "MS",     name: "Morgan Stan",  pct:   4.30, mcap:  140 },
    { sym: "SCHW",   name: "Schwab",       pct:   4.50, mcap:  120 },
    { sym: "BLK",    name: "BlackRock",    pct:   2.10, mcap:  110, sub: "ASSET MANA" },
    { sym: "C",      name: "Citigroup",    pct:   1.20, mcap:  120 },
    { sym: "BX",     name: "Blackstone",   pct:   3.20, mcap:  100 },
    { sym: "CB",     name: "Chubb",        pct:   1.40, mcap:   90, sub: "FINANCI" },
    { sym: "COF",    name: "Capital One",  pct:  -1.30, mcap:   60 },
    { sym: "ALL",    name: "Allstate",     pct:   0.80, mcap:   60 },
  ]},
  { id: "hc", label: "HEALTHCARE", stocks: [
    { sym: "LLY",    name: "Eli Lilly",    pct:  39.52, mcap:  710, sub: "DRUG MANUFACTUR" },
    { sym: "UNH",    name: "UnitedHlth",   pct:  -7.40, mcap:  460, sub: "HEALTHCA" },
    { sym: "JNJ",    name: "J&J",          pct:   1.40, mcap:  380 },
    { sym: "ABBV",   name: "AbbVie",       pct:   2.10, mcap:  280 },
    { sym: "MRK",    name: "Merck",        pct:   5.72, mcap:  250 },
    { sym: "ABT",    name: "Abbott",       pct:   0.80, mcap:  210, sub: "MEDICAL" },
    { sym: "PFE",    name: "Pfizer",       pct:  -2.30, mcap:  160 },
    { sym: "AMGN",   name: "Amgen",        pct:  -1.20, mcap:  140 },
    { sym: "SYK",    name: "Stryker",      pct:   1.20, mcap:  140 },
    { sym: "MDT",    name: "Medtronic",    pct:  -0.40, mcap:  120 },
    { sym: "GILD",   name: "Gilead",       pct:   0.60, mcap:   96 },
    { sym: "BSX",    name: "Boston Sci",   pct:  -7.02, mcap:   95 },
    { sym: "CI",     name: "Cigna",        pct:   0.80, mcap:   90 },
    { sym: "DHR",    name: "Danaher",      pct:  -0.80, mcap:   80 },
    { sym: "MCK",    name: "McKesson",     pct:   1.40, mcap:   70 },
    { sym: "HCA",    name: "HCA",          pct:  -2.10, mcap:   60 },
    { sym: "DIAGNOS",name: "Diagnostics",  pct:  -1.80, mcap:   50 },
    { sym: "A",      name: "Agilent",      pct:   1.20, mcap:   40 },
    { sym: "MEDI",   name: "Medline",      pct:  -1.20, mcap:   40 },
  ]},
  { id: "ind", label: "INDUSTRIALS", stocks: [
    { sym: "GE",     name: "GE Aero",      pct:   8.40, mcap:  250, sub: "AEROSPACE &" },
    { sym: "CAT",    name: "Caterpillar",  pct:  58.18, mcap:  190, sub: "FARM &" },
    { sym: "RTX",    name: "RTX Corp",     pct:  56.73, mcap:  165 },
    { sym: "UNP",    name: "Union Pac",    pct:   1.20, mcap:  155 },
    { sym: "BA",     name: "Boeing",       pct:   3.40, mcap:  140 },
    { sym: "HON",    name: "Honeywell",    pct:  -0.80, mcap:  130 },
    { sym: "DE",     name: "Deere",        pct:   2.10, mcap:  100 },
    { sym: "ETN",    name: "Eaton",        pct:   1.40, mcap:  100 },
    { sym: "GEV",    name: "GE Vernova",   pct:   4.20, mcap:   85 },
    { sym: "TT",     name: "Trane",        pct:   1.80, mcap:   75 },
    { sym: "WM",     name: "Waste Mgmt",   pct:   0.60, mcap:   72 },
    { sym: "GD",     name: "Gen Dynamics", pct:   1.20, mcap:   70, sub: "FARM & C" },
    { sym: "PH",     name: "Parker-Han",   pct:   2.10, mcap:   65 },
    { sym: "SPEC",   name: "Specialty Ind",pct:   3.10, mcap:   50 },
    { sym: "HON2",   name: "Honeywell B",  pct:  -0.60, mcap:   42 },
  ]},
  { id: "cd", label: "CONSUMER DEFENS", stocks: [
    { sym: "WMT",    name: "Walmart",      pct:  23.48, mcap:  640, sub: "DISCOUNT ST" },
    { sym: "PG",     name: "P&G",          pct:  -2.30, mcap:  370, sub: "HOUSEHOLD" },
    { sym: "COST",   name: "Costco",       pct:  -5.81, mcap:  300 },
    { sym: "KO",     name: "Coca-Cola",    pct:  -2.10, mcap:  265, sub: "BEVERAGES" },
    { sym: "PEP",    name: "PepsiCo",      pct:  -5.44, mcap:  215 },
    { sym: "PM",     name: "Philip Mor",   pct:  -0.80, mcap:  165, sub: "TOBACCO" },
    { sym: "MDLZ",   name: "Mondelez",     pct:  -1.10, mcap:   75 },
    { sym: "CL",     name: "Colgate",      pct:   0.40, mcap:   65 },
    { sym: "HOUSEH", name: "Household",    pct:  -0.60, mcap:   42 },
    { sym: "DISCO",  name: "Discount Str", pct:   0.90, mcap:   40 },
    { sym: "BEVER",  name: "Beverages Co", pct:   0.20, mcap:   38 },
  ]},
  { id: "en", label: "ENERGY", stocks: [
    { sym: "XOM",    name: "Exxon",        pct:  11.85, mcap:  490, sub: "OIL &" },
    { sym: "CVX",    name: "Chevron",      pct:   5.21, mcap:  285, sub: "OIL & G" },
    { sym: "COP",    name: "ConocoPhil",   pct:   1.30, mcap:  140 },
    { sym: "SLB",    name: "SLB",          pct:  -2.10, mcap:   75 },
    { sym: "EOG",    name: "EOG Res",      pct:   1.40, mcap:   70 },
    { sym: "OXY",    name: "Occidental",   pct:  -3.20, mcap:   60 },
    { sym: "UTILITI",name: "Util Co",      pct:   0.30, mcap:   38, sub: "UTILITI" },
  ]},
  { id: "re", label: "REAL ESTATE", stocks: [
    { sym: "PLD",    name: "Prologis",     pct:  -1.20, mcap:  115 },
    { sym: "AMT",    name: "Amer Tower",   pct:   0.40, mcap:   90 },
    { sym: "EQIX",   name: "Equinix",      pct:   2.10, mcap:   80 },
    { sym: "WELL",   name: "Welltower",    pct:   1.10, mcap:   65 },
  ]},
  { id: "util", label: "UTILITIES", stocks: [
    { sym: "NEE",    name: "NextEra",      pct:   1.20, mcap:  115, sub: "UTILITIES - RE" },
    { sym: "SO",     name: "Southern",     pct:   0.80, mcap:   82 },
    { sym: "DUK",    name: "Duke",         pct:   0.60, mcap:   70 },
    { sym: "D",      name: "Dominion",     pct:  -0.40, mcap:   55 },
  ]},
  { id: "mat", label: "BASIC MAT", stocks: [
    { sym: "LIN",    name: "Linde",        pct:   1.40, mcap:  200, sub: "SPECI" },
    { sym: "SHW",    name: "Sherwin",      pct:   2.10, mcap:   90 },
    { sym: "FCX",    name: "Freeport",     pct:  -2.30, mcap:   70 },
    { sym: "APD",    name: "Air Products", pct:   0.80, mcap:   55 },
    { sym: "NEM",    name: "Newmont",      pct:  -1.40, mcap:   45 },
  ]},
];

/* ── Props ────────────────────────────────────────────────────── */
interface Props {
  style?: React.CSSProperties;
  onTickerClick?: (sym: string) => void;
}

const SECTOR_GAP = 2;
const LABEL_H    = 16;
const TILE_GAP   = 1;

/* ── Component ────────────────────────────────────────────────── */
export default function MarketHeatmapPanel({ style, onTickerClick }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 960, h: 520 });

  useEffect(() => {
    if (!bodyRef.current) return;
    const obs = new ResizeObserver(entries => {
      const e = entries[0];
      if (e) setDims({
        w: Math.max(e.contentRect.width,  80),
        h: Math.max(e.contentRect.height, 80),
      });
    });
    obs.observe(bodyRef.current);
    return () => obs.disconnect();
  }, []);

  const { w, h } = dims;
  const sectorWeights = SECTORS.map(s => s.stocks.reduce((a, b) => a + b.mcap, 0));
  const sectorPlaced  = squarify(sectorWeights, { x: 0, y: 0, w, h });

  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">S&amp;P 500 Sector Heatmap</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)", letterSpacing: "0.04em" }}>
          Market Cap Weighted · 1D Change
        </span>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>

      <div ref={bodyRef} style={{ flex: "1 1 0", minHeight: 0, overflow: "hidden" }}>
        <svg width={w} height={h} style={{ display: "block", background: "#06090e" }}>
          {sectorPlaced.map(sp => {
            const sector = SECTORS[sp.index];
            if (!sector) return null;

            const sx = sp.x + SECTOR_GAP;
            const sy = sp.y + SECTOR_GAP;
            const sw = sp.w - SECTOR_GAP * 2;
            const sh = sp.h - SECTOR_GAP * 2;
            if (sw < 6 || sh < 6) return null;

            const stockAreaH = sh - LABEL_H;

            /* Sector too small — label only */
            if (stockAreaH < 6) {
              return (
                <g key={sector.id}>
                  <rect x={sx} y={sy} width={sw} height={sh} fill="#0c1118" />
                  <text
                    x={sx + 4} y={sy + sh / 2} dominantBaseline="central"
                    fontSize={8} fontWeight={700}
                    fill="#4a6a80" fontFamily="monospace" letterSpacing="0.07em"
                    style={{ pointerEvents: "none" }}
                  >
                    {sector.label}
                  </text>
                </g>
              );
            }

            const stockArea: TRect = { x: sx, y: sy + LABEL_H, w: sw, h: stockAreaH };
            const stockPlaced = squarify(sector.stocks.map(s => s.mcap), stockArea);

            return (
              <g key={sector.id}>
                {/* Sector background */}
                <rect x={sx} y={sy} width={sw} height={sh} fill="#090d15" />

                {/* Sector label bar */}
                <rect x={sx} y={sy} width={sw} height={LABEL_H} fill="rgba(0,0,0,0.4)" />
                <text
                  x={sx + 5} y={sy + LABEL_H / 2} dominantBaseline="central"
                  fontSize={9} fontWeight={700}
                  fill="#8bbdd8" fontFamily="monospace" letterSpacing="0.08em"
                  style={{ pointerEvents: "none" }}
                >
                  {sector.label}
                </text>

                {/* Stock tiles */}
                {stockPlaced.map(tp => {
                  const stock = sector.stocks[tp.index];
                  if (!stock) return null;

                  const tx = tp.x + TILE_GAP;
                  const ty = tp.y + TILE_GAP;
                  const tw = tp.w - TILE_GAP * 2;
                  const th = tp.h - TILE_GAP * 2;
                  if (tw < 2 || th < 2) return null;

                  const bg     = heatBg(stock.pct);
                  const border = heatBorder(stock.pct);
                  const minDim = Math.min(tw, th);
                  const area   = tw * th;
                  const cx     = tx + tw / 2;
                  const cy     = ty + th / 2;

                  /* Decide font sizes */
                  let symFs = 0, pctFs = 0, subFs = 0;
                  if (area >= 7000 && minDim >= 62) {
                    symFs = Math.min(22, Math.max(13, tw / 5.2));
                    pctFs = symFs * 0.66;
                    subFs = pctFs * 0.80;
                  } else if (area >= 2500 && minDim >= 40) {
                    symFs = Math.min(16, Math.max(10, tw / 6.0));
                    pctFs = symFs * 0.70;
                  } else if (area >= 600 && minDim >= 22) {
                    symFs = Math.min(11, Math.max(7.5, tw / 7));
                    pctFs = minDim >= 34 ? symFs * 0.75 : 0;
                  } else if (area >= 140 && minDim >= 13) {
                    symFs = Math.min(8.5, Math.max(5.5, tw / 8));
                  }

                  /* Vertical layout: sub · sym · pct */
                  const GAP = 2;
                  const totalH =
                    (subFs > 0 ? subFs + GAP : 0) +
                    (symFs > 0 ? symFs       : 0) +
                    (pctFs > 0 ? pctFs + GAP : 0);

                  let cur = cy - totalH / 2;
                  let subCy = 0, symCy = 0, pctCy = 0;
                  if (subFs > 0) { subCy = cur + subFs / 2; cur += subFs + GAP; }
                  if (symFs > 0) { symCy = cur + symFs / 2; cur += symFs; }
                  if (pctFs > 0) { cur += GAP; pctCy = cur + pctFs / 2; }

                  /* Truncate sub-label to fit width */
                  const maxSubChars = subFs > 0 ? Math.max(3, Math.floor(tw / (subFs * 0.6))) : 0;
                  const dispSub = stock.sub && subFs > 0
                    ? (stock.sub.length > maxSubChars
                      ? stock.sub.substring(0, maxSubChars - 1) + "…"
                      : stock.sub)
                    : null;

                  return (
                    <g
                      key={stock.sym + "_" + tp.index}
                      onClick={() => onTickerClick?.(stock.sym)}
                      style={{ cursor: onTickerClick ? "pointer" : "default" }}
                    >
                      <rect
                        x={tx} y={ty} width={tw} height={th}
                        fill={bg} stroke={border} strokeWidth={0.75} rx={1}
                      />

                      {dispSub && (
                        <text
                          x={cx} y={subCy} dominantBaseline="central"
                          fontSize={subFs} fill="rgba(255,255,255,0.48)"
                          textAnchor="middle" fontFamily="monospace"
                          style={{ pointerEvents: "none" }}
                        >
                          {dispSub}
                        </text>
                      )}

                      {symFs > 0 && (
                        <text
                          x={cx} y={symCy} dominantBaseline="central"
                          fontSize={symFs} fontWeight={700}
                          fill="white" textAnchor="middle" fontFamily="monospace"
                          style={{ pointerEvents: "none" }}
                        >
                          {stock.sym}
                        </text>
                      )}

                      {pctFs > 0 && (
                        <text
                          x={cx} y={pctCy} dominantBaseline="central"
                          fontSize={pctFs} fill="rgba(255,255,255,0.84)"
                          textAnchor="middle" fontFamily="monospace"
                          style={{ pointerEvents: "none" }}
                        >
                          {stock.pct > 0 ? "+" : ""}{stock.pct.toFixed(2)}%
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="wv-market-panel-footer">
        S&amp;P 500 · Market cap weighted · Placeholder data
      </div>
    </div>
  );
}
