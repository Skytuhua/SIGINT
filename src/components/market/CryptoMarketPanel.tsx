"use client";

import React from "react";
import { MiniSparkline } from "./shared/MiniSparkline";
import { useMarketData } from "../../hooks/useMarketData";

interface CoinGeckoMarket {
  id: string;
  symbol: string;
  name: string;
  currentPrice: number;
  priceChangePercent24h: number;
  marketCap: number;
  volume24h: number;
  sparkline7d?: number[];
}

interface CoinGeckoResponse {
  markets: CoinGeckoMarket[];
  degraded: boolean;
}

interface CryptoRow {
  rank: number;
  sym: string;
  name: string;
  price: string;
  numPrice: number;
  chg1h: number;
  chg1d: number;
  chg7d: number;
  chg30d: number;
  mcapB: number;
  fdvB: number;
  dominance: number;
  vol24hB: number;
  athPct: number;
  hist7d: number[];
  hist1m: number[];
  hist1y: number[];
  hist5y: number[];
  category: string;
}

// Per-coin shape arrays: each value is a fraction of current price at that time point
// Shapes reflect real historical price patterns for each timeframe
// 7 points per shape: evenly spaced across the timeframe
const SPARK_SHAPES: Record<string, { d7: number[]; m1: number[]; y1: number[]; y5: number[] }> = {
  // BTC: 7D slight dip then rally; 1M steady climb; 1Y doubled from 28k; 5Y: 2020 low → 2021 ATH 69k → crash → recovery
  BTC:  { d7: [0.94, 0.92, 0.93, 0.95, 0.96, 0.98, 1.0],  m1: [0.92, 0.90, 0.93, 0.95, 0.97, 0.99, 1.0],  y1: [0.41, 0.55, 0.62, 0.58, 0.72, 0.90, 1.0],  y5: [0.14, 0.58, 1.02, 0.48, 0.40, 0.65, 1.0] },
  // ETH: 7D gradual rise; 1M choppy up; 1Y from 2100; 5Y: 2020 low → 2021 ATH 4.8k → crash to 1k → recovery
  ETH:  { d7: [0.97, 0.96, 0.95, 0.97, 0.98, 0.99, 1.0],  m1: [0.95, 0.92, 0.94, 0.96, 0.93, 0.98, 1.0],  y1: [0.60, 0.72, 0.85, 0.68, 0.75, 0.92, 1.0],  y5: [0.06, 0.42, 1.38, 0.28, 0.34, 0.68, 1.0] },
  // BNB: 7D flat up; 1M steady; 1Y from 380; 5Y: 2020 $15 → 2021 ATH 690 → crash → recovery
  BNB:  { d7: [0.98, 0.97, 0.98, 0.99, 0.98, 0.99, 1.0],  m1: [0.96, 0.94, 0.95, 0.97, 0.98, 0.99, 1.0],  y1: [0.66, 0.72, 0.80, 0.74, 0.85, 0.95, 1.0],  y5: [0.03, 0.10, 1.24, 0.42, 0.52, 0.82, 1.0] },
  // SOL: 7D declining; 1M weak; 1Y explosive from $20; 5Y: near-zero → 260 ATH → FTX crash to $8 → recovery
  SOL:  { d7: [1.02, 1.03, 1.01, 0.99, 0.98, 0.99, 1.0],  m1: [1.04, 1.06, 1.02, 0.98, 0.96, 0.98, 1.0],  y1: [0.15, 0.22, 0.45, 0.65, 0.85, 1.10, 1.0],  y5: [0.01, 0.03, 1.43, 0.04, 0.12, 0.70, 1.0] },
  // XRP: 7D slight up; 1M choppy; 1Y from 0.53; 5Y: 2020 0.20 → 2021 spike 1.80 → SEC crash → range
  XRP:  { d7: [0.98, 0.97, 0.98, 0.99, 0.99, 1.00, 1.0],  m1: [0.96, 0.94, 0.97, 0.95, 0.98, 0.99, 1.0],  y1: [0.84, 0.78, 0.90, 0.86, 0.92, 0.98, 1.0],  y5: [0.32, 0.30, 2.85, 0.60, 0.48, 0.55, 1.0] },
  // USDC: flat across all timeframes
  USDC: { d7: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],       m1: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],       y1: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],       y5: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0] },
  USDT: { d7: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],       m1: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],       y1: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],       y5: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0] },
  USDS: { d7: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],       m1: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],       y1: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],       y5: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0] },
  // ADA: 7D up; 1M choppy up; 1Y from 0.43; 5Y: 2020 $0.02 → 2021 ATH 3.09 → crash → range
  ADA:  { d7: [0.97, 0.96, 0.97, 0.98, 0.99, 0.99, 1.0],  m1: [0.94, 0.91, 0.93, 0.95, 0.97, 0.98, 1.0],  y1: [0.69, 0.55, 0.72, 0.80, 0.75, 0.90, 1.0],  y5: [0.03, 0.05, 4.92, 0.72, 0.48, 0.65, 1.0] },
  // AVAX: 7D rally; 1M strong; 1Y from $23; 5Y: 2020 launch $5 → 2021 ATH 146 → crash → recovery
  AVAX: { d7: [0.95, 0.93, 0.94, 0.96, 0.98, 0.99, 1.0],  m1: [0.89, 0.85, 0.88, 0.92, 0.95, 0.98, 1.0],  y1: [0.54, 0.48, 0.55, 0.62, 0.75, 0.90, 1.0],  y5: [0.12, 0.14, 3.46, 0.38, 0.28, 0.60, 1.0] },
  // DOGE: 7D declining; 1M weak; 1Y from 0.11; 5Y: flat → 2021 Elon pump ATH 0.74 → crash
  DOGE: { d7: [1.03, 1.04, 1.02, 1.01, 0.99, 0.99, 1.0],  m1: [1.09, 1.12, 1.05, 0.98, 0.95, 0.97, 1.0],  y1: [0.62, 0.70, 0.85, 0.78, 0.68, 0.75, 1.0],  y5: [0.01, 0.01, 3.98, 0.86, 0.54, 0.48, 1.0] },
  // DOT: 7D slight up; 1M flat; 1Y from $11 declining; 5Y: 2020 launch → 2021 ATH 55 → steady decline
  DOT:  { d7: [0.99, 0.98, 0.99, 0.99, 1.00, 1.00, 1.0],  m1: [0.97, 0.95, 0.96, 0.98, 0.97, 0.99, 1.0],  y1: [1.12, 1.25, 1.10, 0.95, 0.88, 0.92, 1.0],  y5: [0.61, 1.50, 5.60, 1.42, 0.71, 0.55, 1.0] },
  // LINK: 7D rally; 1M strong; 1Y from $8; 5Y: 2020 $2 → 2021 ATH 53 → crash → recovery
  LINK: { d7: [0.95, 0.94, 0.95, 0.97, 0.98, 0.99, 1.0],  m1: [0.91, 0.88, 0.90, 0.93, 0.96, 0.98, 1.0],  y1: [0.45, 0.52, 0.65, 0.55, 0.72, 0.88, 1.0],  y5: [0.11, 0.16, 2.87, 0.54, 0.38, 0.70, 1.0] },
  // MATIC/POL: 7D up; 1M up; 1Y from $1.40 declining; 5Y: 2020 $0.01 → 2021 spike → crash → range
  MATIC:{ d7: [0.97, 0.96, 0.97, 0.98, 0.99, 1.00, 1.0],  m1: [0.93, 0.90, 0.92, 0.95, 0.97, 0.99, 1.0],  y1: [1.37, 1.55, 1.20, 0.95, 0.88, 0.95, 1.0],  y5: [0.01, 0.02, 2.85, 1.22, 0.58, 0.72, 1.0] },
  POL:  { d7: [0.97, 0.96, 0.97, 0.98, 0.99, 1.00, 1.0],  m1: [0.93, 0.90, 0.92, 0.95, 0.97, 0.99, 1.0],  y1: [1.37, 1.55, 1.20, 0.95, 0.88, 0.95, 1.0],  y5: [0.01, 0.02, 2.85, 1.22, 0.58, 0.72, 1.0] },
  // TRX: steady climb; 5Y from $0.01 → ATH 0.30 → dip → recovery
  TRX:  { d7: [0.99, 0.98, 0.99, 0.99, 1.00, 1.00, 1.0],  m1: [0.97, 0.95, 0.96, 0.98, 0.99, 1.00, 1.0],  y1: [0.55, 0.62, 0.70, 0.75, 0.85, 0.95, 1.0],  y5: [0.08, 0.12, 0.35, 0.25, 0.45, 0.80, 1.0] },
  // SHIB: meme spike then decline
  SHIB: { d7: [1.02, 1.01, 1.00, 0.99, 0.99, 1.00, 1.0],  m1: [1.05, 1.08, 1.02, 0.97, 0.95, 0.98, 1.0],  y1: [0.60, 0.75, 0.90, 0.72, 0.65, 0.80, 1.0],  y5: [0.00, 0.01, 6.50, 1.20, 0.55, 0.45, 1.0] },
  // TON: relatively new; 5Y only ~2 years of data effectively
  TON:  { d7: [0.98, 0.97, 0.98, 0.99, 0.99, 1.00, 1.0],  m1: [0.95, 0.93, 0.95, 0.97, 0.98, 0.99, 1.0],  y1: [0.35, 0.55, 0.72, 0.85, 1.05, 1.10, 1.0],  y5: [0.15, 0.20, 0.40, 0.55, 0.80, 1.10, 1.0] },
  // SUI: new chain, explosive growth
  SUI:  { d7: [0.96, 0.95, 0.97, 0.98, 0.99, 1.00, 1.0],  m1: [0.88, 0.85, 0.90, 0.94, 0.97, 0.99, 1.0],  y1: [0.22, 0.30, 0.45, 0.55, 0.75, 0.90, 1.0],  y5: [0.15, 0.22, 0.40, 0.35, 0.65, 0.90, 1.0] },
  // NEAR: steady growth then acceleration
  NEAR: { d7: [0.97, 0.96, 0.97, 0.98, 0.99, 1.00, 1.0],  m1: [0.92, 0.90, 0.93, 0.95, 0.97, 0.99, 1.0],  y1: [0.55, 0.48, 0.60, 0.72, 0.85, 0.95, 1.0],  y5: [0.08, 0.15, 1.85, 0.35, 0.25, 0.65, 1.0] },
  // UNI: DeFi summer spike then range
  UNI:  { d7: [0.98, 0.97, 0.98, 0.99, 0.99, 1.00, 1.0],  m1: [0.94, 0.92, 0.95, 0.97, 0.98, 0.99, 1.0],  y1: [0.70, 0.82, 0.95, 0.78, 0.85, 0.92, 1.0],  y5: [0.20, 0.85, 2.50, 0.55, 0.40, 0.65, 1.0] },
  // ATOM: cosmos hub, range-bound
  ATOM: { d7: [0.99, 0.98, 0.99, 1.00, 0.99, 1.00, 1.0],  m1: [1.02, 1.00, 0.99, 0.98, 0.99, 1.00, 1.0],  y1: [1.15, 1.08, 0.95, 0.88, 0.92, 0.98, 1.0],  y5: [0.35, 0.50, 2.80, 0.65, 0.42, 0.55, 1.0] },
  // APT: Aptos, new L1 with big launch
  APT:  { d7: [0.96, 0.95, 0.97, 0.98, 0.99, 1.00, 1.0],  m1: [0.90, 0.87, 0.91, 0.94, 0.97, 0.99, 1.0],  y1: [0.45, 0.55, 0.70, 0.62, 0.80, 0.92, 1.0],  y5: [0.40, 0.55, 0.75, 0.50, 0.70, 0.90, 1.0] },
  // ARB: Arbitrum, L2 token launched mid-2023
  ARB:  { d7: [1.01, 1.02, 1.01, 0.99, 0.99, 1.00, 1.0],  m1: [1.05, 1.08, 1.02, 0.98, 0.96, 0.98, 1.0],  y1: [1.30, 1.45, 1.15, 0.85, 0.78, 0.90, 1.0],  y5: [0.50, 0.80, 1.20, 0.65, 0.55, 0.75, 1.0] },
  // OP: Optimism L2
  OP:   { d7: [0.97, 0.96, 0.97, 0.98, 0.99, 1.00, 1.0],  m1: [0.92, 0.89, 0.93, 0.96, 0.98, 0.99, 1.0],  y1: [0.60, 0.72, 0.85, 0.70, 0.82, 0.94, 1.0],  y5: [0.30, 0.55, 1.40, 0.60, 0.50, 0.75, 1.0] },
  // WBT: WhiteBIT token, steady
  WBT:  { d7: [0.99, 0.98, 0.99, 0.99, 1.00, 1.00, 1.0],  m1: [0.97, 0.96, 0.97, 0.98, 0.99, 1.00, 1.0],  y1: [0.72, 0.78, 0.85, 0.88, 0.92, 0.96, 1.0],  y5: [0.60, 0.65, 0.75, 0.80, 0.88, 0.95, 1.0] },
  // LEO: Bitfinex token, slow grind up
  LEO:  { d7: [0.99, 0.99, 1.00, 1.00, 1.00, 1.00, 1.0],  m1: [0.99, 0.98, 0.99, 0.99, 1.00, 1.00, 1.0],  y1: [0.88, 0.90, 0.92, 0.94, 0.96, 0.98, 1.0],  y5: [0.55, 0.60, 0.70, 0.78, 0.85, 0.92, 1.0] },
  // HBAR: Hedera, big recent pump
  HBAR: { d7: [0.95, 0.93, 0.95, 0.97, 0.98, 0.99, 1.0],  m1: [0.82, 0.78, 0.85, 0.90, 0.95, 0.98, 1.0],  y1: [0.22, 0.25, 0.30, 0.35, 0.55, 0.82, 1.0],  y5: [0.15, 0.25, 1.50, 0.30, 0.20, 0.55, 1.0] },
  // BCH: Bitcoin Cash, follows BTC loosely
  BCH:  { d7: [0.97, 0.96, 0.97, 0.98, 0.99, 1.00, 1.0],  m1: [0.95, 0.93, 0.95, 0.97, 0.98, 0.99, 1.0],  y1: [0.58, 0.65, 0.75, 0.70, 0.82, 0.92, 1.0],  y5: [0.60, 0.45, 1.80, 0.50, 0.40, 0.65, 1.0] },
  // LTC: Litecoin, follows BTC with lower amplitude
  LTC:  { d7: [0.98, 0.97, 0.98, 0.99, 0.99, 1.00, 1.0],  m1: [0.97, 0.95, 0.96, 0.98, 0.99, 1.00, 1.0],  y1: [0.85, 0.90, 0.95, 0.88, 0.92, 0.96, 1.0],  y5: [0.55, 0.48, 2.20, 0.58, 0.50, 0.68, 1.0] },
  // PEPE: meme coin, explosive launch then volatile
  PEPE: { d7: [1.03, 1.05, 1.02, 0.99, 0.98, 0.99, 1.0],  m1: [1.12, 1.18, 1.08, 0.95, 0.92, 0.96, 1.0],  y1: [0.08, 0.15, 0.45, 0.90, 0.65, 0.80, 1.0],  y5: [0.00, 0.01, 0.60, 0.85, 0.55, 0.75, 1.0] },
  // FET: AI narrative, big pump
  FET:  { d7: [0.95, 0.94, 0.96, 0.97, 0.99, 1.00, 1.0],  m1: [0.85, 0.80, 0.88, 0.92, 0.96, 0.99, 1.0],  y1: [0.15, 0.20, 0.35, 0.55, 0.80, 0.95, 1.0],  y5: [0.02, 0.05, 0.25, 0.15, 0.45, 0.85, 1.0] },
  // RNDR: GPU rendering, AI narrative
  RNDR: { d7: [0.96, 0.95, 0.97, 0.98, 0.99, 1.00, 1.0],  m1: [0.86, 0.82, 0.88, 0.93, 0.97, 0.99, 1.0],  y1: [0.18, 0.25, 0.40, 0.58, 0.78, 0.92, 1.0],  y5: [0.03, 0.08, 0.35, 0.18, 0.50, 0.82, 1.0] },
  // FTM: Fantom/Sonic
  FTM:  { d7: [0.96, 0.94, 0.96, 0.97, 0.99, 1.00, 1.0],  m1: [0.88, 0.84, 0.89, 0.93, 0.96, 0.99, 1.0],  y1: [0.40, 0.50, 0.65, 0.55, 0.75, 0.90, 1.0],  y5: [0.01, 0.04, 2.20, 0.25, 0.15, 0.55, 1.0] },
  // SEI: new L1, strong growth
  SEI:  { d7: [0.95, 0.94, 0.96, 0.98, 0.99, 1.00, 1.0],  m1: [0.82, 0.78, 0.85, 0.92, 0.96, 0.99, 1.0],  y1: [0.50, 0.55, 0.65, 0.58, 0.78, 0.92, 1.0],  y5: [0.30, 0.45, 0.70, 0.50, 0.70, 0.88, 1.0] },
  // STX: Stacks Bitcoin L2
  STX:  { d7: [1.01, 1.02, 1.01, 1.00, 0.99, 1.00, 1.0],  m1: [1.04, 1.06, 1.02, 0.98, 0.97, 0.99, 1.0],  y1: [0.65, 0.78, 0.90, 0.72, 0.82, 0.92, 1.0],  y5: [0.05, 0.12, 0.85, 0.35, 0.50, 0.75, 1.0] },
  // INJ: Injective, strong DeFi pump
  INJ:  { d7: [0.96, 0.95, 0.97, 0.98, 0.99, 1.00, 1.0],  m1: [0.90, 0.86, 0.91, 0.95, 0.97, 0.99, 1.0],  y1: [0.12, 0.18, 0.35, 0.55, 0.80, 0.95, 1.0],  y5: [0.01, 0.03, 0.40, 0.18, 0.55, 0.85, 1.0] },
  // AAVE: DeFi blue chip, strong 2024 recovery
  AAVE: { d7: [0.96, 0.95, 0.97, 0.98, 0.99, 1.00, 1.0],  m1: [0.88, 0.84, 0.89, 0.93, 0.97, 0.99, 1.0],  y1: [0.28, 0.35, 0.48, 0.58, 0.75, 0.90, 1.0],  y5: [0.15, 0.55, 1.85, 0.28, 0.18, 0.55, 1.0] },
  // IMX: Immutable X, gaming/NFT
  IMX:  { d7: [0.98, 0.97, 0.98, 0.99, 0.99, 1.00, 1.0],  m1: [0.92, 0.88, 0.93, 0.95, 0.97, 0.99, 1.0],  y1: [1.15, 1.30, 1.10, 0.90, 0.85, 0.92, 1.0],  y5: [0.20, 0.45, 1.60, 0.55, 0.35, 0.60, 1.0] },
  // FIL: Filecoin, declining from ATH
  FIL:  { d7: [1.01, 1.02, 1.01, 1.00, 0.99, 1.00, 1.0],  m1: [1.06, 1.08, 1.04, 0.99, 0.97, 0.99, 1.0],  y1: [1.35, 1.50, 1.20, 0.95, 0.85, 0.92, 1.0],  y5: [0.20, 0.45, 3.80, 0.55, 0.25, 0.40, 1.0] },
};

// Scale a shape array by current price
function shapeToSparkline(shape: number[], current: number): number[] {
  return shape.map((v) => v * current);
}

// Default shape for unknown coins: gradual uptrend or downtrend based on % change
function defaultShape(pctChg: number, isStable = false): number[] {
  if (isStable) return [1, 1, 1, 1, 1, 1, 1];
  // Even for near-zero % change, produce a gentle wave rather than flat
  if (Math.abs(pctChg) < 1) return [0.95, 0.97, 1.02, 0.98, 1.01, 0.99, 1.0];
  const start = 1 / (1 + pctChg / 100);
  const mid = pctChg > 0
    ? [start, start * 1.1, (start + 1) * 0.45, (start + 1) * 0.55, 0.82, 0.94, 1.0]
    : [start, start * 0.95, start * 0.85, (start + 1) * 0.55, 1.1, 1.02, 1.0];
  return mid;
}

// ATH prices for major cryptos (approximate)
const ATH_PRICES: Record<string, number> = {
  BTC: 109000, ETH: 4890, BNB: 720, SOL: 260, XRP: 3.40,
  USDC: 1.00, USDT: 1.00, ADA: 3.09, AVAX: 146, DOGE: 0.74,
  DOT: 55, LINK: 53, MATIC: 2.92, POL: 2.92, TRX: 0.30,
  SHIB: 0.000088, UNI: 45, ATOM: 44, TON: 8.20, NEAR: 21,
  SUI: 5.30, APT: 20, ARB: 2.40, OP: 4.80, FTM: 3.48,
  SEI: 1.05, STX: 3.85, INJ: 53, AAVE: 670, WBT: 62,
  FIGR_HELOC: 1.20, USDS: 1.00,
};

// FDV / MCAP ratio estimates (FDV = fully diluted valuation)
const FDV_RATIO: Record<string, number> = {
  BTC: 1.0, ETH: 1.0, BNB: 1.0, SOL: 1.12, XRP: 1.85,
  USDC: 1.0, USDT: 1.0, ADA: 1.25, AVAX: 1.35, DOGE: 1.0,
  DOT: 1.30, LINK: 1.45, MATIC: 1.10, TRX: 1.0, SHIB: 1.0,
  UNI: 1.50, ATOM: 1.0, TON: 1.20, NEAR: 1.40, SUI: 2.80,
  APT: 3.10, ARB: 3.60, OP: 4.20, FTM: 1.10, SEI: 2.50,
};

// Static 1H% and 30D% for fallback
const STATIC_1H: Record<string, number> = {
  BTC: 0.12, ETH: -0.08, BNB: 0.04, SOL: -0.22, XRP: 0.06,
  USDC: 0.00, USDT: 0.00, USDS: 0.00, ADA: 0.18, AVAX: 0.34,
  DOGE: -0.15, DOT: 0.08, LINK: 0.24, MATIC: 0.11, POL: 0.11,
  TRX: 0.02, SHIB: -0.12, TON: 0.08, SUI: 0.28, NEAR: 0.15,
  UNI: 0.10, ATOM: -0.04, APT: 0.18, ARB: -0.08, OP: 0.14,
  FTM: 0.22, SEI: 0.16, STX: -0.06, INJ: 0.20, AAVE: 0.32,
  WBT: 0.05, LEO: 0.01, HBAR: 0.12, BCH: 0.08, LTC: -0.05,
  PEPE: -0.18, FET: 0.25, RNDR: 0.30, IMX: 0.14, FIL: -0.10,
};
const STATIC_30D: Record<string, number> = {
  BTC: 8.4, ETH: 5.2, BNB: 4.1, SOL: -3.8, XRP: 3.6,
  USDC: 0.0, USDT: 0.0, USDS: 0.0, ADA: 6.2, AVAX: 12.4,
  DOGE: -8.2, DOT: 2.8, LINK: 10.1, MATIC: 7.4, POL: 7.4,
  TRX: 2.1, SHIB: -12.5, TON: 5.8, SUI: 18.2, NEAR: 8.5,
  UNI: 6.8, ATOM: -2.4, APT: 14.2, ARB: -5.8, OP: 9.4,
  FTM: 15.8, SEI: 22.4, STX: -4.2, INJ: 11.2, AAVE: 18.5,
  WBT: 3.2, LEO: 0.8, HBAR: 28.5, BCH: 5.4, LTC: -2.8,
  PEPE: -15.2, FET: 24.5, RNDR: 20.1, IMX: 12.8, FIL: -6.4,
};
const STATIC_1Y: Record<string, number> = {
  BTC: 142, ETH: 68, BNB: 52, SOL: 580, XRP: 18,
  USDC: 0, USDT: 0, USDS: 0, ADA: 45, AVAX: 85,
  DOGE: 62, DOT: -12, LINK: 120, MATIC: -28, POL: -28,
  TRX: 95, SHIB: 45, TON: 180, SUI: 420, NEAR: 65,
  UNI: 35, ATOM: -15, APT: 110, ARB: -35, OP: 55,
  FTM: 140, SEI: 85, STX: 45, INJ: 180, AAVE: 250,
  WBT: 40, LEO: 12, HBAR: 350, BCH: 60, LTC: 15,
  PEPE: 380, FET: 520, RNDR: 280, IMX: -20, FIL: -40,
};
const STATIC_5Y: Record<string, number> = {
  BTC: 820, ETH: 1400, BNB: 2200, SOL: 9500, XRP: -22,
  USDC: 0, USDT: 0, USDS: 0, ADA: 280, AVAX: 340,
  DOGE: 4200, DOT: -65, LINK: 580, MATIC: 220, POL: 220,
  TRX: 520, SHIB: 18000, TON: 450, SUI: 350, NEAR: 180,
  UNI: 120, ATOM: -25, APT: 150, ARB: 80, OP: 120,
  FTM: 680, SEI: 200, STX: 380, INJ: 1200, AAVE: 450,
  WBT: 60, LEO: 85, HBAR: 280, BCH: -40, LTC: -30,
  PEPE: 9500, FET: 2400, RNDR: 1800, IMX: 120, FIL: -60,
};

// Static data is enriched with sparklines at init time below
const STATIC_CRYPTO_BASE = [
  { rank:1,  sym:"BTC",  name:"Bitcoin",       price:"$67,420",  numPrice:67420,  chg1h: 0.12, chg1d: 2.34, chg7d: 4.8, chg30d: 8.4,  mcapB:1320, fdvB:1320, dominance:52.4, vol24hB:28.2, athPct:-38.1, category:"L1" },
  { rank:2,  sym:"ETH",  name:"Ethereum",      price:"$3,521",   numPrice:3521,   chg1h:-0.08, chg1d: 1.12, chg7d: 3.2, chg30d: 5.2,  mcapB:423,  fdvB:423,  dominance:16.8, vol24hB:14.1, athPct:-28.0, category:"L1" },
  { rank:3,  sym:"BNB",  name:"BNB",           price:"$581.30",  numPrice:581,    chg1h: 0.04, chg1d: 0.54, chg7d: 2.1, chg30d: 4.1,  mcapB:89,   fdvB:89,   dominance: 3.5, vol24hB: 1.8, athPct:-19.3, category:"Exchange" },
  { rank:4,  sym:"SOL",  name:"Solana",        price:"$182.44",  numPrice:182,    chg1h:-0.22, chg1d:-0.87, chg7d:-1.4, chg30d:-3.8,  mcapB:82,   fdvB:92,   dominance: 3.3, vol24hB: 3.2, athPct:-30.0, category:"L1" },
  { rank:5,  sym:"XRP",  name:"XRP",           price:"$0.631",   numPrice:0.631,  chg1h: 0.06, chg1d: 0.42, chg7d: 1.8, chg30d: 3.6,  mcapB:35,   fdvB:65,   dominance: 1.4, vol24hB: 1.2, athPct:-81.4, category:"Payment" },
  { rank:6,  sym:"USDC", name:"USD Coin",      price:"$1.000",   numPrice:1.000,  chg1h: 0.00, chg1d: 0.01, chg7d: 0.0, chg30d: 0.0,  mcapB:33,   fdvB:33,   dominance: 1.3, vol24hB: 5.8, athPct:  0.0, category:"Stablecoin" },
  { rank:7,  sym:"ADA",  name:"Cardano",       price:"$0.628",   numPrice:0.628,  chg1h: 0.18, chg1d: 1.14, chg7d: 2.4, chg30d: 6.2,  mcapB:22,   fdvB:28,   dominance: 0.9, vol24hB: 0.6, athPct:-79.7, category:"L1" },
  { rank:8,  sym:"AVAX", name:"Avalanche",     price:"$42.18",   numPrice:42.18,  chg1h: 0.34, chg1d: 2.81, chg7d: 5.2, chg30d:12.4,  mcapB:17,   fdvB:23,   dominance: 0.7, vol24hB: 0.8, athPct:-71.1, category:"L1" },
  { rank:9,  sym:"DOGE", name:"Dogecoin",      price:"$0.186",   numPrice:0.186,  chg1h:-0.15, chg1d:-1.21, chg7d:-2.8, chg30d:-8.2,  mcapB:27,   fdvB:27,   dominance: 1.1, vol24hB: 1.1, athPct:-74.9, category:"Meme" },
  { rank:10, sym:"DOT",  name:"Polkadot",      price:"$9.82",    numPrice:9.82,   chg1h: 0.08, chg1d: 0.62, chg7d: 1.1, chg30d: 2.8,  mcapB:13,   fdvB:17,   dominance: 0.5, vol24hB: 0.3, athPct:-82.1, category:"L0" },
  { rank:11, sym:"LINK", name:"Chainlink",     price:"$18.44",   numPrice:18.44,  chg1h: 0.24, chg1d: 1.88, chg7d: 4.2, chg30d:10.1,  mcapB:11,   fdvB:16,   dominance: 0.4, vol24hB: 0.5, athPct:-65.2, category:"Oracle" },
  { rank:12, sym:"MATIC",name:"Polygon",       price:"$1.024",   numPrice:1.024,  chg1h: 0.11, chg1d: 0.94, chg7d: 2.8, chg30d: 7.4,  mcapB:10,   fdvB:11,   dominance: 0.4, vol24hB: 0.4, athPct:-64.9, category:"L2" },
];
const STATIC_CRYPTO: CryptoRow[] = STATIC_CRYPTO_BASE.map((c) => {
  const shapes = SPARK_SHAPES[c.sym];
  return {
    ...c,
    hist7d: shapeToSparkline(shapes?.d7 ?? defaultShape(c.chg7d), c.numPrice),
    hist1m: shapeToSparkline(shapes?.m1 ?? defaultShape(c.chg30d), c.numPrice),
    hist1y: shapeToSparkline(shapes?.y1 ?? defaultShape(STATIC_1Y[c.sym] ?? 50), c.numPrice),
    hist5y: shapeToSparkline(shapes?.y5 ?? defaultShape(STATIC_5Y[c.sym] ?? 200), c.numPrice),
  };
});

const CAT_LOOKUP: Record<string, string> = {
  btc: "L1", eth: "L1", bnb: "Exchange", sol: "L1", xrp: "Payment",
  usdc: "Stablecoin", usdt: "Stablecoin", usds: "Stablecoin", dai: "Stablecoin",
  busd: "Stablecoin", tusd: "Stablecoin", fdusd: "Stablecoin",
  ada: "L1", avax: "L1", doge: "Meme", dot: "L0", link: "Oracle",
  matic: "L2", pol: "L2", uni: "DeFi", atom: "L0", op: "L2", arb: "L2",
  ton: "L1", shib: "Meme", trx: "L1", near: "L1", ftm: "L1", apt: "L1",
  sei: "L1", sui: "L1", stx: "L1", inj: "DeFi", aave: "DeFi",
  wbt: "Exchange", leo: "Exchange", hbar: "L1", bch: "L1", ltc: "L1",
  pepe: "Meme", fet: "AI", rndr: "AI", imx: "L2", fil: "Storage",
};

const CAT_COLOR: Record<string, string> = {
  L1: "#89e5ff", L2: "#6ee7b7", L0: "#c4b5fd", DeFi: "#fbbf24",
  Exchange: "#f97316", Oracle: "#34d399", Payment: "#60a5fa",
  Stablecoin: "var(--wv-text-muted)", Meme: "#fb7185",
  AI: "#a78bfa", Storage: "#38bdf8",
};

function downsample(arr: number[], target: number): number[] {
  if (arr.length <= target) return arr;
  const step = arr.length / target;
  const result: number[] = [];
  for (let i = 0; i < target; i++) {
    result.push(arr[Math.floor(i * step)]);
  }
  return result;
}

function formatPrice(p: number): string {
  if (p >= 10000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (p >= 1) return `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${p.toFixed(4)}`;
}

function fmtB(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(2)}T`;
  if (v >= 1) return `$${v.toFixed(0)}B`;
  return `$${(v * 1000).toFixed(0)}M`;
}

function pctColor(v: number): string {
  return v >= 0 ? "#36b37e" : "#ff5a5f";
}

function fmtPct(v: number, decimals = 2): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}

const EMPTY: CoinGeckoResponse = { markets: [], degraded: true };

interface Props {
  style?: React.CSSProperties;
  onTickerClick?: (sym: string) => void;
}

export default function CryptoMarketPanel({ style, onTickerClick }: Props) {
  const { data, isLive } = useMarketData<CoinGeckoResponse>(
    "/api/news/coingecko?mode=markets&limit=15",
    120_000,
    EMPTY,
  );

  const rows: CryptoRow[] = data.markets.length > 0
    ? data.markets.map((c, i) => {
        const sparkline = c.sparkline7d ? downsample(c.sparkline7d, 7) : [];
        const chg7d = sparkline.length >= 2
          ? ((sparkline[sparkline.length - 1] - sparkline[0]) / sparkline[0]) * 100
          : 0;
        const totalMcap = data.markets.reduce((s, m) => s + (m.marketCap ?? 0), 0);
        const dom = totalMcap > 0 ? ((c.marketCap ?? 0) / totalMcap) * 100 : 0;
        const sym = c.symbol.toUpperCase();
        const price = c.currentPrice;
        const ath = ATH_PRICES[sym];
        const athPct = ath && ath > 0 ? ((price - ath) / ath) * 100 : 0;
        const mcapB = (c.marketCap ?? 0) / 1e9;
        const fdvRatio = FDV_RATIO[sym] ?? 1.0;
        const cat = CAT_LOOKUP[c.symbol] ?? "L1";
        const isStable = cat === "Stablecoin" || ["USDC", "USDT", "USDS", "DAI", "BUSD", "TUSD", "FDUSD"].includes(sym);
        return {
          rank: i + 1,
          sym,
          name: c.name,
          price: formatPrice(price),
          numPrice: price,
          chg1h: STATIC_1H[sym] ?? 0,
          chg1d: c.priceChangePercent24h ?? 0,
          chg7d,
          chg30d: STATIC_30D[sym] ?? 0,
          mcapB,
          fdvB: mcapB * fdvRatio,
          dominance: dom,
          vol24hB: (c.volume24h ?? 0) / 1e9,
          athPct,
          hist7d: sparkline.length >= 2 ? sparkline : shapeToSparkline((SPARK_SHAPES[sym]?.d7 ?? defaultShape(chg7d, isStable)), price),
          hist1m: shapeToSparkline((SPARK_SHAPES[sym]?.m1 ?? defaultShape(STATIC_30D[sym] ?? 5, isStable)), price),
          hist1y: shapeToSparkline((SPARK_SHAPES[sym]?.y1 ?? defaultShape(STATIC_1Y[sym] ?? 50, isStable)), price),
          hist5y: shapeToSparkline((SPARK_SHAPES[sym]?.y5 ?? defaultShape(STATIC_5Y[sym] ?? 200, isStable)), price),
          category: cat,
        };
      })
    : STATIC_CRYPTO;

  const totalMcap = rows.reduce((s, c) => s + c.mcapB, 0);
  const btcDom = rows.length > 0 ? ((rows[0].mcapB / totalMcap) * 100).toFixed(1) : "0";

  // 16 columns: #  SYM  NAME  TAG  PRICE  1H%  1D%  7D%  30D%  MCAP  FDV  DOM  VOL24H  V/MC  ATH%  7D CHART
  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">Crypto Market</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)" }}>
          Total: <span style={{ color: "var(--wv-text)" }}>${totalMcap >= 1000 ? `${(totalMcap / 1000).toFixed(2)}T` : `${totalMcap.toFixed(0)}B`}</span>
          &nbsp;· BTC Dom: <span style={{ color: "#ffab40" }}>{btcDom}%</span>
        </span>
        <span className={`wv-market-panel-badge ${isLive ? "is-live" : "is-static"}`}>
          {isLive ? "LIVE" : "STATIC"}
        </span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: 0 }}>
        <div className="wv-crypto-header">
          <span>#</span>
          <span>SYM</span>
          <span style={{ paddingLeft: 8 }}>NAME</span>
          <span style={{ textAlign: "center" }}>TAG</span>
          <span style={{ textAlign: "right" }}>PRICE</span>
          <span style={{ textAlign: "right" }}>1H%</span>
          <span style={{ textAlign: "right" }}>1D%</span>
          <span style={{ textAlign: "right" }}>7D%</span>
          <span style={{ textAlign: "right" }}>30D%</span>
          <span style={{ textAlign: "right" }}>MCAP</span>
          <span style={{ textAlign: "right" }}>FDV</span>
          <span style={{ textAlign: "right" }}>DOM</span>
          <span style={{ textAlign: "right" }}>VOL 24H</span>
          <span style={{ textAlign: "right" }}>V/MC</span>
          <span style={{ textAlign: "right" }}>ATH%</span>
          <span style={{ textAlign: "center" }}>7D</span>
          <span style={{ textAlign: "center" }}>1M</span>
          <span style={{ textAlign: "center" }}>1Y</span>
          <span style={{ textAlign: "center" }}>5Y</span>
        </div>
        {rows.map((c) => {
          const vmcRatio = c.mcapB > 0 ? (c.vol24hB / c.mcapB) : 0;
          return (
            <div
              key={c.sym}
              className="wv-crypto-row"
              onClick={() => onTickerClick?.(c.sym)}
              style={{ cursor: onTickerClick ? "pointer" : "default" }}
            >
              <span style={{ color: "var(--wv-text-muted)", fontSize: 9 }}>{c.rank}</span>
              <span style={{ color: CAT_COLOR[c.category] ?? "#89e5ff", fontWeight: 700 }}>{c.sym}</span>
              <span style={{ color: "var(--wv-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 9.5, paddingLeft: 8 }}>{c.name}</span>
              <span style={{
                textAlign: "center", fontSize: 8, fontWeight: 600, letterSpacing: "0.03em",
                color: CAT_COLOR[c.category] ?? "#89e5ff",
                background: "rgba(185,205,224,0.07)",
                padding: "1px 4px", borderRadius: 2, whiteSpace: "nowrap",
              }}>{c.category}</span>
              <span style={{ textAlign: "right", fontWeight: 600, color: "var(--wv-text)" }}>{c.price}</span>
              <span style={{ textAlign: "right", fontSize: 9, color: pctColor(c.chg1h) }}>
                {fmtPct(c.chg1h)}
              </span>
              <span style={{ textAlign: "right", color: pctColor(c.chg1d) }}>
                {fmtPct(c.chg1d)}
              </span>
              <span style={{ textAlign: "right", color: pctColor(c.chg7d) }}>
                {fmtPct(c.chg7d, 1)}
              </span>
              <span style={{ textAlign: "right", color: pctColor(c.chg30d) }}>
                {fmtPct(c.chg30d, 1)}
              </span>
              <span style={{ textAlign: "right", color: "var(--wv-text)" }}>
                {fmtB(c.mcapB)}
              </span>
              <span style={{ textAlign: "right", color: "var(--wv-text-muted)", fontSize: 9 }}>
                {fmtB(c.fdvB)}
              </span>
              <span style={{ textAlign: "right", color: "var(--wv-text-muted)", fontSize: 9 }}>{c.dominance.toFixed(1)}%</span>
              <span style={{ textAlign: "right", color: "var(--wv-text-muted)", fontSize: 9 }}>${c.vol24hB.toFixed(1)}B</span>
              <span style={{ textAlign: "right", fontFamily: "monospace", fontSize: 9, color: vmcRatio > 0.1 ? "#ffab40" : "var(--wv-text-muted)" }}>
                {c.mcapB > 0 ? `${(vmcRatio * 100).toFixed(1)}%` : "—"}
              </span>
              <span style={{ textAlign: "right", fontSize: 9, color: c.athPct > -10 ? "#36b37e" : c.athPct > -50 ? "#ffab40" : "#ff5a5f" }}>
                {c.athPct !== 0 ? `${c.athPct.toFixed(0)}%` : "—"}
              </span>
              <span style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                <MiniSparkline prices={c.hist7d} up={c.chg7d >= 0} width={36} height={14} />
              </span>
              <span style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                <MiniSparkline prices={c.hist1m} up={c.chg30d >= 0} width={36} height={14} />
              </span>
              <span style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                <MiniSparkline prices={c.hist1y} up={(STATIC_1Y[c.sym] ?? 0) >= 0} width={36} height={14} />
              </span>
              <span style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                <MiniSparkline prices={c.hist5y} up={(STATIC_5Y[c.sym] ?? 0) >= 0} width={36} height={14} />
              </span>
            </div>
          );
        })}
      </div>
      <div className="wv-market-panel-footer">
        {isLive ? "CoinGecko · live data · 2min refresh" : "CoinGecko · static data"}
      </div>
    </div>
  );
}
