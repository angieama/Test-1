import { claimPayment, failure, json, owner, readBody } from "@/lib/payments-server";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await owner();
    const { id } = await context.params;
    if (!/^[a-f0-9-]{36}$/.test(id)) return json({ error: "This payment was not found." }, 404);
    await claimPayment(ownerId, id, await readBody(request));
    return json({ verified: true });
  } catch (error) { return failure(error); }
}
