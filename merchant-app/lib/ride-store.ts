import { START_RIDE_QUERY, END_RIDE_QUERY, CASH_QUERY } from './ride-queries.ts';
export class RideError extends Error {
 status: number;
 constructor(message: string, status = 409) { super(message); this.status=status; }
}
export type StartRide = { id: string; route: string; fare: number };
export type CashInput = { id: string; rideId: string; amount: number; passengers: number; note: string };
export async function startRide(db: D1Database, input: StartRide, now = Date.now()) {
 const existing = await db.prepare('SELECT * FROM rides WHERE id=?').bind(input.id).first<{route:string;fare:number}>();
 if (existing) {
  if(existing.route!==input.route||existing.fare!==input.fare) throw new RideError('This ride reference is already in use.');
  return existing;
 }
 const result = await db.prepare(START_RIDE_QUERY).bind(input.id,input.route,input.fare,now).first();
 if(result) return result;
 // Another device may have completed the same request while this one was waiting.
 const retry = await db.prepare('SELECT * FROM rides WHERE id=?').bind(input.id).first<{route:string;fare:number}>();
 if(retry?.route===input.route&&retry.fare===input.fare) return retry;
 throw new RideError('Another ride is active. Refresh and end it before starting a new ride.');
}
export async function endRide(db: D1Database, id: string, now = Date.now()) {
 const result = await db.prepare(END_RIDE_QUERY).bind(now,id).first();
 if(result) return result;
 const existing = await db.prepare('SELECT * FROM rides WHERE id=?').bind(id).first();
 if(!existing) throw new RideError('Ride not found.',404);
 return existing;
}
export async function recordCash(db: D1Database, input: CashInput, now = Date.now()) {
 const same = (row: Record<string,unknown>) => row.ride_id===input.rideId&&row.amount===input.amount&&row.passenger_count===input.passengers&&row.note===input.note;
 const existing = await db.prepare('SELECT * FROM cash_payments WHERE id=?').bind(input.id).first<Record<string,unknown>>();
 if(existing) { if(!same(existing)) throw new RideError('This cash reference is already in use.'); return existing; }
 const result = await db.prepare(CASH_QUERY).bind(input.id,input.rideId,input.amount,input.passengers,input.note,now,input.rideId).first();
 if(result) return result;
 const retry = await db.prepare('SELECT * FROM cash_payments WHERE id=?').bind(input.id).first<Record<string,unknown>>();
 if(retry&&same(retry)) return retry;
 throw new RideError('This ride has ended. Refresh before recording more cash.');
}
export function isId(value: unknown): value is string { return typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value); }
export function isCents(value: unknown): value is number { return typeof value==='number' && Number.isSafeInteger(value) && value>0 && value<=25_000_000; }
