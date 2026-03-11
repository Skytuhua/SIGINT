"use client";

interface TickerItem {
  sym: string;
  price: string;
  chg: number;
}

const TICKER_ITEMS: TickerItem[] = [
  { sym: "BTC/USD",  price: "67,842.10", chg:  2.34 },
  { sym: "ETH/USD",  price: "3,521.88",  chg:  1.12 },
  { sym: "SOL/USD",  price: "182.44",    chg: -0.87 },
  { sym: "SPY",      price: "528.61",    chg:  0.41 },
  { sym: "QQQ",      price: "452.19",    chg:  0.68 },
  { sym: "GC=F",     price: "2,331.40",  chg:  0.22 },
  { sym: "CL=F",     price: "79.85",     chg: -1.03 },
  { sym: "EUR/USD",  price: "1.0841",    chg:  0.15 },
  { sym: "USD/JPY",  price: "149.62",    chg: -0.38 },
  { sym: "DXY",      price: "104.23",    chg:  0.09 },
  { sym: "VIX",      price: "14.82",     chg: -3.11 },
  { sym: "TLT",      price: "92.17",     chg: -0.22 },
  { sym: "BNB/USD",  price: "581.30",    chg:  0.54 },
  { sym: "XAU/USD",  price: "2,329.80",  chg:  0.18 },
  { sym: "NDX",      price: "18,421.00", chg:  0.73 },
];

// Duplicate so the marquee loops seamlessly
const DOUBLED = [...TICKER_ITEMS, ...TICKER_ITEMS];

export default function MarketTickerBar() {
  return (
    <div className="si-market-ticker-bar">
      <div className="si-market-ticker-label">LIVE</div>
      <div className="si-market-ticker-track">
        <div className="si-market-ticker-scroll">
          {DOUBLED.map((item, i) => {
            const chgClass =
              item.chg > 0 ? "is-up" : item.chg < 0 ? "is-down" : "is-flat";
            const sign = item.chg > 0 ? "+" : "";
            return (
              <div key={i} className="si-market-ticker-item">
                <span className="si-market-ticker-sym">{item.sym}</span>
                <span className="si-market-ticker-price">{item.price}</span>
                <span className={`si-market-ticker-chg ${chgClass}`}>
                  {sign}{item.chg.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
