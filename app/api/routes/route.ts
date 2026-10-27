import { failure, json, listSavedRoutes, owner, readBody, saveRoute } from "@/lib/payments-server";
export async function GET() {
  try { return json({ routes: await listSavedRoutes(await owner()) }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try { return json({ id: await saveRoute(await owner(), await readBody(request)) }, 201); }
  catch (error) { return failure(error); }
}
