import { analysisReport, failure, json, owner } from "@/lib/payments-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const ownerId = await owner();
    const query = new URL(request.url).searchParams;
    return json(await analysisReport(ownerId, query.get("from") ?? "", query.get("to") ?? "", query.get("journey")));
  } catch (error) { return failure(error); }
}
