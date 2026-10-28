"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, ChevronDown, RefreshCw, Send, Sparkles } from "lucide-react";
import { requestJson } from "@/lib/client-api";
import { answerAnalysis, questionRange, type AnalysisAnswer, type AnalysisSnapshot } from "@/lib/analysis";
import { earningsBounds, earningsPreset, type EarningsRange } from "@/lib/earnings-types";
import { money, type Journey } from "@/lib/payment-types";

type Reply = { question: string; answer: AnalysisAnswer; snapshot: AnalysisSnapshot };
const suggestions = ["How much did I make?", "Which ride earned most?", "Any underpayments?", "How many passengers?", "Cash and refunds"];
export default function AnalysisAssistant({ journeys }: { journeys: Journey[] }) {
  const [range, setRange] = useState<EarningsRange>(() => earningsPreset("today"));
  const [from, setFrom] = useState(range.from), [to, setTo] = useState(range.to);
  const [ride, setRide] = useState("");
  const [question, setQuestion] = useState("");
  const [replies, setReplies] = useState<Reply[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => () => { sequence.current++; request.current?.abort(); }, []);
  useEffect(() => { if (replies.length) end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [replies]);
  function selectRange(next: EarningsRange) { setRange(next); setFrom(next.from); setTo(next.to); setError(""); }
  async function ask(text: string) {
    const trimmed = text.trim(); if (!trimmed || busy) return;
    let dates: EarningsRange;
    try { dates = questionRange(trimmed, { from, to }, Date.now()); earningsBounds(dates.from, dates.to); }
    catch (e) { setError(e instanceof Error ? e.message : "Choose valid dates."); return; }
    selectRange(dates); setBusy(true); setError("");
    const seq = ++sequence.current; request.current?.abort(); const controller = new AbortController(); request.current = controller;
    try {
      const params = new URLSearchParams({ ...dates, ...(ride ? { journey: ride } : {}) });
      const snapshot = await requestJson<AnalysisSnapshot>("/api/analysis?" + params, { signal: controller.signal });
      if (seq !== sequence.current) return;
      setReplies(prev => [...prev.slice(-19), { question: trimmed, answer: answerAnalysis(trimmed, snapshot), snapshot }]); setQuestion("");
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Couldn’t load analysis. Try again."); }
    finally { if (seq === sequence.current) setBusy(false); }
  }
  function submit(e: FormEvent) { e.preventDefault(); void ask(question); }
  return <section className="analyst" aria-label="AI analysis assistant">
    <div className="analyst-intro"><span className="analyst-avatar"><Bot size={25} /></span><div><strong>Your ride analyst</strong><p>Ask about collections, passengers and payments.</p></div><span className="analyst-badge">PROTOTYPE</span></div>
    <p className="analyst-disclosure">Local analysis demo · Answers are calculated from saved records. A live AI model is not connected. No data is sent to an AI service.</p>
    <details className="analyst-filters" open><summary>Choose a period and ride<ChevronDown size={15} /></summary><div className="analyst-presets">{([['today','Today'],['week','This week'],['month','This month'],['all','All time']] as const).map(([key,label]) => <button key={key} disabled={busy} type="button" aria-pressed={JSON.stringify(range) === JSON.stringify(earningsPreset(key))} onClick={() => selectRange(earningsPreset(key))}>{label}</button>)}</div>
      <div className="analyst-dates"><label>From<input aria-label="Analysis from date" type="date" value={from} disabled={busy} onChange={e => setFrom(e.target.value)} /></label><label>To<input aria-label="Analysis to date" type="date" value={to} disabled={busy} onChange={e => setTo(e.target.value)} /></label><button disabled={busy} type="button" onClick={() => { try { earningsBounds(from,to); selectRange({from,to}); } catch(e) { setError(e instanceof Error ? e.message : "Choose valid dates."); } }}>Apply</button></div>
      <label className="analyst-ride">Ride<select aria-label="Ride to analyse" value={ride} disabled={busy} onChange={e => setRide(e.target.value)}><option value="">All rides</option>{journeys.map(j => <option key={j.id} value={j.id}>{j.origin} → {j.destination} · {new Intl.DateTimeFormat("en-KE",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Africa/Nairobi"}).format(j.startedAt)}</option>)}</select></label><p className="analyst-period">{range.from} → {range.to} · Kenya time</p>
    </details>
    <div className="analyst-suggestions" aria-label="Suggested analysis questions">{suggestions.map(text => <button key={text} disabled={busy} onClick={() => void ask(text)}><Sparkles size={13} />{text}</button>)}</div>
    {!replies.length && <div className="analyst-welcome"><Bot size={28} /><h2>What would you like to know?</h2><p>Try “How much did I make this week?” or use a question above. I check the full stored ledger, including older rides.</p></div>}
    <div className="analyst-conversation" role="log" aria-label="Analysis conversation" aria-live="polite" aria-relevant="additions">{replies.map((reply,index) => <div key={index} className="analyst-turn"><p className="analyst-question"><span>You</span>{reply.question}</p><article className="analyst-answer"><div className="analyst-answer-heading"><Bot size={18} /><h2>{reply.answer.title}</h2></div>{reply.answer.paragraphs.map((paragraph,i) => <p key={i}>{paragraph}</p>)}{reply.answer.showRides && reply.snapshot.rides.slice(0,3).map((r,i) => <div className="analyst-rank" key={r.id}><span>{i+1}</span><div><strong>{r.origin} → {r.destination}</strong><small>{new Intl.DateTimeFormat("en-KE",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Africa/Nairobi"}).format(r.startedAt)} · {r.receipts} receipts</small></div><b>KSh {money(r.netCents)}</b></div>)}<footer>{reply.snapshot.scope} · {reply.snapshot.from} → {reply.snapshot.to}<br />Checked {new Intl.DateTimeFormat("en-KE",{hour:"2-digit",minute:"2-digit",timeZone:"Africa/Nairobi"}).format(reply.snapshot.generatedAt)} EAT · Snapshot of saved records</footer></article></div>)}</div>
    {busy && <p className="analyst-loading" role="status"><RefreshCw size={16} className="spin" />Checking your saved records…</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <form className="analyst-composer" onSubmit={submit}><label className="sr-only" htmlFor="analysis-question">Ask about your business</label><input id="analysis-question" value={question} maxLength={500} placeholder="Ask about your rides…" autoComplete="off" disabled={busy} onChange={e => setQuestion(e.target.value)} /><button type="submit" aria-label="Send analysis question" disabled={busy || !question.trim()}><Send size={19} /></button><small>Read-only answers · No payments or rides are changed</small></form><div ref={end} />
  </section>;
}
