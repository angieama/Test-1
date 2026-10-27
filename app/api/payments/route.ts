import { addDemoPayment, failure, json, listJourneys, listPayments, listSavedRoutes, owner, readBody, seedDemo } from "@/lib/payments-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ownerId = await owner();
    await seedDemo(ownerId);
    const journeyId = new URL(request.url).searchParams.get("journey");
    const [payments, journeys, routes] = await Promise.all([listPayments(ownerId, journeyId), listJourneys(ownerId), listSavedRoutes(ownerId)]);
    return json({ payments, journeys, routes, serverTime: Date.now(), demo: true });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const ownerId = await owner();
    const body = await readBody(request);
    await seedDemo(ownerId);
    const id = await addDemoPayment(ownerId, body);
    return json({ id }, 201);
  } catch (error) { return failure(error); }
}
