export type Ride = {
 id: string; route: string; fare: number; started_at: number; ended_at: number | null; active_slot: number | null;
 mpesa_total: number; mpesa_count: number; cash_total: number; cash_passengers: number; cash_count: number;
};
export type RideEntry = { id: string; kind: 'mpesa' | 'cash'; amount: number; occurred_at: number; customer: string | null; reference: string | null; passengers: number | null };
export const rideTotal = (ride: Ride) => ride.mpesa_total + ride.cash_total;
export function parseCashAmount(value: string): number | null {
 if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
 const cents = Math.round(Number(value) * 100);
 return Number.isSafeInteger(cents) && cents > 0 && cents <= 25_000_000 ? cents : null;
}
