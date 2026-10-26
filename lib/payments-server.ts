import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { WINDOW_MS, amountToCents, coverageError, firstName, suggestedPassengers } from "./payment-types";
import type { Earnings, RideEarnings } from "./earnings-types";
import type { Journey, Payment } from "./payment-types";

export class PaymentError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export const json = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});

export function failure(error: unknown): Response {
  if (error instanceof PaymentError) return json({ error: error.message }, error.status);
  console.error("Payment operation failed", error);
  return json({ error: "We couldn’t reach your payments. Please try again." }, 500);
}

export async function owner(): Promise<string> {
  const user = await getChatGPTUser();
  if (user) return user.userId;
  if (import.meta.env.DEV) return "local-preview";
  throw new PaymentError("Please sign in to open your merchant workspace.", 401);
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new PaymentError("This request is not allowed.", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) throw new PaymentError("Send the payment details as JSON.", 415);
  const text = await request.text();
  if (text.length > 4096) throw new PaymentError("The payment details are too long.", 413);
  let body;
  try { body = JSON.parse(text); } catch { throw new PaymentError("The payment details are invalid."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new PaymentError("The payment details are invalid.");
  return body;
}

export function customerName(value: unknown): string {
  if (typeof value !== "string") throw new PaymentError("Enter the customer’s name.");
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw new PaymentError("Enter a customer name between 1 and 80 characters.");
  return name;
}

export function database(): D1Database {
  if (!env.DB) throw new Error("The payment database is not available.");
  return env.DB;
}

export function receiptCode(): string {
  return "DE" + crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

export async function seedDemo(ownerId: string) {
  const db = database();
  const exists = await db.prepare("SELECT owner_id FROM demo_sessions WHERE owner_id = ?").bind(ownerId).first();
  if (exists) return;
  const now = Date.now();
  const samples: [string, number, number, boolean][] = [
    ["Brian", 100, 0.5, false], ["Grace", 150, 1.5, false], ["Kevin", 100, 2.4, false],
    ["Wanjiku", 200, 3.2, true], ["Mercy", 50, 4.5, false], ["David", 100, 5.8, false],
    ["Faith", 500, 7.1, false], ["John", 150, 8.5, true], ["Amina", 100, 10, false],
    ["Peter", 250, 12, false], ["Sharon", 200, 14, true], ["Samuel", 50, 16, false],
    ["Joy", 100, 18, false], ["Dennis", 150, 20, false], ["Mary", 300, 23, true],
    ["James", 100, 26, false], ["Esther", 200, 28, false],
    ["Alice", 100, 34, true], ["Joseph", 150, 41, true], ["Sarah", 50, 49, false],
  ];
  const statements: D1PreparedStatement[] = [];
  for (const [customer, amount, minutes, verified] of samples) {
    const id = crypto.randomUUID();
    const receivedAt = now - Math.round(minutes * 60000);
    statements.push(db.prepare(`INSERT INTO payments (id, owner_id, receipt, customer, amount_cents, received_at)
      SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM demo_sessions WHERE owner_id = ?)`)
      .bind(id, ownerId, receiptCode(), customer, amount * 100, receivedAt, ownerId));
    if (verified) statements.push(db.prepare(`INSERT INTO claims (payment_id, customer, reference, verified_at)
      SELECT ?, ?, '', ? WHERE NOT EXISTS (SELECT 1 FROM demo_sessions WHERE owner_id = ?)`)
      .bind(id, customer, receivedAt + 10000, ownerId));
  }
  statements.push(db.prepare("INSERT INTO demo_sessions (owner_id, seeded_at) VALUES (?, ?) ON CONFLICT DO NOTHING").bind(ownerId, now));
  await db.batch(statements);
}

export async function listPayments(ownerId: string, journeyId: string | null = null): Promise<Payment[]> {
  const now = Date.now();
  const result = await database().prepare(`SELECT p.id, p.receipt, p.customer, p.amount_cents AS amountCents,
    p.received_at AS receivedAt, p.journey_id AS journeyId, p.fare_cents AS fareCents,
    c.customer AS claimedCustomer, c.reference, c.verified_at AS verifiedAt,
    c.passengers, c.fare_cents AS claimedFareCents,
    COALESCE((SELECT SUM(r.amount_cents) FROM refunds r WHERE r.payment_id = p.id),0) AS refundedCents,
    CASE WHEN c.reference LIKE 'combine:%' THEN (SELECT SUM(gp.amount_cents) FROM claims gc JOIN payments gp ON gp.id = gc.payment_id WHERE gc.reference = c.reference AND gp.owner_id = p.owner_id) END AS combinedTotalCents,
    CASE WHEN c.reference LIKE 'combine:%' THEN (SELECT SUM(gc.passengers) FROM claims gc JOIN payments gp ON gp.id = gc.payment_id WHERE gc.reference = c.reference AND gp.owner_id = p.owner_id) END AS combinedPassengers,
    CASE WHEN c.reference LIKE 'combine:%' THEN (SELECT GROUP_CONCAT(gp.receipt, ' + ') FROM claims gc JOIN payments gp ON gp.id = gc.payment_id WHERE gc.reference = c.reference AND gp.owner_id = p.owner_id) END AS combinedReceipts
    FROM payments p LEFT JOIN claims c ON c.payment_id = p.id
    WHERE p.owner_id = ? AND (
      (p.received_at > ? AND p.received_at <= ?) OR p.journey_id = ? OR p.id IN (
        SELECT c2.payment_id FROM claims c2 JOIN payments p2 ON p2.id = c2.payment_id
        WHERE p2.owner_id = ? ORDER BY c2.verified_at DESC LIMIT 500
      )
    ) ORDER BY p.received_at DESC`).bind(ownerId, now - WINDOW_MS, now, journeyId, ownerId).all<Payment>();
  return result.results.map(p => ({ ...p, customer: firstName(p.customer), claimedCustomer: p.claimedCustomer ? firstName(p.claimedCustomer) : null }));
}

export async function addDemoPayment(ownerId: string, body: Record<string, unknown>) {
  const customer = firstName(customerName(body.customer));
  const amountCents = typeof body.amount === "string" ? amountToCents(body.amount) : null;
  if (amountCents === null) throw new PaymentError("Enter an amount from KSh 0.01 to KSh 250,000, with up to two decimal places.");
  const id = crypto.randomUUID();
  if (body.journeyId) {
    if (typeof body.journeyId !== "string" || !/^[a-f0-9-]{36}$/.test(body.journeyId)) throw new PaymentError("Choose a valid journey.");
    const result = await database().prepare(`INSERT INTO payments (id, owner_id, receipt, customer, amount_cents, received_at, journey_id, fare_cents)
      SELECT ?, ?, ?, ?, ?, ?, id, fare_cents FROM journeys WHERE id = ? AND owner_id = ? AND ended_at IS NULL RETURNING id`)
      .bind(id, ownerId, receiptCode(), customer, amountCents, Date.now(), body.journeyId, ownerId).all();
    if (!result.results.length) throw new PaymentError("This journey has ended. Select the current journey before adding a payment.", 409);
  } else {
    await database().prepare("INSERT INTO payments (id, owner_id, receipt, customer, amount_cents, received_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, ownerId, receiptCode(), customer, amountCents, Date.now()).run();
  }
  return id;
}

export async function claimPayment(ownerId: string, id: string, body: Record<string, unknown>) {
  const payment = await database().prepare("SELECT p.customer, p.fare_cents AS fareCents, p.amount_cents AS amountCents, c.payment_id AS claimed, (SELECT COUNT(*) FROM refunds r WHERE r.payment_id = p.id) AS refunded FROM payments p LEFT JOIN claims c ON c.payment_id = p.id WHERE p.id = ? AND p.owner_id = ?")
    .bind(id, ownerId).first<{ customer: string; fareCents: number | null; amountCents: number; claimed: string | null; refunded: number }>();
  if (!payment) throw new PaymentError("This payment was not found.", 404);
  if (payment.refunded) throw new PaymentError("Refunded receipts cannot be confirmed or combined.", 409);
  if (payment.claimed) throw new PaymentError("This receipt is already verified and locked to a customer.", 409);
  const customer = firstName(payment.customer);
  const fareCents = payment.fareCents ?? (typeof body.fare === "string" ? amountToCents(body.fare) : null);
  const passengers = suggestedPassengers(payment.amountCents, fareCents);
  const invalid = coverageError(payment.amountCents, fareCents, passengers);
  if (invalid) throw new PaymentError(invalid, 422);
  const now = Date.now();
  const result = await database().prepare(`INSERT INTO claims (payment_id, customer, reference, verified_at, passengers, fare_cents)
    SELECT id, ?, '', ?, ?, ? FROM payments
    WHERE id = ? AND owner_id = ? AND received_at > ? AND received_at <= ?
    AND (COALESCE(fare_cents, ?) IS NULL OR amount_cents >= COALESCE(fare_cents, ?) * ?)
    AND NOT EXISTS (SELECT 1 FROM refunds r WHERE r.payment_id = payments.id)
    ON CONFLICT(payment_id) DO NOTHING RETURNING payment_id`)
    .bind(customer, now, passengers, fareCents, id, ownerId, now - WINDOW_MS, now, fareCents, fareCents, passengers).all();
  if (result.results.length) return;
  const existing = await database().prepare(`SELECT p.id, c.payment_id AS claimed, (SELECT COUNT(*) FROM refunds r WHERE r.payment_id = p.id) AS refunded FROM payments p
    LEFT JOIN claims c ON c.payment_id = p.id WHERE p.id = ? AND p.owner_id = ?`).bind(id, ownerId).first();
  if (!existing) throw new PaymentError("This payment was not found.", 404);
  if (existing.refunded) throw new PaymentError("Refunded receipts cannot be confirmed or combined.", 409);
  if (existing.claimed) throw new PaymentError("This receipt is already verified and locked to a customer.", 409);
  throw new PaymentError("This payment is outside the 30-minute window and can no longer be verified.", 410);
}

export async function listJourneys(ownerId: string): Promise<Journey[]> {
  const result = await database().prepare(`SELECT j.id, j.origin, j.destination, j.fare_cents AS fareCents,
    j.started_at AS startedAt, j.ended_at AS endedAt,
    COALESCE(SUM(p.amount_cents), 0) + j.cash_cents AS totalCents,
    COALESCE(SUM(p.amount_cents), 0) AS mpesaCents, j.cash_cents AS cashCents,
    COALESCE(SUM(CASE WHEN c.payment_id IS NOT NULL THEN p.amount_cents ELSE 0 END), 0) AS confirmedCents,
    COUNT(p.id) AS paymentCount, COUNT(c.payment_id) AS verifiedCount,
    COALESCE(SUM(c.passengers), 0) AS passengerCount
    FROM journeys j LEFT JOIN payments p ON p.journey_id = j.id LEFT JOIN claims c ON c.payment_id = p.id
    WHERE j.owner_id = ? GROUP BY j.id ORDER BY j.started_at DESC LIMIT 100`).bind(ownerId).all<Journey>();
  return result.results;
}

function routeName(value: unknown, label: string): string {
  if (typeof value !== "string") throw new PaymentError(`Enter the ${label}.`);
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) throw new PaymentError(`Keep the ${label} between 1 and 60 characters.`);
  return name;
}

export async function startJourney(ownerId: string, body: Record<string, unknown>) {
  const origin = routeName(body.origin, "starting point");
  const destination = routeName(body.destination, "destination");
  if (origin.toLocaleLowerCase() === destination.toLocaleLowerCase()) throw new PaymentError("Choose a different destination.");
  const fare = typeof body.fare === "string" ? amountToCents(body.fare) : null;
  if (!fare) throw new PaymentError("Enter a valid fare per passenger.");
  const id = crypto.randomUUID();
  const result = await database().prepare(`INSERT INTO journeys (id, owner_id, origin, destination, fare_cents, started_at)
    SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM journeys WHERE owner_id = ? AND ended_at IS NULL) RETURNING id`)
    .bind(id, ownerId, origin, destination, fare, Date.now(), ownerId).all();
  if (!result.results.length) throw new PaymentError("End the current journey before starting another one.", 409);
  return id;
}

export async function changeJourney(ownerId: string, id: string, body: Record<string, unknown>) {
  if (body.action === "end") {
    const cashCents = body.cash === undefined ? 0 : typeof body.cash === "string" ? amountToCents(body.cash || "0", true) : null;
    if (cashCents === null) throw new PaymentError("Enter cash received from KSh 0 to KSh 250,000, with up to two decimal places.", 422);
    const result = await database().prepare(`UPDATE journeys SET ended_at = ?, cash_cents = ?
      WHERE id = ? AND owner_id = ? AND ended_at IS NULL RETURNING id`)
      .bind(Date.now(), cashCents, id, ownerId).all();
    if (!result.results.length) throw new PaymentError("This journey has already ended or was not found.", 409);
    return;
  }
  if (body.action !== "fare") throw new PaymentError("Choose a valid journey action.");
  const fare = typeof body.fare === "string" ? amountToCents(body.fare) : null;
  if (!fare) throw new PaymentError("Enter a valid fare per passenger.");
  const result = await database().prepare("UPDATE journeys SET fare_cents = ? WHERE id = ? AND owner_id = ? AND ended_at IS NULL RETURNING id")
    .bind(fare, id, ownerId).all();
  if (!result.results.length) throw new PaymentError("Only an active journey’s fare can be changed.", 409);
}

// One statement locks both receipts atomically. Only the anchor contributes passengers.
export async function combinePayments(ownerId: string, body: Record<string, unknown>) {
  const ids = body.paymentIds;
  if (!Array.isArray(ids) || ids.length !== 2 || ids[0] === ids[1] || ids.some(id => typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id))) {
    throw new PaymentError("Select two different receipts from this customer.");
  }
  const now = Date.now();
  const found = await database().prepare(`SELECT p.id, p.customer, p.amount_cents AS amountCents,
    p.fare_cents AS fareCents, p.journey_id AS journeyId FROM payments p
    WHERE p.id IN (?, ?) AND p.owner_id = ? AND p.received_at > ? AND p.received_at <= ?
    AND NOT EXISTS (SELECT 1 FROM claims c WHERE c.payment_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM refunds r WHERE r.payment_id = p.id)`)
    .bind(ids[0], ids[1], ownerId, now - WINDOW_MS, now).all<{id: string; customer: string; amountCents: number; fareCents: number | null; journeyId: string | null}>();
  if (found.results.length !== 2) throw new PaymentError("Both receipts must be unverified, yours, and within the last 30 minutes.", 409);
  const [a, b] = found.results;
  if (a.journeyId !== b.journeyId || a.fareCents !== b.fareCents) throw new PaymentError("Combine receipts from the same journey and fare only.", 422);
  if (firstName(a.customer).toLocaleLowerCase() !== firstName(b.customer).toLocaleLowerCase()) throw new PaymentError("Choose receipts with the same customer first name, and confirm they belong to the same person.", 422);
  const fareCents = a.fareCents ?? (typeof body.fare === "string" ? amountToCents(body.fare) : null);
  const total = a.amountCents + b.amountCents;
  const passengers = suggestedPassengers(total, fareCents);
  const invalid = coverageError(total, fareCents, passengers);
  if (invalid) throw new PaymentError(invalid, 422);
  const reference = "combine:" + ids[0];
  const result = await database().prepare(`WITH eligible AS MATERIALIZED (
    SELECT p.id FROM payments p WHERE p.id IN (?, ?) AND p.owner_id = ?
    AND p.received_at > ? AND p.received_at <= ?
    AND NOT EXISTS (SELECT 1 FROM claims c WHERE c.payment_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM refunds r WHERE r.payment_id = p.id)
  ) INSERT INTO claims (payment_id, customer, reference, verified_at, passengers, fare_cents)
    SELECT id, ?, ?, ?, CASE WHEN id = ? THEN ? ELSE 0 END, ? FROM eligible
    WHERE (SELECT COUNT(*) FROM eligible) = 2 RETURNING payment_id`)
    .bind(ids[0], ids[1], ownerId, now - WINDOW_MS, now, firstName(a.customer), reference, now, ids[0], passengers, fareCents).all();
  if (result.results.length !== 2) throw new PaymentError("A receipt has already been claimed, refunded or expired. Refresh and choose again.", 409);
}

export async function simulateRide(ownerId: string, journeyId: string, body: Record<string, unknown>) {
  const { generateRideSamples } = await import("./ride-simulator");
  const journey = await database().prepare("SELECT fare_cents AS fareCents FROM journeys WHERE id = ? AND owner_id = ? AND ended_at IS NULL")
    .bind(journeyId, ownerId).first<{ fareCents: number }>();
  if (!journey) throw new PaymentError("Choose your active journey before generating passengers.", 409);
  let samples;
  try { samples = generateRideSamples(journey.fareCents, body.count as number); }
  catch (error) { throw new PaymentError(error instanceof Error ? error.message : "Choose a valid sample size.", 422); }
  const now = Date.now();
  const statements = samples.flatMap((sample, i) => sample.amounts.map((amountCents, part) => database().prepare(`INSERT INTO payments (id, owner_id, receipt, customer, amount_cents, received_at, journey_id, fare_cents)
    SELECT ?, ?, ?, ?, ?, ?, id, fare_cents FROM journeys
    WHERE id = ? AND owner_id = ? AND ended_at IS NULL AND fare_cents = ? RETURNING id`)
    .bind(crypto.randomUUID(), ownerId, receiptCode(), sample.customer, amountCents, now - (samples.length - i) * 2000 + part * 500, journeyId, ownerId, journey.fareCents)));
  const results = await database().batch(statements);
  if (results.some(result => result.results.length !== 1)) throw new PaymentError("The ride ended or fare changed. Refresh and try generating again.", 409);
  return {
    customers: samples.length,
    passengers: samples.reduce((sum, sample) => sum + sample.passengers, 0),
    receipts: statements.length,
    exact: samples.filter(s => s.kind === "exact").length,
    underpaid: samples.filter(s => s.kind === "underpaid").length,
    topups: samples.filter(s => s.kind === "topup").length,
    groups: samples.filter(s => s.kind === "group").length,
  };
}

export async function earningsReport(ownerId: string, from: string, to: string) {
  const { earningsBounds } = await import("./earnings-types");
  let bounds;
  try { bounds = earningsBounds(from, to); }
  catch (error) { throw new PaymentError(error instanceof Error ? error.message : "Choose a valid date range.", 422); }
  const totalsStatement = database().prepare(`WITH movements AS (
    SELECT p.journey_id, p.amount_cents AS receivedCents, 0 AS refundedCents,
      CASE WHEN c.payment_id IS NOT NULL THEN p.amount_cents ELSE 0 END AS confirmedCents,
      CASE WHEN c.payment_id IS NULL THEN p.amount_cents ELSE 0 END AS unverifiedCents, 1 AS receipts, 0 AS cashCents
      FROM payments p LEFT JOIN claims c ON c.payment_id = p.id
      WHERE p.owner_id = ? AND p.received_at >= ? AND p.received_at < ?
    UNION ALL
    SELECT p.journey_id, 0, r.amount_cents, 0, 0, 0, 0 FROM refunds r JOIN payments p ON p.id = r.payment_id
      WHERE p.owner_id = ? AND r.refunded_at >= ? AND r.refunded_at < ?
    UNION ALL
    SELECT j.id, j.cash_cents, 0, 0, 0, 0, j.cash_cents FROM journeys j
      WHERE j.owner_id = ? AND j.ended_at >= ? AND j.ended_at < ? AND j.cash_cents > 0
  )
    SELECT COALESCE(SUM(receivedCents),0) AS receivedCents,
      COALESCE(SUM(cashCents),0) AS cashCents,
      COALESCE(SUM(refundedCents),0) AS refundedCents,
      COALESCE(SUM(receivedCents - refundedCents),0) AS netCents,
      COALESCE(SUM(confirmedCents),0) AS confirmedCents,
      COALESCE(SUM(unverifiedCents),0) AS unverifiedCents,
      COALESCE(SUM(CASE WHEN journey_id IS NULL THEN receivedCents ELSE 0 END),0) AS unassignedCents,
      COALESCE(SUM(receipts),0) AS receipts, COUNT(DISTINCT journey_id) AS rideCount FROM movements`)
    .bind(ownerId, bounds.start, bounds.end, ownerId, bounds.start, bounds.end, ownerId, bounds.start, bounds.end);
  const ridesStatement = database().prepare(`WITH movements AS (
    SELECT p.journey_id, p.amount_cents AS receivedCents, 0 AS refundedCents,
      CASE WHEN c.payment_id IS NOT NULL THEN p.amount_cents ELSE 0 END AS confirmedCents,
      CASE WHEN c.payment_id IS NULL THEN p.amount_cents ELSE 0 END AS unverifiedCents, 1 AS receipts, 0 AS cashCents
      FROM payments p LEFT JOIN claims c ON c.payment_id = p.id
      WHERE p.owner_id = ? AND p.received_at >= ? AND p.received_at < ?
    UNION ALL
    SELECT p.journey_id, 0, r.amount_cents, 0, 0, 0, 0 FROM refunds r JOIN payments p ON p.id = r.payment_id
      WHERE p.owner_id = ? AND r.refunded_at >= ? AND r.refunded_at < ?
    UNION ALL
    SELECT j.id, j.cash_cents, 0, 0, 0, 0, j.cash_cents FROM journeys j
      WHERE j.owner_id = ? AND j.ended_at >= ? AND j.ended_at < ? AND j.cash_cents > 0
  )
    SELECT j.id, j.origin, j.destination, j.started_at AS startedAt, j.ended_at AS endedAt,
      SUM(m.receivedCents) AS receivedCents, SUM(m.cashCents) AS cashCents, SUM(m.refundedCents) AS refundedCents,
      SUM(m.receivedCents - m.refundedCents) AS netCents, SUM(m.confirmedCents) AS confirmedCents,
      SUM(m.receipts) AS receipts FROM movements m JOIN journeys j ON j.id = m.journey_id
      WHERE j.owner_id = ? GROUP BY j.id ORDER BY netCents DESC, j.started_at DESC, j.id LIMIT 100`)
    .bind(ownerId, bounds.start, bounds.end, ownerId, bounds.start, bounds.end, ownerId, bounds.start, bounds.end, ownerId);
  const [totals, rides] = await database().batch([totalsStatement, ridesStatement]);
  return { from, to, ...(totals.results[0] as Omit<Earnings, "from" | "to" | "rides">), rides: rides.results as RideEarnings[] };
}

export async function recordRefund(ownerId: string, paymentId: string, body: Record<string, unknown>) {
  const amountCents = typeof body.amount === "string" ? amountToCents(body.amount) : null;
  const requestId = body.requestId;
  if (!amountCents) throw new PaymentError("Enter a valid refund amount.", 422);
  if (typeof requestId !== "string" || !/^[a-f0-9-]{36}$/.test(requestId)) throw new PaymentError("Reopen the refund form and try again.");
  const existing = await database().prepare(`SELECT r.payment_id, r.amount_cents, p.owner_id FROM refunds r JOIN payments p ON p.id = r.payment_id WHERE r.id = ?`)
    .bind(requestId).first<{ payment_id: string; amount_cents: number; owner_id: string }>();
  if (existing) {
    if (existing.owner_id === ownerId && existing.payment_id === paymentId && existing.amount_cents === amountCents) return;
    throw new PaymentError("This refund request has already been used. Reopen the refund form.", 409);
  }
  const result = await database().prepare(`INSERT INTO refunds (id, payment_id, amount_cents, refunded_at)
    SELECT ?, id, ?, ? FROM payments WHERE id = ? AND owner_id = ?
    AND ? <= amount_cents - COALESCE((SELECT SUM(r.amount_cents) FROM refunds r WHERE r.payment_id = payments.id),0)
    ON CONFLICT(id) DO NOTHING RETURNING id`)
    .bind(requestId, amountCents, Date.now(), paymentId, ownerId, amountCents).all();
  if (result.results.length) return;
  const retry = await database().prepare(`SELECT r.id FROM refunds r JOIN payments p ON p.id = r.payment_id WHERE r.id = ? AND p.owner_id = ? AND r.payment_id = ? AND r.amount_cents = ?`)
    .bind(requestId, ownerId, paymentId, amountCents).first();
  if (retry) return;
  throw new PaymentError("The receipt was not found or the refund exceeds its remaining refundable amount. Refresh and try again.", 409);
}
