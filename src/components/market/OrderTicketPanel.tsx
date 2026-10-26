"use client";

import { useState, useEffect, useRef } from "react";
import Term from "./shared/Term";

type Side = "BUY" | "SELL";
type OrderType = "MARKET" | "LIMIT" | "STOP" | "STOP-LIMIT";

interface SimulatedOrder {
  id: number;
  time: string;
  sym: string;
  side: Side;
  type: OrderType;
  qty: number;
  price: number | null;
  limit: number;
  stop: number;
  triggered: boolean;
  status: "FILLED" | "PENDING";
}

function evaluateOrder(order: SimulatedOrder, spot: number): SimulatedOrder {
  if (order.status === "FILLED" || !Number.isFinite(spot) || spot <= 0) return order;
  const needsStop = order.type === "STOP" || order.type === "STOP-LIMIT";
  const triggered = order.triggered || !needsStop || (order.side === "BUY" ? spot >= order.stop : spot <= order.stop);
  if (!triggered) return order;
  const needsLimit = order.type === "LIMIT" || order.type === "STOP-LIMIT";
  const executable = !needsLimit || (order.side === "BUY" ? spot <= order.limit : spot >= order.limit);
  return executable ? { ...order, triggered, price: spot, status: "FILLED" } : { ...order, triggered };
}

interface Props {
  sym: string;
  spotPrice: number | null;
  spotSource?: string;
}

let _orderId = 1;

export default function OrderTicketPanel({ sym, spotPrice, spotSource }: Props) {
  const [side, setSide] = useState<Side>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [qty, setQty] = useState("100");
  const [limitPrice, setLimitPrice] = useState(() => spotPrice?.toFixed(2) ?? "");
  const [stopPrice, setStopPrice] = useState(() => spotPrice?.toFixed(2) ?? "");
  const [orders, setOrders] = useState<SimulatedOrder[]>([]);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initializedPrice = useRef({ sym, ready: spotPrice != null });
  // Seed editable prices on the first valid quote without overwriting later user edits.
  useEffect(() => {
    if (initializedPrice.current.sym !== sym) initializedPrice.current = { sym, ready: false };
    if (!initializedPrice.current.ready && spotPrice != null) {
      setLimitPrice(spotPrice.toFixed(2));
      setStopPrice(spotPrice.toFixed(2));
      initializedPrice.current.ready = true;
    }
  }, [sym, spotPrice]);

  useEffect(() => {
    if (spotPrice == null) return;
    setOrders((previous) => previous.map((order) => order.sym === sym ? evaluateOrder(order, spotPrice) : order));
  }, [sym, spotPrice]);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const qtyNum = parseFloat(qty) || 0;
  const limitNum = parseFloat(limitPrice);
  const stopNum = parseFloat(stopPrice);
  const needsLimit = orderType === "LIMIT" || orderType === "STOP-LIMIT";
  const needsStop = orderType === "STOP" || orderType === "STOP-LIMIT";
  const validOrder = Number.isFinite(qtyNum) && qtyNum > 0 && spotPrice != null && Number.isFinite(spotPrice) && spotPrice > 0
    && (!needsLimit || Number.isFinite(limitNum) && limitNum > 0)
    && (!needsStop || Number.isFinite(stopNum) && stopNum > 0);
  const execPrice = needsLimit ? limitNum : needsStop ? stopNum : spotPrice;
  const estValue = execPrice == null || !Number.isFinite(execPrice) ? null : qtyNum * execPrice;

  function sendOrder() {
    if (!validOrder || spotPrice == null) return;
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", { hour12: false });
    const submitted: SimulatedOrder = {
      id: _orderId++,
      time,
      sym,
      side,
      type: orderType,
      qty: qtyNum,
      price: null,
      limit: limitNum,
      stop: stopNum,
      triggered: false,
      status: "PENDING",
    };
    const order = evaluateOrder(submitted, spotPrice);
    setOrders((prev) => [order, ...prev].slice(0, 8));
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 1500);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Ticket */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--si-line)" }}>
        {/* BUY / SELL */}
        <div className="si-order-side-row">
          {(["BUY", "SELL"] as Side[]).map((s) => (
            <button
              key={s}
              className={`si-order-side-btn ${s === "BUY" ? "buy" : "sell"}${side === s ? " is-active" : ""}`}
              onClick={() => setSide(s)}
            >
              {s}
            </button>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "var(--si-text)" }}>{sym}</span>
        </div>

        {/* Order type */}
        <div className="si-order-type-row">
          {(["MARKET", "LIMIT", "STOP", "STOP-LIMIT"] as OrderType[]).map((t) => (
            <button
              key={t}
              className={`si-order-type-btn${orderType === t ? " is-active" : ""}`}
              onClick={() => setOrderType(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Inputs */}
        <div className="si-order-inputs">
          <div className="si-order-input-row">
            <label className="si-order-label">Qty (shares)</label>
            <input
              className="si-order-input"
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          {needsStop && (
            <div className="si-order-input-row">
              <label className="si-order-label">Stop $</label>
              <input
                className="si-order-input"
                type="number"
                step="0.01"
                value={stopPrice}
                onChange={(e) => setStopPrice(e.target.value)}
              />
            </div>
          )}
          {needsLimit && (
            <div className="si-order-input-row">
              <label className="si-order-label">Limit $</label>
              <input
                className="si-order-input"
                type="number"
                step="0.01"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Est Value */}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--si-text-muted)", marginTop: 6 }}>
          <span>{spotPrice == null ? "Spot unavailable" : <>Spot: <span style={{ color: "var(--si-text)" }}>${spotPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></>}</span>
          <span>Est. Value: <span style={{ color: "var(--si-text)", fontWeight: 600 }}>{estValue == null ? "—" : `$${estValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}</span></span>
        </div>

        {/* Send button */}
        <button
          className={`si-order-send-btn${flash ? " is-flash" : ""} ${side === "BUY" ? "buy" : "sell"}`}
          onClick={sendOrder}
          disabled={!validOrder}
        >
          {flash ? "✓ ORDER SENT" : `SEND ${side} ORDER`}
        </button>

        <div style={{ fontSize: 9, color: "rgba(185,205,224,0.35)", textAlign: "center", marginTop: 4 }}>
          Simulated · evaluated on displayed spot updates · no real orders are placed
          {spotSource && <div>{spotPrice == null ? "Waiting for a current quote · orders paused" : spotSource}</div>}
        </div>
      </div>

      {/* Blotter */}
      <div style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto", padding: "6px 14px" }}>
        <div style={{ fontSize: 9, color: "var(--si-text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          <Term id="BLOTTER">Order Blotter</Term>
        </div>
        {orders.length === 0 && (
          <div style={{ fontSize: 10, color: "var(--si-text-muted)", fontStyle: "italic", paddingTop: 8 }}>
            No orders this session
          </div>
        )}
        {orders.map((o) => (
          <div key={o.id} className="si-order-blotter-row">
            <span style={{ color: "var(--si-text-muted)", minWidth: 52 }}>{o.time}</span>
            <span className={o.side === "BUY" ? "si-order-buy-label" : "si-order-sell-label"}>{o.side}</span>
            <span style={{ color: "var(--si-text)", minWidth: 40, fontWeight: 600 }}>{o.sym}</span>
            <span style={{ color: "var(--si-text-muted)" }}>{o.type}</span>
            <span style={{ color: "var(--si-text)", minWidth: 44 }}>{o.qty.toLocaleString()}</span>
            <span style={{ color: "var(--si-text)" }}>{o.price == null ? "Awaiting trigger / limit" : `$${o.price.toFixed(2)}`}</span>
            <span className="si-order-filled-badge">{o.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
