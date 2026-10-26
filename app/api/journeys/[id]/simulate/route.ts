import { failure, json, owner, readBody, simulateRide } from "@/lib/payments-server";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await owner();
    const { id } = await context.params;
    return json(await simulateRide(ownerId, id, await readBody(request)), 201);
  } catch (error) { return failure(error); }
}
