import { failure, json, owner, readBody, saveRoute } from "@/lib/payments-server";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; return json({ id: await saveRoute(await owner(), await readBody(request), id) }); }
  catch (error) { return failure(error); }
}
