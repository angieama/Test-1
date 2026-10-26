"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, BarChart3, CalendarDays, RefreshCw, Trophy } from "lucide-react";
import { earningsBounds, earningsPreset, type Earnings } from "@/lib/earnings-types";
import { requestJson } from "@/lib/client-api";
import { money } from "@/lib/payment-types";

export default function EarningsView() {
  const [period, setPeriod] = useState("today");
  const [range, setRange] = useState(() => earningsPreset("today"));
  const [data, setData] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null);
    requestJson<Earnings>(`/api/earnings?from=${range.from}&to=${range.to}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Reconnect to load earnings."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [range.from, range.to, refresh]);
  function preset(value: "today" | "week" | "month" | "all") {
    const next = earningsPreset(value); setPeriod(value); setRange(next); setFormError(""); setRefresh(n => n+1);
  }
  function apply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = new FormData(e.currentTarget);
    const nextFrom = String(fields.get("from") ?? "");
    const nextTo = String(fields.get("to") ?? "");
    try { earningsBounds(nextFrom, nextTo); setRange({ from: nextFrom, to: nextTo }); setPeriod("custom"); setFormError(""); setRefresh(n => n+1); }
    catch(e) { setFormError(e instanceof Error ? e.message : "Choose valid dates."); }
  }
  const top = data?.rides[0];
  const barMaximum = Math.max(1, ...(data?.rides.map(ride => Math.abs(ride.netCents)) ?? []));
  const rideDate = (value: number) => new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" }).format(value);
  return <section className="earnings-view" aria-label="Earnings report">
    <p className="view-description">See what came in and which rides earned most after refunds.</p>
    <div className="earnings-presets" role="group" aria-label="Earnings period">{([["today", "Today"], ["week", "This week"], ["month", "This month"], ["all", "All time"]] as const).map(([value,label]) => <button key={value} aria-pressed={period === value} className={period === value ? "selected" : ""} onClick={() => preset(value)}>{label}</button>)}</div>
    <form key={`${range.from}:${range.to}:${period}:${refresh}`} className="earnings-range" onSubmit={apply}><label>From<input name="from" type="date" defaultValue={range.from} min="1970-01-01" max="9998-12-31" required /></label><label>To<input name="to" type="date" defaultValue={range.to} min="1970-01-01" max="9998-12-31" required /></label><button type="submit" className="button button-outline"><CalendarDays size={16} />Apply range</button>{formError && <p className="form-error" role="alert">{formError}</p>}</form>
    <div className="earnings-period"><span>{range.from} → {range.to}</span><button className="icon-button" aria-label="Refresh earnings" onClick={() => setRefresh(n => n+1)} disabled={loading}><RefreshCw size={17} className={loading ? "spin" : ""} /></button></div>
    {(loading || (data && (data.from !== range.from || data.to !== range.to))) ? <div className="empty-state" role="status"><RefreshCw size={25} className="spin" /><h3>Calculating earnings…</h3></div> : error ? <div className="connection-error" role="alert"><p>{error}</p><button onClick={() => setRefresh(n => n+1)}>Retry</button></div> : data && <>
      <div className="earnings-total"><span>Net earnings after refunds</span><h2><small>KSh</small> {money(data.netCents)}</h2><p>{data.receipts} {data.receipts === 1 ? "receipt" : "receipts"} · {data.rideCount} {data.rideCount === 1 ? "ride" : "rides"}</p></div>
      <div className="earnings-split"><div><span>Money received</span><strong>KSh {money(data.receivedCents)}</strong></div><div><span>Refunds recorded</span><strong>KSh {money(data.refundedCents)}</strong></div></div>
      <div className="earnings-split"><div><span>M-Pesa received</span><strong>KSh {money(data.receivedCents - data.cashCents)}</strong></div><div><span>Cash received</span><strong>KSh {money(data.cashCents)}</strong></div></div>
      <div className="earnings-split"><div><span>M-Pesa verified</span><strong>KSh {money(data.confirmedCents)}</strong></div><div><span>M-Pesa awaiting verification</span><strong>KSh {money(data.unverifiedCents)}</strong></div></div>
      {data.unassignedCents > 0 && <div className="notice">KSh {money(data.unassignedCents)} received has no ride assigned. It is included above and excluded from ride rankings.</div>}
      <div className="earnings-ranking-title"><BarChart3 size={18} /><h2>Top earning rides</h2></div>
      {top ? <><div className="earnings-winner"><Trophy size={22} /><div><span>Highest net earnings</span><strong>{top.origin} → {top.destination}</strong><p>KSh {money(top.netCents)} net</p></div></div><div className="ride-rankings">{data.rides.map((ride,index) => <article key={ride.id} className="ride-ranking"><div className="ride-ranking-head"><span className="ride-rank">{index+1}</span><div><h3>{ride.origin}<ArrowRight size={13} />{ride.destination}</h3><p>{rideDate(ride.startedAt)} · {ride.endedAt ? "Completed" : "In progress"}</p></div><strong>KSh {money(ride.netCents)} net</strong></div><div className="earnings-bar" aria-hidden="true"><span style={{ width: `${Math.max(1, Math.abs(ride.netCents) / barMaximum * 100)}%` }} /></div><p className="ride-ranking-footer">{ride.receipts} {ride.receipts === 1 ? "receipt" : "receipts"} · KSh {money(ride.receivedCents)} received · KSh {money(ride.cashCents)} cash · KSh {money(ride.refundedCents)} refunded</p></article>)}</div>{data.rideCount > 100 && <p className="section-note">Showing the top 100 of {data.rideCount} rides. Totals include all rides.</p>}</> : <div className="empty-state"><BarChart3 size={28} /><h3>No ride activity in this range</h3><p>Try another range or generate payments on an active ride.</p></div>}
    </>}
    <p className="earnings-note">Dates use Kenya time (EAT). Weeks start Monday. Totals use when payments were received, including underpayments and top-ups, with each receipt counted once. Refunds use the date they were recorded, including refunds for older receipts. Ride rankings use money received minus refunds in this range. Cash uses the date the ride ends. Cash is separate from M-Pesa verification and does not add customer receipts or passenger confirmations. Original confirmed passenger counts and receipt locks are preserved.</p><p className="demo-note">Sample earnings · Live M-Pesa is not connected</p>
  </section>;
}
