"use client";

import { useSIGINTStore } from "@/store";
import { useIsMobile } from "../../hooks/useIsMobile";

export const CATEGORY_COLORS: Record<string, string> = {
  world:        "#89e5ff",
  defense:      "#ff6b6b",
  markets:      "#36b37e",
  financial:    "#36b37e",
  crypto:       "#f7931a",
  tech:         "#a78bfa",
  ai:           "#c084fc",
  cyber:        "#fb923c",
  energy:       "#facc15",
  space:        "#60a5fa",
  biotech:      "#34d399",
  semiconductors: "#f472b6",
  cloud:        "#67e8f9",
  government:   "#94a3b8",
  events:       "#e2e8f0",
  ipo:          "#4ade80",
  startups:     "#fb7185",
  local:        "#cbd5e1",
  filings:      "#a3e635",
  watchlist:    "#fde047",
};

export default function NewsTickerBar() {
  const isMobile = useIsMobile();
  const feedItems = useSIGINTStore((s) => s.news.feedItems);

  if (isMobile || !feedItems.length) return null;

  // Top 24 by score for the ticker
  const top = [...feedItems]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 24);

  const doubled = [...top, ...top];

  return (
    <div className="si-news-ticker-bar">
      <div className="si-news-ticker-label">NEWS</div>
      <div className="si-news-ticker-track">
        <div className="si-news-ticker-scroll">
          {doubled.map((item, i) => {
            const catColor = CATEGORY_COLORS[item.category] ?? "#89e5ff";
            return (
              <div key={i} className="si-news-ticker-item">
                <span
                  className="si-news-ticker-cat"
                  style={{ color: catColor }}
                >
                  {item.category.toUpperCase()}
                </span>
                <span className="si-news-ticker-source">{item.source}</span>
                <span className="si-news-ticker-headline">{item.headline}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
