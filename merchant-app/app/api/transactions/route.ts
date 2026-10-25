import { database, seed, json, WINDOW } from '../../../lib/payments';
import { PAYMENT_QUERY, SUMMARY_QUERY } from '../../../lib/payment-queries';
import { RIDE_SUMMARY_QUERY } from '../../../lib/ride-queries';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await seed();
    const db = database();
    const now = Date.now();
    const cutoff = now - WINDOW;
    const [rows, summary, rides] = await db.batch([
      db.prepare(PAYMENT_QUERY).bind(cutoff, cutoff),
      db.prepare(SUMMARY_QUERY).bind(cutoff),
      db.prepare(RIDE_SUMMARY_QUERY).bind(20,0),
    ]);
    return json({ payments: rows.results, summary: summary.results[0], serverTime: now, demo: true, rides: rides.results });
  } catch {
    return json({ error: 'Could not load payments. Please try again.' }, 503);
  }
}
