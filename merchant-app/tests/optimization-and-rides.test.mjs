import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { seedDemo } from '../lib/demo-seed.ts';
import { SingleFlight } from '../lib/single-flight.ts';
import { nextPaymentUpdateAt, elapsed, money, WINDOW } from '../lib/payment-model.ts';
import { startRide, endRide, recordCash, RideError } from '../lib/ride-store.ts';
import { RIDE_SUMMARY_QUERY, RIDE_ENTRIES_QUERY, CLAIM_QUERY } from '../lib/ride-queries.ts';
import { PAYMENT_QUERY } from '../lib/payment-queries.ts';
import { parseCashAmount } from '../lib/ride-model.ts';
import { newRequestId } from '../lib/request-id.ts';
const now=1_800_000_000_000;
class D1 {
 constructor(sqlite){this.sqlite=sqlite??new DatabaseSync(':memory:');this.calls=0;if(!sqlite){for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())this.sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));this.sqlite.exec('PRAGMA foreign_keys=ON');}}
 prepare(sql){const db=this;let args=[];return {bind(...values){args=values;return this;},async first(){db.calls++;return db.sqlite.prepare(sql).get(...args)??null;},async all(){db.calls++;return {results:db.sqlite.prepare(sql).all(...args),success:true};},async run(){db.calls++;return db.sqlite.prepare(sql).run(...args);}};}
 async batch(statements){this.sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.all());this.sqlite.exec('COMMIT');return results;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}
}
function receipt(db,id='DEMO-TEST',amount=10000,time=now-1000){db.sqlite.prepare('INSERT INTO payments(receipt,name,phone,amount,received_at) VALUES(?,?,?,?,?)').run(id,'Demo Payer','0712 ••• 482',amount,time);}
function claim(db,id,rideId,time=now){return db.prepare(CLAIM_QUERY).bind(time,'Seat 4',rideId,id,time-WINDOW,time,rideId,rideId).first();}
const rideInput=(route='CBD → Rongai')=>({id:crypto.randomUUID(),route,fare:10000});
const cashInput=(rideId)=>({id:crypto.randomUUID(),rideId,amount:30000,passengers:3,note:'Three fares'});
test('demo seeding is single-flight and does no queries after successful initialization',async()=>{
 const db=new D1();await Promise.all([seedDemo(db),seedDemo(db),seedDemo(db)]);assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM payments').get().n,72);const calls=db.calls;await seedDemo(db);assert.equal(db.calls,calls);
 const cold=new D1(db.sqlite);await seedDemo(cold);assert.equal(cold.calls,1);assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM payments').get().n,72);
});
test('seeding preserves existing claims and original receipt times',async()=>{
 const db=new D1();receipt(db,'DEMO000001',12300,now-10000);db.sqlite.prepare('UPDATE payments SET claimed_at=?,claimed_for=? WHERE receipt=?').run(now,'Original owner','DEMO000001');await seedDemo(db);const p=db.sqlite.prepare('SELECT * FROM payments WHERE receipt=?').get('DEMO000001');assert.equal(p.claimed_for,'Original owner');assert.equal(p.amount,12300);assert.equal(p.received_at,now-10000);
});
test('failed initialization can retry',async()=>{
 const db=new D1();const original=db.prepare.bind(db);let failed=false;db.prepare=sql=>{if(!failed){failed=true;throw Error('temporary database failure');}return original(sql);};await assert.rejects(seedDemo(db));await seedDemo(db);assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM payments').get().n,72);
});
test('overlapping refreshes share a request and forced refresh aborts the stale snapshot',async()=>{
 const gate=new SingleFlight();let calls=0,release;let firstSignal;
 const first=gate.run(async signal=>{calls++;firstSignal=signal;await new Promise(resolve=>release=resolve);return signal.aborted?'aborted':'stale';});
 const second=gate.run(async()=>{calls++;return 'wrong';});assert.equal(first,second);await Promise.resolve();assert.equal(calls,1);
 const fresh=gate.run(async()=>{calls++;return 'new';},true);assert.equal(firstSignal.aborted,true);assert.equal(await fresh,'new');release();assert.equal(await first,'aborted');assert.equal(calls,2);
});
test('clock schedules label transitions and exact 30-minute expiry without a one-second interval',()=>{
 const p={received_at:now-59999};assert.equal(nextPaymentUpdateAt([p],now),now+1);assert.equal(elapsed(p.received_at,now),'Just now');assert.equal(elapsed(p.received_at,now+1),'1 min ago');
 assert.equal(nextPaymentUpdateAt([{received_at:now-WINDOW}],now),now+1);assert.equal(nextPaymentUpdateAt([{received_at:now-3600000}],now),null);assert.equal(nextPaymentUpdateAt([],now),null);assert.equal(money(10005),'100.05');
});
test('indexed payment query preserves results without scanning expired unclaimed history',()=>{
 const db=new D1();const insert=db.sqlite.prepare('INSERT INTO payments(receipt,name,phone,amount,received_at,claimed_at) VALUES(?,?,?,?,?,?)');db.sqlite.exec('BEGIN');for(let i=0;i<10000;i++)insert.run('DEMO'+i,'Sample','•••',10000,now-WINDOW-i*1000,i%100===0?now:null);for(let i=0;i<100;i++)insert.run('DEMORECENT'+i,'Sample','•••',10000,now-i*1000,null);db.sqlite.exec('COMMIT');
 const cutoff=now-WINDOW;const original=db.sqlite.prepare('SELECT * FROM payments WHERE received_at>=? OR claimed_at IS NOT NULL ORDER BY received_at DESC LIMIT 500').all(cutoff);const optimized=db.sqlite.prepare(PAYMENT_QUERY).all(cutoff,cutoff);assert.deepEqual(optimized,original);const plan=db.sqlite.prepare('EXPLAIN QUERY PLAN '+PAYMENT_QUERY).all(cutoff,cutoff).map(row=>row.detail).join('\n');assert.match(plan,/SEARCH payments USING INDEX payments_received_idx/);assert.match(plan,/SEARCH payments USING INDEX payments_claimed_received_idx/);
});
test('only one active ride is allowed, including concurrent starts and retries',async()=>{
 const db=new D1(),a=rideInput(),b=rideInput('Rongai → CBD');const results=await Promise.allSettled([startRide(db,a,now),startRide(db,b,now)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const winner=results[0].status==='fulfilled'?a:b;await startRide(db,winner,now);assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM rides').get().n,1);await endRide(db,winner.id,now+1000);await startRide(db,rideInput(),now+2000);assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM rides WHERE active_slot=1').get().n,1);
});
test('M-Pesa and cash totals stay separate and persist after a ride ends',async()=>{
 const db=new D1(),ride=rideInput();await startRide(db,ride,now-30000);receipt(db,'DEMO-A',10000);receipt(db,'DEMO-B',20000);assert.ok(await claim(db,'DEMO-A',ride.id));assert.ok(await claim(db,'DEMO-B',ride.id));await recordCash(db,cashInput(ride.id),now);await endRide(db,ride.id,now+1000);const r=(await new D1(db.sqlite).prepare(RIDE_SUMMARY_QUERY).bind(20,0).all()).results[0];assert.equal(r.mpesa_total,30000);assert.equal(r.cash_total,30000);assert.equal(r.mpesa_count,2);assert.equal(r.cash_passengers,3);assert.equal(r.ended_at,now+1000);assert.equal(r.mpesa_total+r.cash_total,60000);
});
test('cash retries never double count, and changing a used reference is rejected',async()=>{
 const db=new D1(),ride=rideInput();await startRide(db,ride,now);const cash=cashInput(ride.id);await Promise.all([recordCash(db,cash,now),recordCash(db,cash,now)]);assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM cash_payments').get().n,1);assert.equal(db.sqlite.prepare('SELECT SUM(amount) AS total FROM cash_payments').get().total,30000);await assert.rejects(recordCash(db,{...cash,amount:50000}),RideError);await endRide(db,ride.id,now+1000);await recordCash(db,cash,now+2000);assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM cash_payments').get().n,1);
});
test('closed/stale rides reject new cash or M-Pesa and receipts cannot move to another ride',async()=>{
 const db=new D1(),ride=rideInput();await startRide(db,ride,now);receipt(db);assert.equal(await claim(db,'DEMO-TEST',null),null);assert.ok(await claim(db,'DEMO-TEST',ride.id));await endRide(db,ride.id,now+1000);await assert.rejects(recordCash(db,cashInput(ride.id),now+2000),RideError);receipt(db,'DEMO-NEW');assert.equal(await claim(db,'DEMO-NEW',ride.id),null);const next=rideInput();await startRide(db,next,now+2000);assert.equal(await claim(db,'DEMO-TEST',next.id),null);assert.equal(db.sqlite.prepare('SELECT ride_id FROM payments WHERE receipt=?').get('DEMO-TEST').ride_id,ride.id);
});
test('ride entries paginate without losing cash or verified receipts',async()=>{
 const db=new D1(),ride=rideInput();await startRide(db,ride,now);for(let i=0;i<52;i++)await recordCash(db,cashInput(ride.id),now+i);const first=(await db.prepare(RIDE_ENTRIES_QUERY).bind(ride.id,ride.id,50,0).all()).results;const second=(await db.prepare(RIDE_ENTRIES_QUERY).bind(ride.id,ride.id,50,50).all()).results;assert.equal(first.length,50);assert.equal(second.length,2);assert.equal(new Set([...first,...second].map(p=>p.id)).size,52);
});
test('cash amount parsing uses exact cents and rejects invalid or excessive values',()=>{
 assert.equal(parseCashAmount('100.05'),10005);assert.equal(parseCashAmount('0.01'),1);for(const value of ['0','-5','1.999','Infinity','250000.01',''])assert.equal(parseCashAmount(value),null);
});

test('request IDs remain unique in browsers without randomUUID',()=>{
 const source={getRandomValues:crypto.getRandomValues.bind(crypto)};const ids=Array.from({length:20},()=>newRequestId(source));assert.equal(new Set(ids).size,20);for(const id of ids)assert.match(id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});
