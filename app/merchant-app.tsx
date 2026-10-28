"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Bot, Copy, Undo2, BarChart3, Shuffle, TriangleAlert, ArrowRight, BusFront, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Clock3, Download, Flag, LockKeyhole, MapPin, MoreHorizontal, Navigation, Pencil, Plus, QrCode, ReceiptText, RefreshCw, Route, Search, ShieldCheck, Store, Users, Wallet, X } from "lucide-react";
import { amountToCents, fareBalance, firstName, isRecent, money, suggestedPassengers, type FareQR, type Journey, type Payment, type SavedRoute } from "@/lib/payment-types";
import InstallApp from "./install-app";
import EarningsView from "./earnings-view";
import AnalysisAssistant from "./analysis-assistant";
import { usePaymentLedger } from "./hooks/use-payment-ledger";
import { ApiError, requestJson } from "@/lib/client-api";

type View = "assistant" | "payments" | "journeys" | "qr" | "verified" | "earnings";
type Tab = "all" | "available" | "verified";
type Modal = { kind: "verify" | "details" | "refund"; payment: Payment } | { kind: "end"; journey: Journey } | { kind: "save-route"; route?: SavedRoute } | { kind: "start" | "fare" | "add" | "help" | "scope" | "simulate" } | null;
const colours = ["peach", "sage", "lavender", "blue", "rose"];

function Dialog({ title, children, onClose, busy = false, open = true }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; open?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (open && !el?.open) el?.showModal();
    if (!open) el?.close();
    return () => { el?.close(); };
  }, [open]);
  return <dialog ref={ref} className="dialog" aria-labelledby={titleId} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="sheet-handle" aria-hidden="true" />
    <div className="dialog-body"><div className="dialog-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose} disabled={busy}><X size={21} /></button></div>{children}</div>
  </dialog>;
}

function newRefundRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function journeyDate(journey: Journey) {
  return new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" }).format(journey.startedAt);
}

export default function MerchantApp({ browserOnly = false }: { browserOnly?: boolean }) {
  const { payments, journeys, routes, selectedJourneyId, selectJourney,
    now, loaded, refreshing, error, unauthorized, offline, loadPayments } = usePaymentLedger(browserOnly);
  const [view, setView] = useState<View>("payments");
  const [tab, setTab] = useState<Tab>("all");
  const [verificationFare, setVerificationFare] = useState("");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cashAmount, setCashAmount] = useState("0");
  const [refundAmount, setRefundAmount] = useState("");
  const refundRequest = useRef("");
  const [formError, setFormError] = useState("");
  const [routePresetId, setRoutePresetId] = useState("");
  const [origin, setOrigin] = useState("Kileleshwa");
  const [destination, setDestination] = useState("Town");
  const [sampleCount, setSampleCount] = useState(12);
  const [simulationSummary, setSimulationSummary] = useState<{ journeyId: string; text: string } | null>(null);
  const [formFare, setFormFare] = useState("100");
  const [customer, setCustomer] = useState("Mercy");
  const [newAmount, setNewAmount] = useState("100");
  const [combineId, setCombineId] = useState("");
  const [combineOpen, setCombineOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [visibleCount, setVisibleCount] = useState(12);
  const [qrPeople, setQrPeople] = useState<number>(1);
  const [qr, setQr] = useState<FareQR | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState("");
  const qrSequence = useRef(0);

  const activeJourney = journeys.find(j => j.endedAt === null) ?? null;
  const selectedJourney = journeys.find(j => j.id === selectedJourneyId) ?? null;

  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 4500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { setVisibleCount(12); }, [query, tab, view, selectedJourneyId]);
  useEffect(() => { qrSequence.current++; setQr(null); setQrError(""); setQrBusy(false); }, [activeJourney?.id, activeJourney?.fareCents, qrPeople]);


  useEffect(() => {
    setModal(current => {
      if (!current || !("payment" in current)) return current;
      const latest = payments.find(payment => payment.id === current.payment.id);
      return latest && latest !== current.payment ? { ...current, payment: latest } : current;
    });
  }, [payments]);

  const scoped = useMemo(() => payments.filter(p => selectedJourneyId === "all" || p.journeyId === selectedJourneyId), [payments, selectedJourneyId]);
  const current = view === "verified" ? scoped.filter(p => p.verifiedAt !== null) : selectedJourney?.endedAt ? scoped : scoped.filter(p => isRecent(p, now));
  const matches = current.filter(p => !query.trim() || [p.customer, p.receipt].some(s => s.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const filtered = matches.filter(p => view === "verified" || tab === "all" || (tab === "available" ? !p.verifiedAt : !!p.verifiedAt));
  const receivedTotal = current.reduce((sum, p) => sum + p.amountCents, 0);
  const verifiedPassengers = current.reduce((sum, p) => sum + (p.verifiedAt ? p.passengers ?? 1 : 0), 0);
  const endJourney = modal?.kind === "end" ? journeys.find(j => j.id === modal.journey.id) ?? modal.journey : null;
  const cashCents = amountToCents(cashAmount || "0", true);
  const refundPayment = modal?.kind === "refund" ? modal.payment : null;
  const refundCents = amountToCents(refundAmount);
  const invalidRefund = !!refundPayment && (!refundCents || refundCents > refundPayment.amountCents - refundPayment.refundedCents);
  const claimPayment = modal?.kind === "verify" ? modal.payment : null;
  const claimFare = claimPayment?.fareCents ?? amountToCents(verificationFare);
  const combineCandidates = claimPayment ? payments.filter(p => p.id !== claimPayment.id && !p.verifiedAt && !p.refundedCents && isRecent(p, now) && p.journeyId === claimPayment.journeyId && p.fareCents === claimPayment.fareCents && firstName(p.customer).toLocaleLowerCase() === firstName(claimPayment.customer).toLocaleLowerCase()) : [];
  const secondPayment = combineOpen ? combineCandidates.find(p => p.id === combineId) : undefined;
  const claimTotal = (claimPayment?.amountCents ?? 0) + (secondPayment?.amountCents ?? 0);
  const claimPeople = claimPayment ? suggestedPassengers(claimTotal, claimFare) : 0;
  const claimBalance = claimPayment ? fareBalance(claimTotal, claimFare, Math.max(1, claimPeople)) : null;
  const qrSource = qr ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(qr.svg) : "";

  function navigate(next: View) { setView(next); setQuery("");   setTab("all"); }
  function chooseJourney(id: string) { selectJourney(id); setModal(null);  setQuery(""); setTab("all"); void loadPayments(id); }

  function open(next: NonNullable<Modal>, preset?: Pick<Journey, "origin" | "destination" | "fareCents"> & { id?: string }) {
    if (next.kind === "end") setCashAmount("0");
    if (next.kind === "refund") { setRefundAmount(String((next.payment.amountCents - next.payment.refundedCents) / 100)); refundRequest.current = newRefundRequestId(); }
    setFormError(""); setCombineId(""); setCombineOpen(false); setVerificationFare("");
    setFormFare(String((activeJourney?.fareCents ?? 10000) / 100));
    setNewAmount(String(((activeJourney?.fareCents ?? 10000)) / 100));
    setCustomer("Mercy");
    setRoutePresetId(preset?.id ? (routes.some(route => route.id === preset.id) ? "saved:" : "ride:") + preset.id : "");
    if (next.kind === "start" || next.kind === "save-route") {
      const values = preset ?? (next.kind === "save-route" ? next.route : undefined);
      setOrigin(values?.origin ?? "Kileleshwa"); setDestination(values?.destination ?? "Town");
      setFormFare(String((values?.fareCents ?? activeJourney?.fareCents ?? 10000) / 100));
    }
    setModal(next);
  }
  async function mutate(path: string, method: string, body: unknown) {
    if (!browserOnly && !navigator.onLine) throw new Error("Reconnect before saving a payment or journey.");
    try {
      return await requestJson<{ id?: string; customers?: number; passengers?: number; receipts?: number; exact?: number; underpaid?: number; topups?: number; groups?: number }>(path, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
    } catch (error) {
      if (error instanceof ApiError && [409, 410].includes(error.status)) void loadPayments();
      throw error;
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!modal || busy || offline) return;
    setBusy(true); setFormError("");
    try {
      if (modal.kind === "start") {
        const data = await mutate("/api/journeys", "POST", { origin, destination, fare: formFare });
        selectJourney(data.id!); setView("payments");  
        setToast("Journey started. New payments belong to this ride.");
      } else if (modal.kind === "save-route") {
        await mutate("/api/routes" + (modal.route ? "/" + modal.route.id : ""), modal.route ? "PATCH" : "POST", { origin, destination, fare: formFare });
        setView("journeys"); setToast("Route saved. Pick it whenever you start a new ride.");
      } else if (modal.kind === "end") {
        await mutate("/api/journeys/" + modal.journey.id, "PATCH", { action: "end", cash: cashAmount || "0" });
        setView("journeys"); setToast("Journey ended. Your ride record is saved.");
      } else if (modal.kind === "fare" && activeJourney) {
        await mutate("/api/journeys/" + activeJourney.id, "PATCH", { action: "fare", fare: formFare });
        setToast("Fare updated for new payments and QR requests.");
      } else if (modal.kind === "refund") {
        await mutate("/api/payments/" + modal.payment.id + "/refund", "POST", { amount: refundAmount, requestId: refundRequest.current });
        setToast("Demo refund recorded. No money was transferred.");
      } else if (modal.kind === "verify") {
        if (combineOpen && !secondPayment) throw new Error("Select the second receipt before confirming.");
        await mutate(secondPayment ? "/api/payments/combine" : "/api/payments/" + modal.payment.id + "/verify", "POST", { paymentIds: [modal.payment.id, secondPayment?.id], fare: claimFare ? String(claimFare / 100) : undefined });
        setToast("Receipt locked · " + claimPeople + (claimPeople === 1 ? " passenger confirmed" : " passengers confirmed"));
      } else if (modal.kind === "simulate" && activeJourney) {
        const data = await mutate("/api/journeys/" + activeJourney.id + "/simulate", "POST", { count: sampleCount });
        selectJourney(activeJourney.id); navigate("payments");
        setSimulationSummary({ journeyId: activeJourney.id, text: `${data.customers} customers · ${data.passengers} passengers · ${data.receipts} receipts. ${data.exact} exact fares, ${data.underpaid} underpayments, ${data.topups} split payments, ${data.groups} group payments. All await verification.` });
        setToast("Sample passengers generated for this ride.");
      } else if (modal.kind === "add") {
        await mutate("/api/payments", "POST", { customer, amount: newAmount, journeyId: activeJourney?.id ?? null });
        if (activeJourney) { selectJourney(activeJourney.id); }
        navigate("payments"); setToast("Sample payment added to " + (activeJourney ? "this journey." : "unassigned payments."));
      } else return;
      await loadPayments();
      setModal(null);
    } catch (e) { setFormError(e instanceof Error ? e.message : "Couldn’t connect. Please try again."); }
    finally { setBusy(false); }
  }
  async function generateQR() {
    if (!activeJourney || qrBusy) return;
    if (!Number.isSafeInteger(qrPeople) || qrPeople < 1) { setQrError("Enter a whole passenger count of at least 1."); return; }
    const requestSequence = ++qrSequence.current;
    setQrBusy(true); setQrError("");
    try {
      const data = await requestJson<FareQR>("/api/journeys/" + activeJourney.id + "/qr", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passengers: qrPeople }),
      });
      if (requestSequence !== qrSequence.current) return;
      if (data.fareCents !== activeJourney.fareCents) { void loadPayments(); throw new Error("The fare changed. Generate a new QR after the journey refreshes."); }
      setQr(data);
      setToast("Fare QR ready · KSh " + money(data.amountCents));
    } catch (e) { if (requestSequence === qrSequence.current) setQrError(e instanceof Error ? e.message : "Reconnect to create your fare QR."); }
    finally { if (requestSequence === qrSequence.current) setQrBusy(false); }
  }

  function paymentCards() {
    return !loaded && !error ? <div className="empty-state" role="status"><RefreshCw className="spin" size={26} /><h3>Getting your payments…</h3></div> : !filtered.length ? <div className="empty-state"><div className="empty-icon"><ReceiptText size={27} /></div><h3>{query || tab !== "all" ? "No matching payments" : view === "verified" ? "Your verified receipts live here" : "Ready for the next payment"}</h3><p>{query || tab !== "all" ? "Try another first name or receipt code." : selectedJourney ? "Payments for this ride will appear here." : "Start a journey to keep every ride’s payments together."}</p><button className="button button-outline" onClick={query || tab !== "all" ? () => {  setQuery(""); setTab("all");  } : () => open({ kind: "add" })}>{query || tab !== "all" ? "Clear filters" : "Add a sample payment"}<ArrowRight size={16} /></button></div> : <div className="payment-list">{filtered.slice(0, visibleCount).map(p => {
      const name = firstName(p.customer);
      const receiptFare = p.fareCents;
      const underpaid = !p.verifiedAt && !!receiptFare && p.amountCents < receiptFare;
      const missing = underpaid ? receiptFare! - p.amountCents : 0;
      const covered = p.verifiedAt ? p.combinedPassengers ?? p.passengers ?? 1 : suggestedPassengers(p.amountCents, p.fareCents);
      const expired = !isRecent(p, now);
      return <article key={p.id} className={"payment-card" + (p.verifiedAt ? " is-verified" : "")}>
        <div className="payment-top"><div className="payer"><span className={"customer-avatar " + colours[name.charCodeAt(0) % colours.length]} aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span><div><h3>{name}</h3><code>{p.receipt}</code></div></div><strong className="payment-value"><span>KSh</span> {money(p.amountCents)}</strong></div>
        {p.refundedCents > 0 && <div className="refund-notice"><Undo2 size={15} />{p.refundedCents === p.amountCents ? "Fully refunded" : "Partially refunded"} · KSh {money(p.refundedCents)}</div>}
        {p.combinedTotalCents != null && <div className="combined-notice"><strong>Combined payment · KSh {money(p.combinedTotalCents)}</strong><p>{p.combinedReceipts}</p><small>Passenger total counted once across both receipts.</small></div>}
        {underpaid && <div className="underpayment-notice" role="status"><TriangleAlert size={17} /><div><strong>Underpaid · KSh {money(missing)} short</strong><p>Fare is KSh {money(receiptFare!)} per person. Payment does not cover one passenger.</p></div></div>}
        <div className="payment-bottom"><span className="payment-caption">{covered > 0 ? <><Users size={14} />{covered} {covered === 1 ? "passenger" : "passengers"}{p.verifiedAt ? " confirmed" : " covered"}</> : underpaid ? "0 passengers covered" : "Fare entered when verifying"}</span>{p.verifiedAt ? <button className="verified-button" aria-label={"View verified receipt for " + name} onClick={() => open({ kind: "details", payment: p })}><CheckCheck size={17} />Verified<LockKeyhole size={12} /></button> : <button className="verify-button" aria-label={"Verify payment from " + name} onClick={() => open({ kind: "verify", payment: p })} disabled={!!error || offline || expired || !!p.refundedCents}><Check size={17} />{p.refundedCents ? "Refund recorded" : expired ? "Expired" : underpaid ? "Top up / verify" : "Verify"}</button>}</div>
        {p.refundedCents < p.amountCents && <button className="refund-link" onClick={() => open({ kind: "refund", payment: p })} disabled={offline || !!error}><Undo2 size={14} />Record refund</button>}
      </article>;
    })}{visibleCount < filtered.length && <button className="show-more" onClick={() => setVisibleCount(n => n + 12)}>Show more payments<ChevronDown size={16} /></button>}</div>;
  }

  return <div className="app-shell">
    <header className="app-header"><a className="brand" href={browserOnly ? "./index.html" : "/"} aria-label="LipaVerify home"><span className="brand-mark"><CheckCheck size={23} strokeWidth={2.4} /></span><span>Lipa<span className="brand-light">Verify</span><small>PAYMENTS, CONFIRMED.</small></span></a><div className="header-actions"><span className="demo-pill">DEMO</span><button className={"icon-button analyst-open" + (view === "assistant" ? " active" : "")} aria-label="Open AI analysis assistant" aria-pressed={view === "assistant"} onClick={() => navigate("assistant")}><Bot size={22} /></button><button className="icon-button more-button" aria-label="Open workspace menu" onClick={() => setWorkspaceOpen(true)}><MoreHorizontal size={23} /></button></div></header>
    <main className="app-content">
      <div className="screen-heading"><div><p className="eyebrow">YOUR EVERYDAY CO-PILOT</p><h1>{view === "assistant" ? "Ask Lipa" : view === "payments" ? "Verify payments" : view === "verified" ? "Verified receipts" : view === "journeys" ? "Your journeys" : view === "earnings" ? "Your earnings" : "Your fare QR"}</h1></div>{view === "payments" && <button className="add-sample" aria-label="Add sample payment" onClick={() => open({ kind: "add" })}><Plus size={22} /></button>}</div>
      {error && <div className="connection-error" role="alert"><p>{error}</p>{unauthorized ? <a href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in<ArrowRight size={14} /></a> : <button onClick={() => void loadPayments()} disabled={refreshing}>Retry</button>}</div>}

      {(view === "payments" || view === "verified") && <>
        <button className="journey-strip" onClick={() => open({ kind: "scope" })}><span className="route-symbol"><Navigation size={17} /></span><span><strong>{selectedJourney ? selectedJourney.origin + " → " + selectedJourney.destination : "All payments"}</strong><small>{selectedJourney ? (selectedJourney.endedAt ? "Journey ended" : "Journey in progress") + " · KSh " + money(selectedJourney.fareCents) + " / person" : activeJourney ? "Tap to choose a journey" : "Start a journey to track a ride"}</small></span><ChevronDown size={17} /></button>
        {!activeJourney && view === "payments" && <button className="start-journey-inline" onClick={() => open({ kind: "start" })}><Plus size={16} />Start a journey<span>Kileleshwa → Town, for example</span></button>}
        {simulationSummary && simulationSummary.journeyId === selectedJourneyId && <div className="simulation-summary" role="status"><strong>Ride simulation added</strong><p>{simulationSummary.text}</p><button onClick={() => setSimulationSummary(null)}>Dismiss</button></div>}
        <div className="search-input"><Search size={20} /><input aria-label="Search first name or transaction code" value={query} onChange={e => setQuery(e.target.value)} placeholder="First name or transaction code" autoComplete="off" />{query && <button className="input-clear" aria-label="Clear customer search" onClick={() => setQuery("")}><X size={17} /></button>}</div>
        <div className="receipts-heading"><div><h2>{view === "verified" ? "Locked & confirmed" : selectedJourney?.endedAt ? "Journey payments" : "Recent payments"}<span>{current.length}</span></h2><p>{view === "verified" ? verifiedPassengers + " passengers confirmed" : selectedJourney?.endedAt ? "Saved with this ride" : <><Clock3 size={12} />Last 30 minutes</>}</p></div><div className="received-summary"><strong>KSh {money(receivedTotal)}</strong><span>{view === "verified" ? "confirmed" : "received"}</span></div><button className={"icon-button refresh-button" + (refreshing ? " is-refreshing" : "")} aria-label="Refresh payments" onClick={() => void loadPayments()} disabled={refreshing}><RefreshCw size={18} /></button></div>
        {view === "payments" && <div className="payment-tabs" role="tablist" aria-label="Payment status">{([["all", "All", matches.length], ["available", "Unverified", matches.filter(p => !p.verifiedAt).length], ["verified", "Verified", matches.filter(p => p.verifiedAt).length]] as const).map(([key, label, count]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "selected" : ""} onClick={() => setTab(key)}>{label}<span>{count}</span></button>)}</div>}
        {paymentCards()}
        <p className="demo-note"><span className="green-dot" />Sample payments · Live M-Pesa is not connected</p>
      </>}

      {view === "journeys" && <>
        <div className="view-intro"><p>Pick a route. Start a fresh ride.</p><button className="button button-primary" onClick={() => open({ kind: "start" })} disabled={!!activeJourney || offline}><Plus size={17} />Start journey</button></div>
        {activeJourney && <p className="route-session-note">Finish the current journey before starting another. You can add or edit saved routes at any time.</p>}
        <section className="saved-routes" aria-label="Saved routes">
          <div className="saved-routes-heading"><h2>Saved routes <span>{routes.length}</span></h2><button className="button button-outline" onClick={() => open({ kind: "save-route" })} disabled={offline}><Plus size={16} />Add route</button></div>
          {!routes.length ? <p className="saved-routes-empty">Add your usual destinations and default fares once, then pick a route for your next ride.</p> : <div className="saved-route-list">{routes.map(route => <article key={route.id} className="saved-route-card">
            <h3><MapPin size={16} />{route.origin}<ArrowRight size={14} />{route.destination}</h3><p>KSh {money(route.fareCents)} per passenger</p>
            <div><button onClick={() => open({ kind: "save-route", route })} disabled={offline} aria-label={"Edit saved route " + route.origin + " to " + route.destination}><Pencil size={14} />Edit</button><button onClick={() => open({ kind: "start" }, route)} disabled={!!activeJourney || offline} aria-label={"Start saved route " + route.origin + " to " + route.destination}><Navigation size={15} />Start ride</button></div>
          </article>)}</div>}
        </section>
        <h2 className="ride-history-heading">Ride history</h2>
        {!journeys.length ? <div className="empty-state"><div className="empty-icon"><BusFront size={30} /></div><h3>Ready for your first ride</h3><p>Choose a saved route or enter your destination and fare.</p><button className="button button-primary" onClick={() => open({ kind: "start" })} disabled={offline}><Plus size={17} />Start journey</button></div> : <div className="journey-list">{journeys.map(j => <article key={j.id} className={"journey-card" + (!j.endedAt ? " active-journey" : "")}>
          <div className="journey-card-top"><span className={!j.endedAt ? "journey-status live" : "journey-status"}><span />{j.endedAt ? "Completed" : "In progress"}</span><span className="journey-date">{journeyDate(j)}</span></div>
          <h2><MapPin size={18} />{j.origin}<ArrowRight size={17} />{j.destination}</h2><p className="journey-fare">KSh {money(j.fareCents)} per passenger</p>
          <div className="journey-metrics"><div><strong>KSh {money(j.totalCents)}</strong><span>Received</span></div><div><strong>{j.passengerCount}</strong><span>Confirmed people</span></div><div><strong>{j.paymentCount}</strong><span>Receipts</span></div></div>
          <p className="journey-money-breakdown">M-Pesa: KSh {money(j.mpesaCents)} · Cash: KSh {money(j.cashCents)}</p>
          <div className="journey-actions"><button onClick={() => { chooseJourney(j.id); setView("payments"); }}>View payments<ChevronRight size={15} /></button>{!j.endedAt ? <button className="end-journey-link" onClick={() => open({ kind: "end", journey: j })}><Flag size={14} />End journey</button> : <button onClick={() => open({ kind: "start" }, j)} disabled={!!activeJourney || offline} aria-label={"Repeat route " + j.origin + " to " + j.destination}><Copy size={14} />Repeat route</button>}</div>
          <button className="save-history-route" onClick={() => open({ kind: "save-route" }, j)} disabled={offline}><Plus size={14} />Save this route</button>
        </article>)}</div>}
        <p className="section-note"><ShieldCheck size={14} />Repeated routes start a new session. Earlier payments and cash stay with their original ride.</p>
      </>}


      {view === "earnings" && <><button className="analyst-banner" onClick={() => navigate("assistant")}><Bot size={21} /><span><strong>Ask your ride analyst</strong><small>Find patterns in your collections</small></span><ChevronRight size={18} /></button><EarningsView /></>}
      {view === "assistant" && <AnalysisAssistant journeys={journeys} />}

      {view === "qr" && <><p className="view-description">Your fare. Your ride. Ready to show.</p>{!activeJourney ? <div className="empty-state"><div className="empty-icon"><QrCode size={32} /></div><h3>Start a ride, set a fare</h3><p>Your fare QR will belong to that journey.</p><button className="button button-primary" onClick={() => open({ kind: "start" })}><Plus size={17} />Start journey</button></div> : <><div className="qr-journey"><span className="route-symbol"><Route size={20} /></span><div><strong>{activeJourney.origin} → {activeJourney.destination}</strong><span>Current journey</span></div><span className="live-dot" /></div><div className="qr-fare-setting"><div><span>Fare per passenger</span><strong><small>KSh</small> {money(activeJourney.fareCents)}</strong></div><button className="button button-outline" onClick={() => open({ kind: "fare" })}><Pencil size={15} />Edit fare</button></div><label className="form-label" htmlFor="qr-passengers">Number of passengers</label><input id="qr-passengers" className="form-input" type="number" inputMode="numeric" min="1" max={Math.floor(25000000 / activeJourney.fareCents)} step="1" value={qrPeople || ""} onChange={e => setQrPeople(Number(e.target.value))} /><section className="qr-preview"><span className="qr-preview-label">FARE PREVIEW</span>{qr ? <img src={qrSource} alt={"Fare details QR for " + activeJourney.origin + " to " + activeJourney.destination + ", " + qrPeople + " passengers, KSh " + money(qr.amountCents)} width="300" height="300" /> : <div className="qr-placeholder"><QrCode size={82} strokeWidth={1.1} /><p>Your journey’s fare QR<br />will appear here.</p></div>}<h2>KSh {money(activeJourney.fareCents * qrPeople)}</h2><p>{qrPeople} {qrPeople === 1 ? "passenger" : "passengers"} · {activeJourney.origin} → {activeJourney.destination}</p></section>{qrError && <p className="form-error" role="alert">{qrError}</p>}<button className="button button-primary full-width" onClick={() => void generateQR()} disabled={qrBusy || offline}>{qrBusy ? <RefreshCw size={18} className="spin" /> : <QrCode size={18} />}{qrBusy ? "Creating QR…" : qr ? "Regenerate fare QR" : "Generate fare QR"}</button>{qr && <a className="button button-outline full-width" href={qrSource} download={"LipaVerify-fare-" + qr.id.slice(0, 8) + ".svg"}><Download size={17} />Download QR</a>}<p className="qr-disclaimer"><CircleHelp size={16} />This QR shows fare details only. M-Pesa payment collection needs a merchant connection.</p></>}</>}
    </main>

    <nav className="bottom-nav" aria-label="App navigation">{([["payments", Wallet, "Payments"], ["journeys", BusFront, "Journeys"], ["qr", QrCode, "Fare QR"], ["verified", ShieldCheck, "Verified"], ["earnings", BarChart3, "Earnings"]] as const).map(([key, Icon, label]) => <button key={key} className={view === key ? "active" : ""} aria-current={view === key ? "page" : undefined} onClick={() => navigate(key)}><span><Icon size={22} strokeWidth={view === key ? 2.2 : 1.7} /></span>{label}</button>)}</nav>
    {toast && <div className="toast" role="status"><span><Check size={17} /></span><p>{toast}</p><button aria-label="Dismiss notification" onClick={() => setToast("")}><X size={17} /></button></div>}

    <Dialog title="Your workspace" open={workspaceOpen} onClose={() => setWorkspaceOpen(false)}><div className="workspace-identity"><span className="brand-mark"><Store size={23} /></span><div><h3>Biashara workspace</h3><p>Demo merchant · Payment verification</p></div></div><button className="menu-row" onClick={() => { setWorkspaceOpen(false); navigate("assistant"); }}><Bot size={21} /><span>AI analysis assistant</span><ChevronRight size={17} /></button><button className="menu-row" onClick={() => { setWorkspaceOpen(false); open({ kind: "help" }); }}><CircleHelp size={21} /><span>How it works</span><ChevronRight size={17} /></button><button className="menu-row" onClick={() => { if (activeJourney) { setWorkspaceOpen(false); open({ kind: "simulate" }); } }} disabled={offline || !activeJourney}><Shuffle size={21} /><span>Generate sample passengers</span><ChevronRight size={17} /></button>{!activeJourney && <p className="section-note">Start a journey to generate sample passengers.</p>}<button className="menu-row" onClick={() => { setWorkspaceOpen(false); open({ kind: "add" }); }}><Plus size={21} /><span>Add a sample payment</span><ChevronRight size={17} /></button><div className="installation-row">{browserOnly ? <p className="section-note">On a hosted HTTPS page, use your browser’s “Add to Home Screen” or “Install app” option.</p> : <InstallApp />}</div><p className="section-note">A sample workspace for trying out fares, journeys and receipt verification.</p></Dialog>

    {modal && <Dialog title={modal.kind === "save-route" ? (modal.route ? "Edit saved route" : "Add a saved route") : modal.kind === "refund" ? "Record a refund" : modal.kind === "verify" ? "Confirm this payment" : modal.kind === "details" ? "Verified & locked" : modal.kind === "start" ? "Start a journey" : modal.kind === "end" ? "End this journey?" : modal.kind === "fare" ? "Set your fare" : modal.kind === "simulate" ? "Simulate this ride" : modal.kind === "add" ? "Add sample payment" : modal.kind === "scope" ? "Choose a journey" : "A little help, on the go"} onClose={() => setModal(null)} busy={busy}>
      {["start", "save-route", "end", "fare", "verify", "add", "simulate", "refund"].includes(modal.kind) && <form onSubmit={submit}>
        {(modal.kind === "start" || modal.kind === "save-route") && <>
          <p className="dialog-description">{modal.kind === "start" ? "Pick a saved route or copy a past ride. Adjust the fare, then start a new session." : "Save a destination and default fare for next time. This does not start a journey or change any existing ride."}</p>
          {modal.kind === "start" && (routes.length > 0 || journeys.length > 0) && <><label className="form-label" htmlFor="journey-preset">Pick a route</label><select className="form-input" id="journey-preset" value={routePresetId} onChange={e => {
            setRoutePresetId(e.target.value);
            const [kind,id] = e.target.value.split(":");
            const picked = kind === "saved" ? routes.find(route => route.id === id) : journeys.find(journey => journey.id === id);
            if (picked) { setOrigin(picked.origin); setDestination(picked.destination); setFormFare(String(picked.fareCents / 100)); }
          }}><option value="">Enter details / copied route</option>{routes.length > 0 && <optgroup label="Saved routes">{routes.map(route => <option key={route.id} value={"saved:" + route.id}>{route.origin} → {route.destination} · KSh {money(route.fareCents)}</option>)}</optgroup>}{journeys.length > 0 && <optgroup label="Recent rides">{journeys.slice(0,20).map(j => <option key={j.id} value={"ride:" + j.id}>{j.origin} → {j.destination} · KSh {money(j.fareCents)} · {journeyDate(j)}</option>)}</optgroup>}</select></>}
          <label className="form-label" htmlFor="journey-origin">From</label><input className="form-input" id="journey-origin" value={origin} onChange={e => setOrigin(e.target.value)} maxLength={60} required />
          <label className="form-label" htmlFor="journey-destination">To</label><input className="form-input" id="journey-destination" value={destination} onChange={e => setDestination(e.target.value)} maxLength={60} required />
          <label className="form-label" htmlFor="journey-fare">Fare per passenger (KSh)</label><input className="form-input" id="journey-fare" inputMode="decimal" value={formFare} onChange={e => setFormFare(e.target.value)} required maxLength={9} />
          {modal.kind === "start" && <div className="notice">Starting this ride creates a new payment record. Changing this fare does not edit the saved route or past journeys.</div>}
          {modal.kind === "start" && activeJourney && <p className="form-error">End the current journey before starting another.</p>}
        </>}

        {modal.kind === "end" && endJourney && <><p className="dialog-description">{endJourney.origin} → {endJourney.destination}</p><label className="form-label" htmlFor="ride-cash">Cash received on this ride (KSh)</label><input id="ride-cash" className="form-input" inputMode="decimal" value={cashAmount} onChange={e => setCashAmount(e.target.value)} placeholder="0.00" maxLength={9} /><p className="section-note">Enter the total cash collected. Leave it at 0 if everyone paid by M-Pesa. Cash is recorded once when you finish the ride.</p>{cashCents === null && <p className="form-error">Enter cash from KSh 0 to KSh 250,000, with up to two decimal places.</p>}<div className="end-summary"><span>Total received: M-Pesa + cash</span><strong>KSh {money(endJourney.mpesaCents + (cashCents ?? 0))}</strong><p>M-Pesa: KSh {money(endJourney.mpesaCents)} · Cash: KSh {money(cashCents ?? 0)}</p><p>{endJourney.passengerCount} M-Pesa passengers confirmed · {endJourney.paymentCount} receipts</p></div><p className="section-note">Cash will be saved with this ride and included in Earnings on the date the ride ends. Cash does not create customer receipts or confirmed passenger counts.</p>{endJourney.paymentCount > endJourney.verifiedCount && <div className="notice">Some receipts are still unverified. They can be checked within their original 30-minute window.</div>}</>}

        {modal.kind === "fare" && <><p className="dialog-description">Set the price per person for {activeJourney?.origin} → {activeJourney?.destination}.</p><label className="form-label" htmlFor="updated-fare">Fare per passenger (KSh)</label><input className="form-input large-input" id="updated-fare" inputMode="decimal" value={formFare} onChange={e => setFormFare(e.target.value)} required maxLength={9} /><div className="notice">New payments and QR requests use this fare. Earlier receipts keep their original fare.</div></>}
        {modal.kind === "simulate" && <><p className="dialog-description">Generate random sample payments for {activeJourney?.origin} → {activeJourney?.destination}, at KSh {money(activeJourney?.fareCents ?? 0)} per passenger.</p><label className="form-label" htmlFor="sample-count">Paying customers (4–30)</label><input id="sample-count" className="form-input" type="number" inputMode="numeric" min="4" max="30" step="1" required value={sampleCount || ""} onChange={e => setSampleCount(Number(e.target.value))} /><div className="notice"><strong>Every batch includes:</strong><ul><li>Exact fare payments</li><li>One short payment still needing a top-up</li><li>One split fare paid using two receipts</li><li>One customer paying for 2–10 passengers</li></ul><p>Only three receipts show underpayment notices: the short payment and the two parts of the split fare. Every other payment covers one or more fares. Split receipts share the same first name. Groups mean the passenger total can exceed the customer count.</p></div><p className="section-note">Sample money only. Receipts stay unverified so you can try warnings, combining payments and passenger confirmation. Generating again adds more samples.</p></>}
        {modal.kind === "add" && <><p className="dialog-description">Sample data only. No money is transferred.</p><div className="notice">{activeJourney ? "Linked to: " + activeJourney.origin + " → " + activeJourney.destination : "No active journey. This payment will be unassigned."}</div><label className="form-label" htmlFor="sample-customer">First name</label><input className="form-input" id="sample-customer" value={customer} onChange={e => setCustomer(e.target.value)} maxLength={80} required /><label className="form-label" htmlFor="sample-amount">Amount paid (KSh)</label><input className="form-input" id="sample-amount" inputMode="decimal" value={newAmount} onChange={e => setNewAmount(e.target.value)} maxLength={9} required /></>}
        {modal.kind === "refund" && <><div className="confirmation-receipt"><h3>{firstName(modal.payment.customer)}</h3><strong><small>KSh</small> {money(modal.payment.amountCents)}</strong><code>{modal.payment.receipt}</code></div><div className="notice">Already refunded: KSh {money(modal.payment.refundedCents)}<br />Available to refund: KSh {money(modal.payment.amountCents - modal.payment.refundedCents)}</div><label className="form-label" htmlFor="refund-amount">Refund amount (KSh)</label><input id="refund-amount" className="form-input" inputMode="decimal" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} required maxLength={9} /><button type="button" className="refund-link" onClick={() => setRefundAmount(String((modal.payment.amountCents - modal.payment.refundedCents) / 100))}>Use full remaining amount</button><p className="section-note">Choose all or part of this receipt’s remaining amount. For a combined payment, record each receipt’s refund separately. Original receipt locks and confirmed passenger counts stay unchanged.</p><div className="underpayment-notice"><TriangleAlert size={18} /><p>Demo record only. This does not send money to the customer. Real refunds require an M-Pesa merchant connection.</p></div></>}
        {modal.kind === "verify" && <>{modal.payment.fareCents === null && <><label className="form-label" htmlFor="verification-fare">Fare per passenger (KSh)</label><input className="form-input" id="verification-fare" inputMode="decimal" value={verificationFare} maxLength={9} required onChange={e => setVerificationFare(e.target.value)} /><p className="section-note">This receipt has no saved journey fare. Enter the fare to calculate passenger coverage before confirming.</p></>}{(modal.payment.verifiedAt !== null || modal.payment.refundedCents > 0) && <p className="form-error" role="alert">This receipt was already verified or refunded. Close this form and choose another receipt.</p>}<div className="confirmation-receipt"><span className="confirmation-avatar">{firstName(modal.payment.customer).slice(0, 2).toUpperCase()}</span><h3>{firstName(modal.payment.customer)}</h3><strong><small>KSh</small> {money(modal.payment.amountCents)}</strong><code>{modal.payment.receipt}</code></div><button type="button" className="button button-outline full-width" aria-expanded={combineOpen} onClick={() => { setCombineOpen(!combineOpen); setCombineId(""); }}>{combineOpen ? "Use this receipt only" : "Combine with another payment"}</button>{combineOpen && <div className="combine-picker"><p>Choose a second receipt. Check both transaction codes with the customer: a matching first name alone does not prove identity.</p>{!combineCandidates.length ? <p className="form-error">No eligible second payment yet. Add or wait for the top-up, then refresh and reopen this receipt. Both receipts must be from the same journey, fare and first name, within 30 minutes.</p> : combineCandidates.map(p => <label key={p.id}><input type="radio" name="second-payment" value={p.id} checked={combineId === p.id} onChange={() => setCombineId(p.id)} /><span><strong>{firstName(p.customer)} · KSh {money(p.amountCents)}</strong><code>{p.receipt}</code></span></label>)}{secondPayment && <div className="notice"><strong>Combined total: KSh {money(claimTotal)}</strong><p>KSh {money(modal.payment.amountCents)} + KSh {money(secondPayment.amountCents)}</p></div>}</div>}<div className="notice"><Users size={20} /><strong>{claimPeople} {claimPeople === 1 ? "passenger" : "passengers"} covered</strong><p>{claimFare ? "KSh " + money(claimTotal) + " ÷ KSh " + money(claimFare) + " per person" : "Set the fare in Fare per person to calculate the passenger count."}</p></div>{claimBalance?.extra ? <div className="notice">KSh {money(claimBalance.extra)} extra after {claimPeople} full fares. No additional passenger counted.</div> : null}{claimFare && claimPeople < 1 && <p className="form-error">Underpaid · KSh {money(claimBalance?.shortfall ?? 0)} short of one full fare. This receipt cannot be confirmed yet.</p>}<p className="lock-notice"><LockKeyhole size={16} />{secondPayment ? "Both receipts will be permanently locked for" : "This receipt will be permanently locked for"} {claimPeople} {claimPeople === 1 ? "passenger" : "passengers"}.</p></>}
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <div className="dialog-actions"><button type="button" className="button button-outline" onClick={() => setModal(null)} disabled={busy}>Cancel</button><button type="submit" className="button button-primary" disabled={busy || offline || (modal.kind === "start" && !!activeJourney) || invalidRefund || (modal.kind === "end" && cashCents === null) || (modal.kind === "verify" && (modal.payment.verifiedAt !== null || !!modal.payment.refundedCents || !isRecent(modal.payment, now) || !!claimBalance?.shortfall || (!claimFare || claimPeople < 1 || (combineOpen && !secondPayment))))}>{busy ? <RefreshCw size={17} className="spin" /> : modal.kind === "verify" ? <LockKeyhole size={17} /> : modal.kind === "start" ? <Navigation size={17} /> : <Check size={17} />}{busy ? "Saving…" : modal.kind === "verify" ? "Confirm " + claimPeople + (claimPeople === 1 ? " passenger" : " passengers") : modal.kind === "start" ? "Start journey" : modal.kind === "end" ? "End journey" : modal.kind === "fare" ? "Save fare" : modal.kind === "simulate" ? "Generate passengers" : modal.kind === "refund" ? "Record refund" : modal.kind === "save-route" ? "Save route" : "Add payment"}</button></div>
      </form>}
      {modal.kind === "details" && <><div className="confirmation-receipt"><span className="details-icon"><ShieldCheck size={31} /></span><h3>{firstName(modal.payment.customer)}</h3><strong><small>KSh</small> {money(modal.payment.amountCents)}</strong><code>{modal.payment.receipt}</code></div><div className="verified-details">{modal.payment.combinedTotalCents != null && <div className="combined-notice"><strong>Combined total KSh {money(modal.payment.combinedTotalCents)}</strong><p>{modal.payment.combinedReceipts}</p><small>Two receipts locked together. Passengers counted once.</small></div>}<span><Users size={18} />{modal.payment.combinedPassengers ?? modal.payment.passengers ?? 1} {(modal.payment.combinedPassengers ?? modal.payment.passengers ?? 1) === 1 ? "passenger" : "passengers"} confirmed</span><p><LockKeyhole size={15} />This receipt can’t be claimed again.</p>{modal.payment.journeyId && <small>{journeys.find(j => j.id === modal.payment.journeyId)?.origin} → {journeys.find(j => j.id === modal.payment.journeyId)?.destination}</small>}</div><button className="button button-primary full-width" onClick={() => setModal(null)}>Got it<Check size={17} /></button></>}
      {modal.kind === "scope" && <div className="scope-list"><button className={selectedJourneyId === "all" ? "selected" : ""} onClick={() => chooseJourney("all")}><Wallet size={21} /><span><strong>All payments</strong><small>Including unassigned receipts</small></span>{selectedJourneyId === "all" ? <Check size={18} /> : <ChevronRight size={18} />}</button>{journeys.map(j => <button key={j.id} className={selectedJourneyId === j.id ? "selected" : ""} onClick={() => chooseJourney(j.id)}><BusFront size={21} /><span><strong>{j.origin} → {j.destination}</strong><small>{j.endedAt ? "Completed · " + journeyDate(j) : "Current journey"}</small></span>{selectedJourneyId === j.id ? <Check size={18} /> : <ChevronRight size={18} />}</button>)}{!activeJourney && <button className="new-journey-option" onClick={() => open({ kind: "start" })}><Plus size={21} /><span><strong>Start a new journey</strong><small>Keep the next ride together</small></span><ArrowRight size={18} /></button>}</div>}
      {modal.kind === "help" && <><ol className="help-steps"><li><span>1</span><div><h3>Start your ride</h3><p>Choose the route and fare. New payments are linked to that journey.</p></div></li><li><span>2</span><div><h3>Find the right receipt</h3><p>Search a first name or transaction code. Passenger coverage uses the fare saved with each payment.</p></div></li><li><span>3</span><div><h3>Confirm the passengers</h3><p>Passenger counts are calculated from the amount and recorded fare. Confirm the group and lock the receipt. It can’t be claimed again.</p></div></li><li><span>4</span><div><h3>Close the journey</h3><p>Check the ride’s receipts, total received and confirmed passengers, then end the journey.</p></div></li></ol><div className="notice">This demo uses sample payments. Fare QR codes show a journey’s price; collecting money through M-Pesa needs a merchant connection.</div><button className="button button-primary full-width" onClick={() => setModal(null)}>Ready to go<ArrowRight size={17} /></button></>}
    </Dialog>}
  </div>;
}
