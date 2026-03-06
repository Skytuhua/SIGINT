"use client";

import React from "react";

interface IpoRow {
  date: string;
  company: string;
  ticker: string;
  sector: string;
  range: string;
  shares: string;
  mcap: string;
  lead: string;
  status: "Upcoming" | "Priced" | "Trading" | "Withdrawn";
}

const IPOS: IpoRow[] = [
  { date: "Mar 12", company: "Cerebras Systems",   ticker: "CBRS",  sector: "Technology",      range: "$28–32",   shares: "45M",  mcap: "$8.2B",  lead: "CS · GS",    status: "Upcoming" },
  { date: "Mar 13", company: "Reddit",             ticker: "RDDT",  sector: "Comm. Services",  range: "$31–34",   shares: "22M",  mcap: "$6.4B",  lead: "MS · GS",    status: "Upcoming" },
  { date: "Mar 14", company: "Waystar",            ticker: "WAY",   sector: "Healthcare IT",   range: "$21–24",   shares: "50M",  mcap: "$3.7B",  lead: "JPM · BofA", status: "Upcoming" },
  { date: "Mar 19", company: "Rubrik",             ticker: "RBRK",  sector: "Technology",      range: "$28–31",   shares: "23M",  mcap: "$5.6B",  lead: "MS · JPM",   status: "Upcoming" },
  { date: "Mar 21", company: "Astera Labs",        ticker: "ALAB",  sector: "Semiconductors",  range: "$32–36",   shares: "19M",  mcap: "$5.2B",  lead: "GS · CS",    status: "Upcoming" },
  { date: "Feb 29", company: "BrightSpring Health",ticker: "BTSG",  sector: "Healthcare",      range: "$13.00",   shares: "83M",  mcap: "$2.7B",  lead: "JPM",        status: "Trading" },
  { date: "Feb 22", company: "OneStream",          ticker: "OS",    sector: "Software",        range: "$–",       shares: "—",    mcap: "$4.8B",  lead: "GS",         status: "Withdrawn" },
  { date: "Mar 26", company: "Panera Brands",      ticker: "PNRA",  sector: "Consumer",        range: "$16–19",   shares: "60M",  mcap: "$1.6B",  lead: "BofA · UBS", status: "Upcoming" },
  { date: "Apr 2",  company: "Klarna",             ticker: "KLAR",  sector: "Fintech",         range: "$55–65",   shares: "40M",  mcap: "$20B",   lead: "GS · JPM",   status: "Upcoming" },
];

const STATUS_COLOR: Record<string, string> = {
  Upcoming:  "var(--wv-text-muted)",
  Priced:    "#ffab40",
  Trading:   "#36b37e",
  Withdrawn: "#ff5a5f",
};

interface Props {
  style?: React.CSSProperties;
}

export default function IpoCalendarPanel({ style }: Props) {
  return (
    <div className="wv-market-panel" style={style}>
      <div className="wv-market-panel-header">
        <span className="wv-market-panel-title">IPO Pipeline</span>
        <span style={{ fontSize: 9, color: "var(--wv-text-muted)" }}>
          {IPOS.filter((i) => i.status === "Upcoming").length} upcoming
        </span>
        <span className="wv-market-panel-badge is-static">STATIC</span>
      </div>
      <div className="wv-market-panel-body" style={{ padding: 0 }}>
        <div className="wv-ipo-header">
          <span>DATE</span><span>COMPANY</span><span>TICKER</span>
          <span>SECTOR</span><span style={{ textAlign: "right" }}>RANGE</span>
          <span style={{ textAlign: "right" }}>MKT CAP</span><span>STATUS</span>
        </div>
        {IPOS.map((ipo, i) => (
          <div key={i} className="wv-ipo-row">
            <span style={{ color: "var(--wv-text-muted)" }}>{ipo.date}</span>
            <span style={{ color: "var(--wv-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ipo.company}</span>
            <span style={{ color: "#89e5ff", fontWeight: 700 }}>{ipo.ticker}</span>
            <span style={{ color: "var(--wv-text-muted)", fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ipo.sector}</span>
            <span style={{ textAlign: "right", color: "var(--wv-text)" }}>{ipo.range}</span>
            <span style={{ textAlign: "right", color: "var(--wv-text)", fontWeight: 600 }}>{ipo.mcap}</span>
            <span style={{ color: STATUS_COLOR[ipo.status], fontSize: 9, fontWeight: 600 }}>{ipo.status}</span>
          </div>
        ))}
      </div>
      <div className="wv-market-panel-footer">Renaissance Capital · IPO Monitor · placeholder data</div>
    </div>
  );
}
