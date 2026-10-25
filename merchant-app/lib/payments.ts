import { env } from 'cloudflare:workers';
import { seedDemo, insertDemoPayments as insert } from './demo-seed';
import type { DemoPayment } from './demo-data';
export { WINDOW, type Payment } from './payment-model';
export function database() {
  if (!env.DB) throw new Error('Database is unavailable.');
  return env.DB;
}
export const seed = () => seedDemo(database());
export const insertDemoPayments = (rows: DemoPayment[]) => insert(database(), rows);
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function validMutation(request: Request) {
  const origin = request.headers.get('origin');
  return request.headers.get('content-type')?.includes('application/json') && (!origin || origin === new URL(request.url).origin);
}
