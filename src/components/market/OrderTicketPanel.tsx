"use client";

import { useState, useEffect, useRef } from "react";

type Side = "BUY" | "SELL";
type OrderType = "MARKET" | "LIMIT" | "STOP" | "STOP-LIMIT";

interface FilledOrder {
  id: number;
  time: string;
  sym: string;
  side: Side;
  type: OrderType;
  qty: number;
  price: number;
  status: "FILLED";
}

interface Props {
  sym: string;
  spotPrice: number;
}

let _orderId = 1;

export default function OrderTicketPanel({ sym, spotPrice }: Props) {
  const [side, setSide] = useState<Side>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [qty, setQty] = useState("100");
  const [limitPrice, setLimitPrice] = useState(() => spotPrice.toFixed(2));
  const [stopPrice, setStopPrice] = useState(() => spotPrice.toFixed(2));
  const [orders, setOrders] = useState<FilledOrder[]>([]);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync limit/stop price when spotPrice changes (overlay opened for new sym)
  useEffect(() => {
    setLimitPrice(spotPrice.toFixed(2));
    setStopPrice(spotPrice.toFixed(2));
  }, [sym, spotPrice]);

  const qtyNum = parseFloat(qty) || 0;
  const limitNum = parseFloat(limitPrice) || spotPrice;
  const stopNum = parseFloat(stopPrice) || spotPrice;
  const execPrice = orderType === "MARKET" ? spotPrice : limitNum;
  const estValue = qtyNum * execPrice;

  function sendOrder() {
    if (qtyNum <= 0) return;
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", { hour12: false });
    const order: FilledOrder = {
      id: _orderId++,
      time,
      sym,
      side,
      type: orderType,
      qty: qtyNum,
      price: execPrice,
      status: "FILLED",
    };
    setOrders((prev) => [order, ...prev].slice(0, 8));
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 1500);
  }

  const needsLimit = orderType === "LIMIT" || orderType === "STOP-LIMIT";
  const needsStop = orderType === "STOP" || orderType === "STOP-LIMIT";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Ticket */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--wv-line)" }}>
        {/* BUY / SELL */}
        <div className="wv-order-side-row">
          {(["BUY", "SELL"] as Side[]).map((s) => (
            <button
              key={s}
              className={`wv-order-side-btn ${s === "BUY" ? "buy" : "sell"}${side === s ? " is-active" : ""}`}
              onClick={() => setSide(s)}
            >
              {s}
            </button>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "var(--wv-text)" }}>{sym}</span>
        </div>

        {/* Order type */}
        <div className="wv-order-type-row">
          {(["MARKET", "LIMIT", "STOP", "STOP-LIMIT"] as OrderType[]).map((t) => (
            <button
              key={t}
              className={`wv-order-type-btn${orderType === t ? " is-active" : ""}`}
              onClick={() => setOrderType(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Inputs */}
        <div className="wv-order-inputs">
          <div className="wv-order-input-row">
            <label className="wv-order-label">Qty (shares)</label>
            <input
              className="wv-order-input"
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          {needsStop && (
            <div className="wv-order-input-row">
              <label className="wv-order-label">Stop $</label>
              <input
                className="wv-order-input"
                type="number"
                step="0.01"
                value={stopPrice}
                onChange={(e) => setStopPrice(e.target.value)}
              />
            </div>
          )}
          {needsLimit && (
            <div className="wv-order-input-row">
              <label className="wv-order-label">Limit $</label>
              <input
                className="wv-order-input"
                type="number"
                step="0.01"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Est Value */}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--wv-text-muted)", marginTop: 6 }}>
          <span>Spot: <span style={{ color: "var(--wv-text)" }}>${spotPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
          <span>Est. Value: <span style={{ color: "var(--wv-text)", fontWeight: 600 }}>${estValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></span>
        </div>

        {/* Send button */}
        <button
          className={`wv-order-send-btn${flash ? " is-flash" : ""} ${side === "BUY" ? "buy" : "sell"}`}
          onClick={sendOrder}
        >
          {flash ? "✓ ORDER SENT" : `SEND ${side} ORDER`}
        </button>

        <div style={{ fontSize: 9, color: "rgba(185,205,224,0.35)", textAlign: "center", marginTop: 4 }}>
          Simulated — no real orders are placed
        </div>
      </div>

      {/* Blotter */}
      <div style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto", padding: "6px 14px" }}>
        <div style={{ fontSize: 9, color: "var(--wv-text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Order Blotter
        </div>
        {orders.length === 0 && (
          <div style={{ fontSize: 10, color: "var(--wv-text-muted)", fontStyle: "italic", paddingTop: 8 }}>
            No orders this session
          </div>
        )}
        {orders.map((o) => (
          <div key={o.id} className="wv-order-blotter-row">
            <span style={{ color: "var(--wv-text-muted)", minWidth: 52 }}>{o.time}</span>
            <span className={o.side === "BUY" ? "wv-order-buy-label" : "wv-order-sell-label"}>{o.side}</span>
            <span style={{ color: "var(--wv-text)", minWidth: 40, fontWeight: 600 }}>{o.sym}</span>
            <span style={{ color: "var(--wv-text-muted)" }}>{o.type}</span>
            <span style={{ color: "var(--wv-text)", minWidth: 44 }}>{o.qty.toLocaleString()}</span>
            <span style={{ color: "var(--wv-text)" }}>${o.price.toFixed(2)}</span>
            <span className="wv-order-filled-badge">{o.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
