import { earningsReport, failure, json, owner } from "@/lib/payments-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const ownerId = await owner();
    const query = new URL(request.url).searchParams;
    return json(await earningsReport(ownerId, query.get("from") ?? "", query.get("to") ?? ""));
  } catch (error) { return failure(error); }
}
