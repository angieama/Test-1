import { earningsBounds, earningsPreset, type EarningsRange, type RideEarnings } from "./earnings-types.ts";
import { WINDOW_MS, money, type Journey } from "./payment-types.ts";

export type AnalysisPayment = { id: string; journeyId: string | null; fareCents: number | null; amountCents: number; receivedAt: number; verifiedAt: number | null; passengers: number | null; refundedCents: number };
export type AnalysisRefund = { journeyId: string | null; amountCents: number; refundedAt: number };
export type AnalysisSnapshot = EarningsRange & {
  generatedAt: number; scope: string; receivedCents: number; cashCents: number; refundedCents: number; netCents: number;
  receipts: number; unverifiedReceipts: number; unverifiedCents: number; confirmedPassengers: number; groupPayments: number;
  underpaidReceipts: number; shortfallCents: number; recentUnderpaidReceipts: number; unassignedCents: number; rides: RideEarnings[];
};

/** Aggregate the full stored ledger, independently of the recent-payment feed. Never return customer identities. */
export function buildAnalysis(payments: AnalysisPayment[], journeys: Journey[], refunds: AnalysisRefund[], from: string, to: string, now: number, journeyId: string | null = null): AnalysisSnapshot {
  const { start, end } = earningsBounds(from, to);
  const selected = journeyId ? journeys.find(j => j.id === journeyId) : null;
  if (journeyId && !selected) throw new Error("Choose an existing ride.");
  const result: AnalysisSnapshot = { from, to, generatedAt: now, scope: selected ? `${selected.origin} → ${selected.destination}` : "All rides", receivedCents: 0, cashCents: 0, refundedCents: 0, netCents: 0, receipts: 0, unverifiedReceipts: 0, unverifiedCents: 0, confirmedPassengers: 0, groupPayments: 0, underpaidReceipts: 0, shortfallCents: 0, recentUnderpaidReceipts: 0, unassignedCents: 0, rides: [] };
  const inside = (time: number) => time >= start && time < end;
  const inScope = (id: string | null) => !journeyId || id === journeyId;
  const known = new Map(journeys.map(j => [j.id, j]));
  const rows = new Map<string, RideEarnings>();
  const ride = (id: string | null) => {
    if (!id || !known.has(id)) return null;
    if (!rows.has(id)) { const j = known.get(id)!; rows.set(id, { id, origin: j.origin, destination: j.destination, startedAt: j.startedAt, endedAt: j.endedAt, receivedCents: 0, cashCents: 0, refundedCents: 0, netCents: 0, confirmedCents: 0, receipts: 0 }); }
    return rows.get(id)!;
  };
  for (const p of payments.filter(p => inside(p.receivedAt) && inScope(p.journeyId))) {
    result.receivedCents += p.amountCents; result.receipts++;
    if (p.verifiedAt !== null) result.confirmedPassengers += p.passengers ?? 0;
    else { result.unverifiedReceipts++; result.unverifiedCents += p.amountCents; }
    if (p.fareCents && p.amountCents >= p.fareCents * 2) result.groupPayments++;
    if (p.verifiedAt === null && p.refundedCents === 0 && p.fareCents && p.amountCents < p.fareCents) {
      result.underpaidReceipts++; result.shortfallCents += p.fareCents - p.amountCents;
      if (p.receivedAt > now - WINDOW_MS && p.receivedAt <= now) result.recentUnderpaidReceipts++;
    }
    const row = ride(p.journeyId);
    if (row) { row.receivedCents += p.amountCents; row.receipts++; if (p.verifiedAt !== null) row.confirmedCents += p.amountCents; }
    else result.unassignedCents += p.amountCents;
  }
  for (const r of refunds.filter(r => inside(r.refundedAt) && inScope(r.journeyId))) { result.refundedCents += r.amountCents; const row = ride(r.journeyId); if (row) row.refundedCents += r.amountCents; }
  for (const j of journeys.filter(j => j.endedAt !== null && inside(j.endedAt) && inScope(j.id) && j.cashCents > 0)) { result.receivedCents += j.cashCents; result.cashCents += j.cashCents; const row = ride(j.id)!; row.receivedCents += j.cashCents; row.cashCents += j.cashCents; }
  result.netCents = result.receivedCents - result.refundedCents;
  result.rides = [...rows.values()].map(r => ({ ...r, netCents: r.receivedCents - r.refundedCents })).sort((a,b) => b.netCents - a.netCents || b.startedAt - a.startedAt || a.id.localeCompare(b.id));
  return result;
}

/** Explicit date phrases override the visible range; every reply carries its actual scope. */
export function questionRange(question: string, fallback: EarningsRange, now: number): EarningsRange {
  const q = question.toLowerCase();
  const dates = q.match(/\b\d{4}-\d{2}-\d{2}\b/g);
  if (dates?.length) { const range = { from: dates[0], to: dates[1] ?? dates[0] }; earningsBounds(range.from, range.to); return range; }
  const day = 86400000;
  const today = earningsPreset("today", now).to;
  const dayBefore = (date: string) => new Date(Date.parse(date + "T00:00:00Z") - day).toISOString().slice(0,10);
  if (/\blast week\b/.test(q)) {
    const from = earningsPreset("week", now - 7 * day).from;
    return { from, to: dayBefore(earningsPreset("week", now).from) };
  }
  if (/\blast month\b/.test(q)) { const end = dayBefore(earningsPreset("month", now).from); return { from: end.slice(0,8) + "01", to: end }; }
  const trailing = q.match(/\blast (\d{1,4}) days?\b/);
  if (trailing) { const days = Number(trailing[1]); if (days < 1 || days > 3660) throw new Error("Choose between 1 and 3660 days, or use the date filters."); return { from: earningsPreset("today", now - (days - 1) * day).from, to: today }; }
  if (/\blast year\b|\bthis year\b/.test(q)) throw new Error("Use the date filters to choose that year.");
  if (/\ball time\b|\beverything\b/.test(q)) return earningsPreset("all", now);
  if (/\byesterday\b/.test(q)) return earningsPreset("today", now - 86400000);
  if (/\btoday\b/.test(q)) return earningsPreset("today", now);
  if (/\bthis week\b/.test(q)) return earningsPreset("week", now);
  if (/\bthis month\b/.test(q)) return earningsPreset("month", now);
  return fallback;
}
export type AnalysisAnswer = { title: string; paragraphs: string[]; showRides?: boolean };
export function answerAnalysis(question: string, s: AnalysisSnapshot): AnalysisAnswer {
  const q = question.trim().toLowerCase();
  if (/\b(delete|remove|refund this|verify this|change fare|send money|transfer)\b/.test(q)) return { title: "I can help you review the records", paragraphs: ["This assistant is read-only. Use the payment or journey screens to make a change after checking the details."] };
  if (/\b(predict|forecast|tomorrow|profit|fuel|expenses)\b/.test(q)) return { title: "That needs more information", paragraphs: ["I can report recorded collections, but I cannot predict future revenue or calculate profit without costs. Try asking about earnings, ride rankings, passengers or underpayments in the selected period."] };
  if (/\b(underpa\w*|shortfall\w*|short\b|top.?up\w*|missing|warnings?)\b/.test(q)) return { title: "Payments needing attention", paragraphs: [s.underpaidReceipts ? `${s.underpaidReceipts} unverified, unrefunded receipts are below one fare. Together they need KSh ${money(s.shortfallCents)} to cover one passenger each.` : "No unverified, unrefunded receipts below one fare were found in this range.", `${s.recentUnderpaidReceipts} of these receipts are still within the 30-minute verification window. Earlier records remain in history.`, "This is a receipt-level shortfall, not proof of lost income. Two receipts may belong to one passenger. Check both transaction codes and combine an eligible top-up before confirming."] };
  if (/\b(passengers?|people|groups?|seats?|persons?)\b/.test(q)) return { title: "Passenger coverage", paragraphs: [`${s.confirmedPassengers} M-Pesa passengers are confirmed across ${s.receipts} receipts in this period. Split-payment passenger totals are counted once.`, `${s.groupPayments} receipts originally covered at least two fares at their saved fare rate. This is not a count of unique customers.`, "Cash does not create passenger confirmations. Refunds preserve the original confirmed passenger count, so this is not a current occupancy count."] };
  if (/\b(unverified|verified|verification|pending|unchecked)\b/.test(q)) return { title: "Verification check", paragraphs: [`${s.unverifiedReceipts} receipts totalling KSh ${money(s.unverifiedCents)} remain unverified in this range.`, "Unverified money is included in received collections. Verification eligibility still depends on the original 30-minute window and refund status."] };
  if (/\b(cash|refunds?|reversals?|mpesa|m-pesa)\b/.test(q)) return { title: "Cash and refund breakdown", paragraphs: [`M-Pesa received: KSh ${money(s.receivedCents - s.cashCents)}. Closing cash: KSh ${money(s.cashCents)}. Refunds recorded: KSh ${money(s.refundedCents)}.`, `Net collections are KSh ${money(s.netCents)}. Cash uses the ride closing date; refunds use their recorded date, even for an older payment.`, "These are sample ledger records. The app does not transfer money or perform live M-Pesa refunds."] };
  if (/\b(best|top|most|rank\w*|rides?|journeys?|routes?)\b/.test(q)) return { title: "Your highest earning rides", paragraphs: s.rides.length ? [`The highest net collections are KSh ${money(s.rides[0].netCents)} on ${s.rides[0].origin} → ${s.rides[0].destination}.`, "These are individual ride sessions, ranked by money received minus refunds in the chosen period. Sessions on the same route stay separate. Expenses are not included."] : ["No ride activity was recorded in this range. Try a wider period or another ride."], showRides: true };
  if (/how much|\b(earn\w*|made|make|money|sales|revenue|income|collect\w*|received|total|summary|overview|doing|analysis)\b/.test(q)) return { title: "Your collections at a glance", paragraphs: [`You received KSh ${money(s.receivedCents)} and recorded KSh ${money(s.refundedCents)} in refunds. Net collections: KSh ${money(s.netCents)}.`, `${s.receipts} ${s.receipts === 1 ? "receipt" : "receipts"} and ${s.rides.length} ${s.rides.length === 1 ? "ride" : "rides"} contributed activity. M-Pesa: KSh ${money(s.receivedCents - s.cashCents)}. Cash: KSh ${money(s.cashCents)}.`, s.unassignedCents ? `KSh ${money(s.unassignedCents)} has no ride assigned. It is included in totals and excluded from ride rankings.` : "Each receipt is counted once, including partial payments and top-ups. Net collections are not profit."] };
  return { title: "Let’s look at your ride records", paragraphs: ["I can answer questions about recorded earnings, top rides, cash, refunds, confirmed passengers and underpayments. Try “How much did I make?” or “Which ride earned most?”", "For a specific ride, choose it above. Select a date range, or include today, yesterday, this week, this month, all time, or YYYY-MM-DD dates in your question. This prototype uses local calculations, not a connected AI model."] };
}
