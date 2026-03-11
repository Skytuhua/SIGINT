"use client";

import { useState, useMemo } from "react";
import {
  MARKET_GLOSSARY,
  GLOSSARY_CATEGORIES,
  type GlossaryCategory,
} from "../../data/marketGlossary";

interface Props {
  onClose: () => void;
}

const ALL_ENTRIES = Object.values(MARKET_GLOSSARY);

export default function GlossaryPanel({ onClose }: Props) {
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<GlossaryCategory | "ALL">("ALL");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ALL_ENTRIES.filter((e) => {
      if (activeCat !== "ALL" && e.category !== activeCat) return false;
      if (!q) return true;
      return (
        e.term.toLowerCase().includes(q) ||
        e.full.toLowerCase().includes(q) ||
        e.definition.toLowerCase().includes(q)
      );
    });
  }, [search, activeCat]);

  return (
    <div className="si-glossary-overlay" onClick={onClose}>
      <div className="si-glossary-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="si-glossary-header">
          <span className="si-glossary-title">Glossary</span>
          <button className="si-glossary-close" onClick={onClose} title="Close">
            &times;
          </button>
        </div>

        {/* Search */}
        <input
          className="si-glossary-search"
          placeholder="Search terms..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />

        {/* Category filters */}
        <div className="si-glossary-cats">
          <button
            className={`si-glossary-cat-btn${activeCat === "ALL" ? " is-active" : ""}`}
            onClick={() => setActiveCat("ALL")}
          >
            ALL
          </button>
          {GLOSSARY_CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`si-glossary-cat-btn${activeCat === cat ? " is-active" : ""}`}
              onClick={() => setActiveCat(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Term list */}
        <div className="si-glossary-list">
          {filtered.length === 0 && (
            <div style={{ fontSize: 9, color: "rgba(185,205,224,0.4)", padding: "12px 4px", textAlign: "center" }}>
              No terms found.
            </div>
          )}
          {filtered.map((e, i) => (
            <div key={i} className="si-glossary-card">
              <span className="si-glossary-card-term">{e.term}</span>
              <div className="si-glossary-card-full">{e.full}</div>
              <div className="si-glossary-card-def">{e.definition}</div>
              <div className="si-glossary-card-usage">{e.usage}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
