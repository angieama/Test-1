export const WINDOW_MS = 30 * 60 * 1000;

export type Payment = {
  id: string;
  receipt: string;
  customer: string;
  amountCents: number;
  receivedAt: number;
  claimedCustomer: string | null;
  reference: string | null;
  verifiedAt: number | null;
  journeyId: string | null;
  fareCents: number | null;
  passengers: number | null;
  claimedFareCents: number | null;
  refundedCents: number;
  combinedTotalCents: number | null;
  combinedPassengers: number | null;
  combinedReceipts: string | null;
};

export type Journey = {
  id: string;
  origin: string;
  destination: string;
  fareCents: number;
  startedAt: number;
  endedAt: number | null;
  totalCents: number;
  mpesaCents: number;
  cashCents: number;
  confirmedCents: number;
  paymentCount: number;
  passengerCount: number;
  verifiedCount: number;
};

export type FareQR = {
  id: string;
  journeyId: string;
  fareCents: number;
  passengers: number;
  amountCents: number;
  svg: string;
  payload: string;
  mode: "preview";
};

export function firstName(value: string): string {
  return value.trim().split(/\s+/u)[0] || "Customer";
}

export function suggestedPassengers(amountCents: number, fareCents: number | null): number {
  return fareCents ? Math.floor(amountCents / fareCents) : 0;
}

export function fareBalance(amountCents: number, fareCents: number | null, passengers: number) {
  if (!fareCents) return { expected: null, shortfall: 0, extra: 0 };
  const expected = fareCents * passengers;
  return { expected, shortfall: Math.max(0, expected - amountCents), extra: Math.max(0, amountCents - expected) };
}

export function coverageError(amountCents: number, fareCents: number | null, passengers: unknown): string | null {
  if (typeof passengers !== "number" || !Number.isSafeInteger(passengers) || passengers < 1) return "Payment must cover at least one whole passenger.";
  if (!fareCents) return "Set the fare per person to calculate passengers.";
  if (fareCents && amountCents < fareCents * passengers) return "This payment does not cover the selected number of passengers.";
  return null;
}

export function amountToCents(value: string, allowZero = false): number | null {
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && (allowZero ? cents >= 0 : cents > 0) && cents <= 25000000 ? cents : null;
}

export function isRecent(payment: Payment, now: number): boolean {
  return payment.receivedAt > now - WINDOW_MS && payment.receivedAt <= now;
}

const moneyFormatter = new Intl.NumberFormat("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function money(cents: number): string {
  return moneyFormatter.format(cents / 100);
}
