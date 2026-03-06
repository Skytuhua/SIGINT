"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { SanctionsIdentifiers } from "../../lib/server/news/sanctions/types";

export interface SanctionsEntityDetailData {
  id: string;
  name: string;
  aliases: string[];
  entityType: string;
  authority: string;
  program: string;
  designationDate: string | null;
  status: string;
  identifiers: SanctionsIdentifiers | string;
  jurisdictionCountry: string | null;
  linkedCountries: string;
  geoConfidence: string | null;
  placeName: string | null;
  sourceName: string;
  sourceUrl: string;
  datasetVersion: string | null;
  lastUpdated: string | null;
}

interface OpenSanctionsProfile {
  birthDate: string | null;
  nationality: string | null;
  position: string | null;
  country: string | null;
  description: string | null;
  gender: string | null;
  registrationNumber: string | null;
  incorporationDate: string | null;
  dissolutionDate: string | null;
  topics: string[];
  opensanctionsUrl: string | null;
}

interface EntityProfile {
  aiSummary: string | null;
  wikipedia: { extract: string; pageUrl: string } | null;
  opensanctions: OpenSanctionsProfile | null;
  news: Array<{ title: string; url: string; domain: string; date: string; sourcecountry: string }>;
  degraded: boolean;
}

interface SanctionsEntityDetailCardProps {
  detail: SanctionsEntityDetailData;
  onClose: () => void;
}

type Tab = "overview" | "intelligence" | "news";

function statusPillClass(status: string): string {
  if (status === "Active") return "is-operating";
  if (status === "Removed") return "is-retired";
  return "is-unknown";
}

function confidencePillClass(conf: string | null): string {
  if (conf === "High") return "is-operating";
  if (conf === "Medium") return "is-construction";
  return "is-unknown";
}

function parseIdentifiers(raw: SanctionsIdentifiers | string): SanctionsIdentifiers {
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as SanctionsIdentifiers; } catch { return {}; }
  }
  return raw;
}

function formatArticleDate(seendate: string): string {
  // GDELT format: "20240315T120000Z"
  const m = seendate.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return seendate;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export default function SanctionsEntityDetailCard({ detail, onClose }: SanctionsEntityDetailCardProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [profile, setProfile] = useState<EntityProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setProfileLoading(true);
    const aliasesStr = Array.isArray(detail.aliases)
      ? detail.aliases.join(";")
      : typeof detail.aliases === "string" ? detail.aliases : "";
    const params = new URLSearchParams({
      name: detail.name,
      entityType: detail.entityType,
      authority: detail.authority,
      program: detail.program ?? "",
      linkedCountries: detail.linkedCountries ?? "",
      aliases: aliasesStr,
    });
    fetch(`/api/news/sanctions/entity-profile?${params}`)
      .then((r) => r.json())
      .then((data) => setProfile(data as EntityProfile))
      .catch(() => setProfile({ aiSummary: null, wikipedia: null, news: [], degraded: true }))
      .finally(() => setProfileLoading(false));
  }, [mounted, detail.name]);

  if (!mounted) return null;

  const ids = parseIdentifiers(detail.identifiers);
  const aliasesRaw = typeof detail.aliases === "string"
    ? (detail.aliases as string).split("; ").filter(Boolean)
    : detail.aliases ?? [];

  const idEntries: Array<[string, string]> = [];
  if (ids.ofacSdnId) idEntries.push(["OFAC SDN", ids.ofacSdnId]);
  if (ids.euId) idEntries.push(["EU", ids.euId]);
  if (ids.ukId) idEntries.push(["UK", ids.ukId]);
  if (ids.unId) idEntries.push(["UN", ids.unId]);
  if (ids.imo) idEntries.push(["IMO", ids.imo]);
  if (ids.mmsi) idEntries.push(["MMSI", ids.mmsi]);
  if (ids.callsign) idEntries.push(["Callsign", ids.callsign]);
  if (ids.tailNumber) idEntries.push(["Tail #", ids.tailNumber]);
  if (ids.icao24) idEntries.push(["ICAO24", ids.icao24]);

  const hasIntelligence = !profileLoading && (profile?.aiSummary || profile?.wikipedia || profile?.opensanctions);
  const newsCount = profile?.news.length ?? 0;

  return createPortal(
    <div className="wv-hotspot-card" role="dialog" aria-label="Sanctions entity detail">
      {/* Header */}
      <div className="wv-hotspot-card-hdr">
        <div className="wv-hotspot-card-headline">
          <div className="wv-hotspot-name">{detail.name.toUpperCase()}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            <span className="wv-hotspot-tags">{detail.entityType}</span>
            <span className={`wv-hotspot-tier ${statusPillClass(detail.status)}`}>{detail.status}</span>
            <span className="wv-hotspot-tier is-construction">{detail.authority}</span>
          </div>
        </div>
        <button
          type="button"
          className="wv-hotspot-close"
          onClick={onClose}
          aria-label="Close sanctions entity details"
        >
          ×
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 0 }}>
        {(["overview", "intelligence", "news"] as Tab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: "5px 0",
              fontSize: "0.65rem",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              background: "none",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid #4fc3f7" : "2px solid transparent",
              color: activeTab === tab ? "#4fc3f7" : "rgba(255,255,255,0.45)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {tab === "news" && newsCount > 0 ? `${tab} (${newsCount})` : tab}
            {tab === "intelligence" && profileLoading ? " …" : ""}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === "overview" && (
        <>
          {aliasesRaw.length > 0 && (
            <div className="wv-hotspot-section">
              <div className="wv-hotspot-kicker">ALIASES</div>
              <div className="wv-hotspot-summary">
                {aliasesRaw.join(", ")}
              </div>
            </div>
          )}

          <div className="wv-hotspot-section">
            <div className="wv-hotspot-kicker">PROGRAM</div>
            <div className="wv-hotspot-subscores">
              <div>Program {detail.program || "Unknown"}</div>
              <div>Designated {detail.designationDate ?? "Unknown"}</div>
              <div>
                Location{" "}
                {detail.placeName ?? detail.jurisdictionCountry ?? "Unknown"}
                {detail.geoConfidence && (
                  <span
                    className={`wv-hotspot-tier ${confidencePillClass(detail.geoConfidence)}`}
                    style={{ marginLeft: 6, fontSize: "0.65rem" }}
                  >
                    {detail.geoConfidence}
                  </span>
                )}
              </div>
              {detail.linkedCountries && (
                <div>Linked {detail.linkedCountries}</div>
              )}
            </div>
          </div>

          {idEntries.length > 0 && (
            <div className="wv-hotspot-section">
              <div className="wv-hotspot-kicker">IDENTIFIERS</div>
              <div className="wv-hotspot-subscores">
                {idEntries.map(([label, val]) => (
                  <div key={label}>
                    {label}: {val}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="wv-hotspot-section">
            <div className="wv-hotspot-kicker">SOURCE</div>
            <div>{detail.sourceName}</div>
            {detail.sourceUrl && (
              <details className="wv-hotspot-trace">
                <summary>Source Trace</summary>
                <ul>
                  <li>
                    <a href={detail.sourceUrl} target="_blank" rel="noopener noreferrer">
                      Official list
                    </a>
                  </li>
                  {detail.datasetVersion && <li>Version: {detail.datasetVersion}</li>}
                  {detail.lastUpdated && <li>Updated: {detail.lastUpdated}</li>}
                </ul>
              </details>
            )}
          </div>

          <div style={{ marginTop: 6, opacity: 0.5, fontSize: "0.62rem", padding: "0 2px" }}>
            Open-source listing from official public sanctions databases. Not legal advice.
          </div>
        </>
      )}

      {/* ── INTELLIGENCE TAB ── */}
      {activeTab === "intelligence" && (
        <>
          {profileLoading ? (
            <div style={{ padding: "18px 2px", opacity: 0.5, fontSize: "0.72rem" }}>
              Fetching intelligence profile…
            </div>
          ) : !hasIntelligence ? (
            <div style={{ padding: "18px 2px", opacity: 0.45, fontSize: "0.72rem" }}>
              No additional intelligence available for this entity.
            </div>
          ) : (
            <>
              {profile?.aiSummary && (
                <div className="wv-hotspot-section">
                  <div className="wv-hotspot-kicker">AI SUMMARY</div>
                  <div className="wv-hotspot-summary" style={{ lineHeight: 1.55 }}>
                    {profile.aiSummary}
                  </div>
                </div>
              )}

              {profile?.opensanctions && (() => {
                const os = profile.opensanctions;
                const rows: Array<[string, string]> = [];
                if (os.position) rows.push(["Position", os.position]);
                if (os.birthDate) rows.push(["Date of Birth", os.birthDate]);
                if (os.gender) rows.push(["Gender", os.gender]);
                if (os.nationality) rows.push(["Nationality", os.nationality]);
                if (os.country) rows.push(["Country", os.country]);
                if (os.registrationNumber) rows.push(["Reg. No.", os.registrationNumber]);
                if (os.incorporationDate) rows.push(["Incorporated", os.incorporationDate]);
                if (os.dissolutionDate) rows.push(["Dissolved", os.dissolutionDate]);
                if (rows.length === 0 && !os.description) return null;
                return (
                  <div className="wv-hotspot-section">
                    <div className="wv-hotspot-kicker">
                      PROFILE
                      {os.opensanctionsUrl && (
                        <a
                          href={os.opensanctionsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ marginLeft: 8, fontSize: "0.62rem", color: "#4fc3f7", fontWeight: 400 }}
                        >
                          OpenSanctions →
                        </a>
                      )}
                    </div>
                    {rows.length > 0 && (
                      <div className="wv-hotspot-subscores" style={{ marginBottom: os.description ? 6 : 0 }}>
                        {rows.map(([label, val]) => (
                          <div key={label}>{label}: {val}</div>
                        ))}
                      </div>
                    )}
                    {os.description && (
                      <div className="wv-hotspot-summary" style={{ lineHeight: 1.55, marginTop: 4 }}>
                        {os.description}
                      </div>
                    )}
                    {os.topics.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                        {os.topics.map((t) => (
                          <span key={t} className="wv-hotspot-tags" style={{ fontSize: "0.6rem" }}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {profile?.wikipedia && (
                <div className="wv-hotspot-section">
                  <div className="wv-hotspot-kicker">
                    BACKGROUND
                    {profile.wikipedia.pageUrl && (
                      <a
                        href={profile.wikipedia.pageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ marginLeft: 8, fontSize: "0.62rem", color: "#4fc3f7", fontWeight: 400 }}
                      >
                        Wikipedia →
                      </a>
                    )}
                  </div>
                  <div className="wv-hotspot-summary" style={{ lineHeight: 1.55 }}>
                    {profile.wikipedia.extract}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── NEWS TAB ── */}
      {activeTab === "news" && (
        <>
          {profileLoading ? (
            <div style={{ padding: "18px 2px", opacity: 0.5, fontSize: "0.72rem" }}>
              Searching news sources…
            </div>
          ) : profile?.news.length === 0 ? (
            <div style={{ padding: "18px 2px", opacity: 0.45, fontSize: "0.72rem" }}>
              No recent news found for this entity.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {profile?.news.map((article, i) => (
                <a
                  key={i}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block",
                    padding: "8px 2px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ fontSize: "0.74rem", color: "#e0e6ef", lineHeight: 1.4, marginBottom: 3 }}>
                    {article.title}
                  </div>
                  <div style={{ display: "flex", gap: 8, fontSize: "0.63rem", opacity: 0.55 }}>
                    <span>{article.domain}</span>
                    <span>{formatArticleDate(article.date)}</span>
                    {article.sourcecountry && <span>{article.sourcecountry}</span>}
                  </div>
                </a>
              ))}
              {profile?.degraded && (
                <div style={{ marginTop: 6, opacity: 0.4, fontSize: "0.62rem" }}>
                  News source may be degraded.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>,
    document.body
  );
}
