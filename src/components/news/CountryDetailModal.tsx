"use client";

import { useMemo } from "react";
import { useWorldViewStore } from "../../store";
import { CATEGORY_COLORS } from "../../config/newsConfig";
import type { CountryProfile, NewsArticle, NewsCategory } from "../../lib/news/types";

const ISO2_TO_NAME: Record<string, string> = {
  US: "United States", GB: "United Kingdom", FR: "France", DE: "Germany",
  IT: "Italy", JP: "Japan", CN: "China", IN: "India", RU: "Russia",
  CA: "Canada", AU: "Australia", BR: "Brazil", ZA: "South Africa",
  MX: "Mexico", KR: "South Korea", TW: "Taiwan", IL: "Israel",
  EG: "Egypt", SA: "Saudi Arabia", IR: "Iran", SY: "Syria",
  UA: "Ukraine", PL: "Poland", ES: "Spain", NG: "Nigeria",
  AR: "Argentina", CO: "Colombia", TH: "Thailand", ID: "Indonesia",
  MY: "Malaysia", PH: "Philippines", VN: "Vietnam", PK: "Pakistan",
  BD: "Bangladesh", TR: "Turkey", SE: "Sweden", NO: "Norway",
  DK: "Denmark", FI: "Finland", NL: "Netherlands", BE: "Belgium",
  AT: "Austria", CH: "Switzerland", PT: "Portugal", GR: "Greece",
  CZ: "Czech Republic", RO: "Romania", HU: "Hungary", IE: "Ireland",
  NZ: "New Zealand", SG: "Singapore", AE: "United Arab Emirates",
  QA: "Qatar", KW: "Kuwait", IQ: "Iraq", AF: "Afghanistan",
  KE: "Kenya", ET: "Ethiopia", GH: "Ghana", TZ: "Tanzania",
  CL: "Chile", PE: "Peru", VE: "Venezuela", EC: "Ecuador",
};

const ISO2_TO_FLAG: Record<string, string> = {};
function getFlag(code: string): string {
  if (ISO2_TO_FLAG[code]) return ISO2_TO_FLAG[code];
  if (code.length !== 2) return "";
  const flag = String.fromCodePoint(
    ...code.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
  ISO2_TO_FLAG[code] = flag;
  return flag;
}

const CONFLICT_CATS: NewsCategory[] = ["defense", "world"];
const SECURITY_CATS: NewsCategory[] = ["cyber"];
const INFO_CATS: NewsCategory[] = ["tech", "ai", "semiconductors", "cloud"];

function buildProfile(code: string, articles: NewsArticle[]): CountryProfile {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60_000;

  let unrest = 0, conflict = 0, security = 0, information = 0;
  for (const a of articles) {
    const score = a.score ?? 0;
    if (CONFLICT_CATS.includes(a.category)) conflict += score;
    else if (SECURITY_CATS.includes(a.category)) security += score;
    else if (INFO_CATS.includes(a.category)) information += score;
    else unrest += score;
  }

  const total = unrest + conflict + security + information;
  const index = Math.min(100, Math.round(total / Math.max(articles.length, 1)));

  const recentArticles = articles.filter((a) => a.publishedAt >= sevenDaysAgo);
  const olderArticles = articles.filter((a) => a.publishedAt < sevenDaysAgo);
  const trend: CountryProfile["trend"] =
    recentArticles.length > olderArticles.length ? "rising" : recentArticles.length < olderArticles.length ? "falling" : "stable";

  const dayBuckets: Record<string, { protest: number; conflict: number; natural: number; military: number }> = {};
  for (let d = 6; d >= 0; d--) {
    const date = new Date(now - d * 24 * 60 * 60_000);
    const key = date.toISOString().slice(0, 10);
    dayBuckets[key] = { protest: 0, conflict: 0, natural: 0, military: 0 };
  }

  for (const a of articles) {
    const key = new Date(a.publishedAt).toISOString().slice(0, 10);
    if (!dayBuckets[key]) continue;
    if (a.category === "defense") dayBuckets[key].military++;
    else if (CONFLICT_CATS.includes(a.category)) dayBuckets[key].conflict++;
    else if (a.category === "energy" || a.category === "space") dayBuckets[key].natural++;
    else dayBuckets[key].protest++;
  }

  const timeline = Object.entries(dayBuckets).map(([date, counts]) => ({ date, ...counts }));

  return {
    code,
    name: ISO2_TO_NAME[code] || code,
    instabilityIndex: index,
    trend,
    breakdown: {
      unrest: Math.min(100, Math.round((unrest / Math.max(total, 1)) * 100)),
      conflict: Math.min(100, Math.round((conflict / Math.max(total, 1)) * 100)),
      security: Math.min(100, Math.round((security / Math.max(total, 1)) * 100)),
      information: Math.min(100, Math.round((information / Math.max(total, 1)) * 100)),
    },
    articles,
    timeline,
  };
}

function threatLevel(index: number): { label: string; className: string } {
  if (index >= 70) return { label: "HIGH", className: "wv-cm-threat-high" };
  if (index >= 40) return { label: "MEDIUM", className: "wv-cm-threat-medium" };
  return { label: "LOW", className: "wv-cm-threat-low" };
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const TIMELINE_ROWS = [
  { key: "protest" as const, label: "Protest", color: "#ff6d00" },
  { key: "conflict" as const, label: "Conflict", color: "#ff1744" },
  { key: "natural" as const, label: "Natural", color: "#00e676" },
  { key: "military" as const, label: "Military", color: "#e040fb" },
];

interface Props {
  countryCode: string;
  onClose: () => void;
}

export default function CountryDetailModal({ countryCode, onClose }: Props) {
  const feedItems = useWorldViewStore((s) => s.news.feedItems);

  const profile = useMemo(() => {
    const matched = feedItems.filter((a) => {
      if (!a.country) return false;
      const c = a.country.toUpperCase();
      return c === countryCode.toUpperCase() || c === (ISO2_TO_NAME[countryCode] ?? "").toUpperCase();
    });
    return buildProfile(countryCode, matched);
  }, [feedItems, countryCode]);

  const threat = threatLevel(profile.instabilityIndex);
  const trendArrow = profile.trend === "rising" ? "↑ Rising" : profile.trend === "falling" ? "↓ Falling" : "→ Stable";
  const topHeadlines = profile.articles.slice(0, 5);
  const sortedArticles = useMemo(
    () => [...profile.articles].sort((a, b) => b.publishedAt - a.publishedAt),
    [profile.articles],
  );

  const maxTimelineVal = useMemo(() => {
    let m = 1;
    for (const day of profile.timeline) {
      for (const row of TIMELINE_ROWS) {
        m = Math.max(m, day[row.key]);
      }
    }
    return m;
  }, [profile.timeline]);

  return (
    <div className="wv-cm-overlay" onClick={onClose}>
      <div className="wv-cm-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="wv-cm-header">
          <div className="wv-cm-header-left">
            <span className="wv-cm-flag">{getFlag(countryCode)}</span>
            <h2 className="wv-cm-country-name">
              {ISO2_TO_NAME[countryCode] || countryCode}
            </h2>
            <span className={`wv-cm-threat-badge ${threat.className}`}>{threat.label}</span>
            <span className="wv-cm-trend">{trendArrow}</span>
          </div>
          <div className="wv-cm-header-right">
            <button type="button" className="wv-cm-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="wv-cm-body">
          {/* Left column */}
          <div className="wv-cm-left">
            {/* Instability Index */}
            <section className="wv-cm-section">
              <h3 className="wv-cm-section-title">INSTABILITY INDEX</h3>
              <div className="wv-cm-index-row">
                <div className="wv-cm-gauge-wrap">
                  <svg viewBox="0 0 120 120" className="wv-cm-gauge">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="#1a2332" strokeWidth="8" />
                    <circle
                      cx="60" cy="60" r="52"
                      fill="none"
                      stroke={threat.label === "HIGH" ? "#ff1744" : threat.label === "MEDIUM" ? "#ff9100" : "#36b37e"}
                      strokeWidth="8"
                      strokeDasharray={`${(profile.instabilityIndex / 100) * 327} 327`}
                      strokeLinecap="round"
                      transform="rotate(-90 60 60)"
                    />
                    <text x="60" y="55" textAnchor="middle" fill="#e0e6ed" fontSize="28" fontWeight="700">
                      {profile.instabilityIndex}
                    </text>
                    <text x="60" y="75" textAnchor="middle" fill="#7a8a9e" fontSize="11">
                      / 100
                    </text>
                  </svg>
                </div>
                <div className="wv-cm-breakdown">
                  {[
                    { label: "Unrest", value: profile.breakdown.unrest, icon: "🔥" },
                    { label: "Conflict", value: profile.breakdown.conflict, icon: "⚔" },
                    { label: "Security", value: profile.breakdown.security, icon: "🛡" },
                    { label: "Information", value: profile.breakdown.information, icon: "📡" },
                  ].map((row) => (
                    <div key={row.label} className="wv-cm-breakdown-row">
                      <span className="wv-cm-breakdown-icon">{row.icon}</span>
                      <span className="wv-cm-breakdown-label">{row.label}</span>
                      <div className="wv-cm-breakdown-bar">
                        <div
                          className="wv-cm-breakdown-fill"
                          style={{ width: `${row.value}%` }}
                        />
                      </div>
                      <span className="wv-cm-breakdown-val">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Intelligence Brief */}
            <section className="wv-cm-section">
              <h3 className="wv-cm-section-title">INTELLIGENCE BRIEF</h3>
              <p className="wv-cm-brief-text">
                <strong>Instability Index: {profile.instabilityIndex}/100 ({threat.label}, {profile.trend === "stable" ? "Stable" : profile.trend === "rising" ? "Rising" : "Falling"})</strong>
              </p>
              {topHeadlines.length > 0 && (
                <>
                  <p className="wv-cm-brief-text">Recent headlines:</p>
                  <ul className="wv-cm-brief-list">
                    {topHeadlines.map((a) => (
                      <li key={a.id}>
                        {a.headline} – {a.source}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {topHeadlines.length === 0 && (
                <p className="wv-cm-brief-text wv-cm-muted">No recent articles for this country.</p>
              )}
            </section>

            {/* Top News */}
            <section className="wv-cm-section wv-cm-section-grow">
              <h3 className="wv-cm-section-title">TOP NEWS</h3>
              <div className="wv-cm-news-list">
                {sortedArticles.length === 0 && (
                  <div className="wv-cm-empty">No news articles found for this country.</div>
                )}
                {sortedArticles.map((a) => (
                  <a
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="wv-cm-news-item"
                  >
                    <div className="wv-cm-news-headline">{a.headline}</div>
                    <div className="wv-cm-news-meta">
                      <span
                        className="wv-cm-news-cat-dot"
                        style={{ background: CATEGORY_COLORS[a.category] }}
                      />
                      {a.source} · {relativeTime(a.publishedAt)}
                    </div>
                  </a>
                ))}
              </div>
            </section>
          </div>

          {/* Right column */}
          <div className="wv-cm-right">
            {/* Active Signals / 7-Day Timeline */}
            <section className="wv-cm-section">
              <h3 className="wv-cm-section-title">ACTIVE SIGNALS</h3>
              <h4 className="wv-cm-sub-title">7-DAY TIMELINE</h4>
              <div className="wv-cm-timeline">
                {TIMELINE_ROWS.map((row) => {
                  const hasData = profile.timeline.some((d) => d[row.key] > 0);
                  return (
                    <div key={row.key} className="wv-cm-timeline-row">
                      <span className="wv-cm-timeline-label" style={{ color: row.color }}>{row.label}</span>
                      <div className="wv-cm-timeline-bars">
                        {profile.timeline.map((day) => (
                          <div
                            key={day.date}
                            className="wv-cm-timeline-bar"
                            style={{
                              height: `${Math.max(2, (day[row.key] / maxTimelineVal) * 40)}px`,
                              background: day[row.key] > 0 ? row.color : "#1a2332",
                              opacity: day[row.key] > 0 ? 0.85 : 0.3,
                            }}
                            title={`${day.date}: ${day[row.key]}`}
                          />
                        ))}
                      </div>
                      {!hasData && <span className="wv-cm-timeline-empty">No events in 7 days</span>}
                    </div>
                  );
                })}
                <div className="wv-cm-timeline-dates">
                  {profile.timeline.map((day) => (
                    <span key={day.date} className="wv-cm-timeline-date">
                      {new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            {/* Summary stats */}
            <section className="wv-cm-section">
              <h3 className="wv-cm-section-title">SUMMARY</h3>
              <div className="wv-cm-stats-grid">
                <div className="wv-cm-stat">
                  <div className="wv-cm-stat-value">{profile.articles.length}</div>
                  <div className="wv-cm-stat-label">Total Articles</div>
                </div>
                <div className="wv-cm-stat">
                  <div className="wv-cm-stat-value">
                    {profile.articles.filter((a) => a.publishedAt > Date.now() - 24 * 60 * 60_000).length}
                  </div>
                  <div className="wv-cm-stat-label">Last 24h</div>
                </div>
                <div className="wv-cm-stat">
                  <div className="wv-cm-stat-value">
                    {new Set(profile.articles.map((a) => a.source)).size}
                  </div>
                  <div className="wv-cm-stat-label">Sources</div>
                </div>
                <div className="wv-cm-stat">
                  <div className="wv-cm-stat-value">
                    {new Set(profile.articles.map((a) => a.category)).size}
                  </div>
                  <div className="wv-cm-stat-label">Categories</div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
