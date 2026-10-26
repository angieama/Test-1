import { changeJourney, failure, json, owner, readBody } from "@/lib/payments-server";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const ownerId = await owner(); const { id } = await context.params; await changeJourney(ownerId, id, await readBody(request)); return json({ saved: true }); }
  catch (error) { return failure(error); }
}
