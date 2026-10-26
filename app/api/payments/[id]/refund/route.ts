import { failure, json, owner, readBody, recordRefund } from "@/lib/payments-server";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await owner(); const { id } = await context.params;
    await recordRefund(ownerId, id, await readBody(request));
    return json({ refunded: true, mode: "demo-record" });
  } catch (error) { return failure(error); }
}
