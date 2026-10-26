import { combinePayments, failure, json, owner, readBody } from "@/lib/payments-server";

export async function POST(request: Request) {
  try {
    await combinePayments(await owner(), await readBody(request));
    return json({ verified: true });
  } catch (error) { return failure(error); }
}
