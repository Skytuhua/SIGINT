/** Preserve provider identity when a display ticker could also name another asset. */
export interface MarketAssetContext {
  kind: "crypto";
  coinId: string;
}
