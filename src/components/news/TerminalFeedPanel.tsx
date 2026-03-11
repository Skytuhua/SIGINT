"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type CSSProperties,
} from "react";
import { List, useListRef } from "react-window";
import { useNewsStream } from "../../hooks/useNewsStream";
import type {
  StreamItem,
  TerminalTab,
  DensityMode,
  StreamFilterParams,
  SourceHealthEntry,
} from "../../lib/news/stream/types";
import { TERMINAL_TABS, TAB_CATEGORY_MAP } from "../../lib/news/stream/types";
import { selectTopItems } from "../../lib/news/engine/topScore";
import { CATEGORY_COLORS } from "../../config/newsConfig";
import type { NewsCategory } from "../../lib/news/types";
import Panel from "../dashboard/panel/Panel";
import PanelBody from "../dashboard/panel/PanelBody";
import PanelFooter from "../dashboard/panel/PanelFooter";
import PanelHeader from "../dashboard/panel/PanelHeader";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeAge(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function shortTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function catColor(cat: NewsCategory): string {
  return (CATEGORY_COLORS as Record<string, string>)[cat] ?? "#4caf50";
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}

// ---------------------------------------------------------------------------
// Detail card
// ---------------------------------------------------------------------------

function DetailCard({ item, onClose }: { item: StreamItem; onClose: () => void }) {
  const now = Date.now();
  return (
    <div className="si-terminal-detail">
      <div className="si-terminal-detail-header">
        <span className="si-terminal-detail-cat" style={{ color: catColor(item.category) }}>
          [{item.category.toUpperCase()}]
        </span>
        <button type="button" className="si-terminal-detail-close" onClick={onClose} title="Close">&times;</button>
      </div>
      <h3 className="si-terminal-detail-headline">{item.headline}</h3>
      <div className="si-terminal-detail-meta">
        <span>{relativeAge(item.timestamp, now)}</span>
        <span>{shortTime(item.timestamp)}</span>
        <span>Confidence: {item.confidence}</span>
        <span>Importance: {item.importance}</span>
      </div>
      {item.geo && (
        <div className="si-terminal-detail-geo">
          {item.geo.placeName && <span>{item.geo.placeName}</span>}
          {item.geo.countryCode && <span>{item.geo.countryCode}</span>}
          <span>{item.geo.lat.toFixed(2)}, {item.geo.lon.toFixed(2)}</span>
        </div>
      )}
      {item.entities.length > 0 && (
        <div className="si-terminal-detail-entities">
          {item.entities.map((e, i) => (
            <span key={i} className="si-terminal-detail-entity">{e.name}{e.ticker ? ` (${e.ticker})` : ""}</span>
          ))}
        </div>
      )}
      {item.tickers.length > 0 && (
        <div className="si-terminal-detail-tickers">
          {item.tickers.map((t) => <span key={t} className="si-terminal-detail-ticker">${t}</span>)}
        </div>
      )}
      <div className="si-terminal-detail-sources">
        <span className="si-terminal-detail-label">Sources ({item.duplicateCount}):</span>
        {item.sources.map((s, i) => <span key={i}>{s}</span>)}
      </div>
      {item.topSignals && item.topSignals.length > 0 && (
        <div className="si-terminal-detail-top-reason">
          <span className="si-terminal-detail-label">Why it&apos;s top:</span>
          {item.topSignals.map((s, i) => <span key={i}>{s}</span>)}
        </div>
      )}
      <div className="si-terminal-detail-actions">
        <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="si-terminal-detail-action">
          OPEN SOURCE
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source health bar
// ---------------------------------------------------------------------------

function SourceHealthBar({ health }: { health: Record<string, SourceHealthEntry> }) {
  const entries = Object.values(health);
  if (entries.length === 0) return null;
  return (
    <div className="si-terminal-health">
      {entries.map((e) => (
        <span
          key={e.sourceId}
          className={`si-terminal-health-dot si-terminal-health-${e.status}`}
          title={`${e.sourceId}: ${e.status}${e.errorCode ? ` (${e.errorCode})` : ""}${e.lastSuccessAt ? ` last ok ${relativeAge(e.lastSuccessAt, Date.now())}` : ""}`}
        >
          {e.sourceId.toUpperCase()}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terminal row
// ---------------------------------------------------------------------------

interface TerminalRowProps {
  item: StreamItem;
  selected: boolean;
  density: DensityMode;
  now: number;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const TerminalRow = memo(function TerminalRow({ item, selected, density, now, onClick, onContextMenu }: TerminalRowProps) {
  const cc = catColor(item.category);
  const age = relativeAge(item.timestamp, now);

  if (density === "light") {
    return (
      <div
        className={`si-trow si-trow-light${selected ? " is-selected" : ""}`}
        onClick={onClick}
        onContextMenu={onContextMenu}
        role="row"
        tabIndex={-1}
      >
        <span className="si-trow-age">{age}</span>
        <span className="si-trow-cat" style={{ color: cc }}>[{item.category.toUpperCase()}]</span>
        <span className="si-trow-headline">{truncate(item.headline, 120)}</span>
        <span className="si-trow-domain">{item.sourceDomain}</span>
      </div>
    );
  }

  if (density === "heavy") {
    return (
      <div
        className={`si-trow si-trow-heavy${selected ? " is-selected" : ""}`}
        onClick={onClick}
        onContextMenu={onContextMenu}
        role="row"
        tabIndex={-1}
      >
        <span className="si-trow-age">{age}</span>
        <span className="si-trow-cat" style={{ color: cc }}>[{item.category.toUpperCase()}]</span>
        {item.tags.slice(0, 3).map((t) => <span key={t} className="si-trow-tag">{t}</span>)}
        <span className="si-trow-headline">{truncate(item.headline, 100)}</span>
        <span className="si-trow-entities">{item.entities.slice(0, 2).map((e) => e.name).join(", ")}</span>
        <span className="si-trow-tickers">{item.tickers.join(" ")}</span>
        <span className="si-trow-domain">{item.sourceDomain}</span>
        <span className="si-trow-time">{shortTime(item.timestamp)}</span>
        <span className="si-trow-score">{item.importance}</span>
      </div>
    );
  }

  // medium (default)
  return (
    <div
      className={`si-trow si-trow-medium${selected ? " is-selected" : ""}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      role="row"
      tabIndex={-1}
    >
      <span className="si-trow-age">{age}</span>
      <span className="si-trow-cat" style={{ color: cc }}>[{item.category.toUpperCase()}]</span>
      <span className="si-trow-headline">{truncate(item.headline, 110)}</span>
      <span className="si-trow-domain">{item.sourceDomain}</span>
      <span className="si-trow-tickers">{item.tickers.join(" ")}</span>
      <span className="si-trow-time">{shortTime(item.timestamp)}</span>
    </div>
  );
});

const ROW_HEIGHT: Record<DensityMode, number> = { light: 24, medium: 28, heavy: 38 };

interface VirtualRowProps {
  items: StreamItem[];
  selectedIdx: number;
  density: DensityMode;
  now: number;
  onSelect: (idx: number) => void;
  onOpen: (item: StreamItem) => void;
}

function VirtualTerminalRow({
  index,
  style,
  items,
  selectedIdx,
  density,
  now,
  onSelect,
  onOpen,
}: { index: number; style: CSSProperties } & VirtualRowProps) {
  const item = items[index];
  if (!item) return null;
  return (
    <div style={style} data-row-id={item.id}>
      <TerminalRow
        item={item}
        selected={index === selectedIdx}
        density={density}
        now={now}
        onClick={() => { onSelect(index); onOpen(item); }}
        onContextMenu={(e) => { e.preventDefault(); window.open(item.sourceUrl, "_blank", "noopener,noreferrer"); }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

const TIME_WINDOW_OPTIONS: Array<{ label: string; value: StreamFilterParams["timeWindow"] }> = [
  { label: "5m", value: "5m" },
  { label: "30m", value: "30m" },
  { label: "2h", value: "2h" },
  { label: "24h", value: "24h" },
];

interface TerminalFeedPanelProps {
  lockHeaderProps: { locked: boolean; onToggleLock: () => void };
}

export default function TerminalFeedPanel({ lockHeaderProps }: TerminalFeedPanelProps) {
  const [activeTab, setActiveTab] = useState<TerminalTab>("TOP");
  const [density, setDensity] = useState<DensityMode>("medium");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [detailItem, setDetailItem] = useState<StreamItem | null>(null);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [clockTick, setClockTick] = useState(0);
  const [timeWindow, setTimeWindow] = useState<StreamFilterParams["timeWindow"]>("24h");
  const [minImportance, setMinImportance] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [watchlists, setWatchlists] = useState<Array<{ id: string; name: string; filters: StreamFilterParams }>>([]);
  const [activeWatchlistId, setActiveWatchlistId] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useListRef();

  // Server-side SSE params — only time window matters; tabs/categories filter client-side
  // so switching tabs is instant and never triggers a reconnect.
  const activeWatchlist = useMemo(
    () => watchlists.find((w) => w.id === activeWatchlistId),
    [watchlists, activeWatchlistId]
  );
  const serverFilters = useMemo<StreamFilterParams>(
    () => ({ timeWindow: activeWatchlist?.filters.timeWindow ?? timeWindow }),
    [timeWindow, activeWatchlist]
  );

  const {
    items: allItems,
    sourceHealth,
    expectedFlowPerMin,
    connected,
    searchLocal,
  } = useNewsStream(serverFilters);

  useEffect(() => {
    const id = setInterval(() => setClockTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  // Client-side filtering: tab → categories, importance threshold, search.
  const displayItems = useMemo(() => {
    if (searchMode && searchQuery) {
      return searchLocal(searchQuery).slice(0, 500);
    }

    let items: StreamItem[];

    if (activeWatchlist) {
      // Watchlist mode: filter by watchlist entity list
      const entities = new Set(
        (activeWatchlist.filters.entityWatchlist ?? []).map((e) => e.toLowerCase())
      );
      items = entities.size > 0
        ? allItems.filter((item) =>
            item.entities.some((e) => entities.has(e.name.toLowerCase())) ||
            item.tickers.some((t) => entities.has(t.toLowerCase()))
          )
        : allItems;
    } else if (activeTab === "TOP") {
      items = selectTopItems(allItems, { limit: 200, minImportance: Math.max(minImportance, 10) });
    } else if (activeTab === "LOCAL") {
      items = allItems.filter((item) => Boolean(item.geo));
    } else {
      const cats = TAB_CATEGORY_MAP[activeTab];
      items = cats.length > 0
        ? allItems.filter((item) => cats.includes(item.category))
        : allItems;
    }

    if (minImportance > 0 && activeTab !== "TOP") {
      items = items.filter((item) => item.importance >= minImportance);
    }

    items.sort((a, b) => b.timestamp - a.timestamp);
    return items.slice(0, 500);
  }, [allItems, activeTab, minImportance, activeWatchlist, searchMode, searchQuery, searchLocal]);

  const now = Date.now();

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (searchMode && e.key === "Escape") {
        setSearchMode(false);
        setSearchQuery("");
        return;
      }
      if (searchMode) return;

      switch (e.key) {
        case "j": {
          e.preventDefault();
          setSelectedIdx((prev) => Math.min(prev + 1, displayItems.length - 1));
          break;
        }
        case "k": {
          e.preventDefault();
          setSelectedIdx((prev) => Math.max(prev - 1, 0));
          break;
        }
        case "Enter": {
          e.preventDefault();
          const item = displayItems[selectedIdx];
          if (item) setDetailItem(item);
          break;
        }
        case "o": {
          e.preventDefault();
          const item = displayItems[selectedIdx];
          if (item) window.open(item.sourceUrl, "_blank", "noopener,noreferrer");
          break;
        }
        case "f": {
          e.preventDefault();
          const item = displayItems[selectedIdx];
          if (item) item.favorited = !item.favorited;
          break;
        }
        case "/": {
          e.preventDefault();
          setSearchMode(true);
          setTimeout(() => searchInputRef.current?.focus(), 50);
          break;
        }
        case "Escape": {
          e.preventDefault();
          setDetailItem(null);
          break;
        }
        default: {
          const num = parseInt(e.key, 10);
          if (num >= 1 && num <= TERMINAL_TABS.length) {
            e.preventDefault();
            setActiveTab(TERMINAL_TABS[num - 1]);
            setSelectedIdx(0);
          }
        }
      }
    },
    [searchMode, displayItems, selectedIdx]
  );

  // Reset selection when tab changes so selection can't be off-screen.
  useEffect(() => {
    setSelectedIdx(0);
  }, [activeTab, activeWatchlistId]);

  useEffect(() => {
    if (selectedIdx >= 0 && selectedIdx < displayItems.length) {
      try {
        listRef.current?.scrollToRow({ index: selectedIdx, align: "smart", behavior: "smooth" });
      } catch { /* ignore if not mounted */ }
    }
  }, [selectedIdx, displayItems.length, listRef]);

  const densityLabel = density === "light" ? "Light" : density === "medium" ? "Medium" : "Heavy";
  const cycleDensity = useCallback(() => {
    setDensity((d) => (d === "light" ? "medium" : d === "medium" ? "heavy" : "light"));
  }, []);

  const clockStr = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return (
    <Panel panelId="news-terminal" workspace="news">
      <PanelHeader
        title="TERMINAL FEED"
        subtitle={`${clockStr} | Flow: ${expectedFlowPerMin} items/min | ${connected ? "LIVE" : "RECONNECTING..."}`}
        {...lockHeaderProps}
        controls={
          <div className="si-terminal-controls">
            <button type="button" className="si-terminal-density-btn" onClick={cycleDensity} title="Toggle density">
              {densityLabel}
            </button>
          </div>
        }
      />
      <PanelBody ref={bodyRef} className="si-news-terminal-body">
        {/* Tab bar */}
        <div className="si-news-category-tabs">
          {TERMINAL_TABS.map((tab, idx) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? "is-active" : ""}
              onClick={() => { setActiveTab(tab); setSelectedIdx(0); }}
              title={`${tab} (${idx + 1})`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="si-terminal-filterbar">
          <div className="si-terminal-filterbar-row">
            {TIME_WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={timeWindow === opt.value ? "is-active" : ""}
                onClick={() => setTimeWindow(opt.value)}
              >
                {opt.label}
              </button>
            ))}
            <span className="si-terminal-filterbar-sep">|</span>
            <label className="si-terminal-filterbar-importance">
              Min Imp:
              <input
                type="range"
                min={0}
                max={80}
                step={5}
                value={minImportance}
                onChange={(e) => setMinImportance(Number(e.target.value))}
              />
              <span>{minImportance}</span>
            </label>
            <span className="si-terminal-filterbar-sep">|</span>
            <button type="button" onClick={() => setFiltersOpen(!filtersOpen)}>
              {filtersOpen ? "Hide Filters" : "Filters"}
            </button>
            {watchlists.length > 0 && (
              <>
                <span className="si-terminal-filterbar-sep">|</span>
                <select
                  className="si-terminal-watchlist-select"
                  value={activeWatchlistId ?? ""}
                  onChange={(e) => setActiveWatchlistId(e.target.value || null)}
                >
                  <option value="">No watchlist</option>
                  {watchlists.map((wl) => (
                    <option key={wl.id} value={wl.id}>{wl.name}</option>
                  ))}
                </select>
              </>
            )}
            <button
              type="button"
              title="Save current filters as watchlist"
              onClick={() => {
                const name = prompt("Watchlist name:");
                if (!name) return;
                const id = `wl-${Date.now()}`;
                setWatchlists((prev) => [...prev, { id, name, filters: { ...filters } }]);
              }}
            >
              + Watchlist
            </button>
          </div>
        </div>

        {/* Search overlay */}
        {searchMode && (
          <div className="si-terminal-search">
            <input
              ref={searchInputRef}
              type="text"
              className="si-terminal-search-input"
              placeholder="Search buffer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setSearchMode(false); setSearchQuery(""); }
              }}
              autoFocus
            />
            <span className="si-terminal-search-count">{displayItems.length} matches</span>
          </div>
        )}

        {/* Feed rows */}
        <div
          className="si-news-terminal-table-scroll"
          ref={containerRef}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="grid"
        >
          {displayItems.length > 0 ? (
            <List
              listRef={listRef}
              rowCount={displayItems.length}
              rowHeight={ROW_HEIGHT[density]}
              overscanCount={20}
              rowComponent={VirtualTerminalRow}
              rowProps={{
                items: displayItems,
                selectedIdx,
                density,
                now,
                onSelect: setSelectedIdx,
                onOpen: setDetailItem,
              }}
              style={{ height: "100%", overflow: "auto" }}
            />
          ) : (
            <div className="si-news-empty">
              {connected ? "Waiting for items..." : "Connecting to stream..."}
            </div>
          )}
        </div>

        {/* Detail card */}
        {detailItem && (
          <DetailCard item={detailItem} onClose={() => setDetailItem(null)} />
        )}
      </PanelBody>
      <PanelFooter
        source="NEWS STREAM"
        updatedAt={Date.now()}
        health={connected ? "ok" : "loading"}
        message={`${displayItems.length} rows | ${activeTab}`}
      />
      <SourceHealthBar health={sourceHealth} />

      {/* Keyboard hints */}
      <div className="si-news-hotkeys" style={{ padding: "2px 6px", borderTop: "1px solid var(--si-line-2)" }}>
        <kbd>j</kbd>/<kbd>k</kbd> nav &nbsp;
        <kbd>Enter</kbd> detail &nbsp;
        <kbd>o</kbd> open &nbsp;
        <kbd>f</kbd> fav &nbsp;
        <kbd>/</kbd> search &nbsp;
        <kbd>1</kbd>-<kbd>9</kbd> tabs &nbsp;
        <kbd>Esc</kbd> close
      </div>
    </Panel>
  );
}
