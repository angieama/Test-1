import QRCode from "qrcode";
import { database, failure, json, owner, PaymentError, readBody } from "@/lib/payments-server";
import { money } from "@/lib/payment-types";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await owner();
    const { id } = await context.params;
    const body = await readBody(request);
    const passengers = body.passengers;
    if (typeof passengers !== "number" || !Number.isSafeInteger(passengers) || passengers < 1 || passengers > 25000000) throw new PaymentError("Enter a valid whole passenger count.");
    const journey = await database().prepare("SELECT origin, destination FROM journeys WHERE id = ? AND owner_id = ? AND ended_at IS NULL")
      .bind(id, ownerId).first<{ origin: string; destination: string }>();
    if (!journey) throw new PaymentError("Start a journey before creating its fare QR.", 409);
    const qrId = crypto.randomUUID();
    const result = await database().prepare(`INSERT INTO fare_requests (id, owner_id, journey_id, fare_cents, passengers, amount_cents, created_at)
      SELECT ?, ?, id, fare_cents, ?, fare_cents * ?, ? FROM journeys
      WHERE id = ? AND owner_id = ? AND ended_at IS NULL AND fare_cents * ? <= 25000000
      RETURNING fare_cents AS fareCents, amount_cents AS amountCents`)
      .bind(qrId, ownerId, passengers, passengers, Date.now(), id, ownerId, passengers).first<{ fareCents: number; amountCents: number }>();
    if (!result) throw new PaymentError("The journey has ended or the total exceeds KSh 250,000.", 409);
    const payload = [
      "LipaVerify FARE PREVIEW — not an M-Pesa payment QR",
      `${journey.origin} -> ${journey.destination}`,
      `Fare per person: KSh ${money(result.fareCents)}`,
      `Passengers: ${passengers}`,
      `Total: KSh ${money(result.amountCents)}`,
      `Journey: ${id}`,
      `Request: ${qrId}`,
    ].join("\n");
    const svg = await QRCode.toString(payload, { type: "svg", errorCorrectionLevel: "M", margin: 3, width: 360, color: { dark: "#124b34", light: "#ffffff" } });
    return json({ id: qrId, journeyId: id, fareCents: result.fareCents, amountCents: result.amountCents, passengers, svg, payload, mode: "preview" }, 201);
  } catch (error) { return failure(error); }
}
