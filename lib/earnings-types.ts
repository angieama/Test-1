export type EarningsRange = { from: string; to: string };
export type RideEarnings = { id: string; origin: string; destination: string; startedAt: number; endedAt: number | null; receivedCents: number; cashCents: number; refundedCents: number; netCents: number; confirmedCents: number; receipts: number };
export type Earnings = { from: string; to: string; receivedCents: number; cashCents: number; refundedCents: number; netCents: number; confirmedCents: number; unverifiedCents: number; unassignedCents: number; receipts: number; rideCount: number; rides: RideEarnings[] };
const DAY = 86400000;
export function earningsPreset(period: "today" | "week" | "month" | "all", now = Date.now()): EarningsRange {
  const local = new Date(now + 3 * 3600000);
  const to = local.toISOString().slice(0, 10);
  if (period === "all") return { from: "1970-01-01", to };
  if (period === "week") local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  if (period === "month") local.setUTCDate(1);
  return { from: local.toISOString().slice(0, 10), to };
}
export function earningsBounds(from: string, to: string) {
  for (const value of [from, to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + "T00:00:00Z")) || new Date(value + "T00:00:00Z").toISOString().slice(0,10) !== value || value < "1970-01-01" || value > "9998-12-31") throw new Error("Choose valid start and end dates.");
  }
  if (from > to) throw new Error("The end date must be on or after the start date.");
  return { start: Date.parse(from + "T00:00:00+03:00"), end: Date.parse(to + "T00:00:00+03:00") + DAY };
}
