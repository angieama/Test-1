export type Payment = {
  receipt: string; name: string; phone: string; amount: number;
  received_at: number; claimed_at: number | null; claimed_for: string | null; ride_id: string | null;
};
export const WINDOW = 30 * 60 * 1000;
const currency = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 2 });
const clock = new Intl.DateTimeFormat('en-KE', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });
export const money = (cents: number) => currency.format(cents / 100);
export function elapsed(time: number, now: number) {
  const age = Math.max(0, now - time);
  return age < 60_000 ? 'Just now' : age < 3_600_000 ? `${Math.floor(age / 60_000)} min ago` : clock.format(time);
}
// Wake only when a visible age label changes, a payment arrives, or the rolling window expires.
export function nextPaymentUpdateAt(payments: readonly Payment[], now: number): number | null {
  let next = Infinity;
  for (const payment of payments) {
    const received = payment.received_at;
    if (received > now) next = Math.min(next, received);
    else if (now - received < 3_600_000) next = Math.min(next, received + (Math.floor((now - received) / 60_000) + 1) * 60_000);
    const expiry = received + WINDOW + 1;
    if (expiry > now) next = Math.min(next, expiry);
  }
  return Number.isFinite(next) ? next : null;
}
export function indexPaymentSearch(payments: readonly Payment[]) {
  return new Map(payments.map(payment => [payment.receipt, `${payment.name} ${payment.receipt} ${payment.claimed_for ?? ''}`.toLowerCase()]));
}
