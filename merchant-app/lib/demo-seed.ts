import { makeDemoPayments, type DemoPayment } from './demo-data.ts';
// Successful initialization is shared within an isolate; failures can retry safely.
const initialization = new WeakMap<D1Database, Promise<void>>();
const READY = 'merchant-demo-seed-ready-v1';
const INSERT = 'INSERT OR IGNORE INTO payments (receipt,name,phone,amount,received_at,claimed_at,claimed_for) VALUES (?,?,?,?,?,?,?)';
const originalSamples = [
 ['Faith Wanjiku','0712 ••• 482',100,1],['Brian Otieno','0723 ••• 916',50,2],
 ['Grace Akinyi','0708 ••• 125',100,3],['James Mwangi','0722 ••• 638',150,5],
 ['Mary Wambui','0715 ••• 043',100,7],['Kevin Mutua','0790 ••• 291',50,9],
 ['Esther Njeri','0728 ••• 571',200,11],['Peter Kamau','0710 ••• 308',100,14],
 ['Sharon Atieno','0741 ••• 625',100,17],['David Kiptoo','0724 ••• 887',150,21],
 ['Alice Chebet','0701 ••• 492',50,24],['Joseph Maina','0718 ••• 209',100,28],
] as const;
export function insertDemoPayments(db: D1Database, rows: DemoPayment[]) {
  return db.batch(rows.map(p => db.prepare(INSERT).bind(p.receipt, p.name, p.phone, p.amount, p.received_at, p.claimed_at, p.claimed_for)));
}
async function initialize(db: D1Database) {
  if (await db.prepare('SELECT started_at FROM demo_state WHERE id = ?').bind(READY).first()) return;
  // Preserve original seed clocks and receipt IDs on existing deployments.
  await db.batch(['merchant-demo', 'expanded-demo-payments-v1'].map(id => db.prepare('INSERT OR IGNORE INTO demo_state (id,started_at) VALUES (?,?)').bind(id, Date.now())));
  const states = await db.prepare('SELECT id,started_at FROM demo_state WHERE id IN (?,?)').bind('merchant-demo', 'expanded-demo-payments-v1').all<{ id: string; started_at: number }>();
  const times = new Map(states.results.map(row => [row.id, row.started_at]));
  const start = times.get('merchant-demo')!;
  const original = originalSamples.map((p, i): DemoPayment => ({ receipt: `DEMO${String(i + 1).padStart(6, '0')}`, name: p[0], phone: p[1], amount: p[2] * 100, received_at: start - p[3] * 60_000, claimed_at: [3, 7].includes(i) ? start - p[3] * 60_000 + 30_000 : null, claimed_for: [3, 7].includes(i) ? p[0] : null }));
  await insertDemoPayments(db, [...original, ...makeDemoPayments('EXP1', times.get('expanded-demo-payments-v1')!, 60)]);
  // Set only after all receipts exist. A crash/retry cannot overwrite any claims.
  await db.prepare('INSERT OR IGNORE INTO demo_state (id,started_at) VALUES (?,?)').bind(READY, Date.now()).run();
}
export function seedDemo(db: D1Database): Promise<void> {
  const existing = initialization.get(db);
  if (existing) return existing;
  const pending = initialize(db).catch(error => { initialization.delete(db); throw error; });
  initialization.set(db, pending);
  return pending;
}
