import { failure, json, listJourneys, owner, readBody, startJourney } from "@/lib/payments-server";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return json({ journeys: await listJourneys(await owner()) }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try { const ownerId = await owner(); return json({ id: await startJourney(ownerId, await readBody(request)) }, 201); }
  catch (error) { return failure(error); }
}
