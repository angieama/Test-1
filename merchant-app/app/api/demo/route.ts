import { database, json, validMutation, insertDemoPayments } from '../../../lib/payments';
import { demoCustomers, makeDemoPayments } from '../../../lib/demo-data';
export async function POST(request:Request) {
 if(!validMutation(request)) return json({error:'Invalid request.'},403);
 try {
 const raw=await request.json() as unknown;
 if(!raw||typeof raw!=='object') return json({error:'Invalid request.'},400);
 const {amount,count=1}=raw as Record<string,unknown>;
 if(count!==1&&count!==30) return json({error:'Add either 1 or 30 demo payments at a time.'},400);
 if(count===30){
  const rows=makeDemoPayments(crypto.randomUUID().replaceAll('-','').slice(0,12).toUpperCase(),Date.now(),30);
  await insertDemoPayments(rows);
  return json({count:rows.length},201);
 }
 if(typeof amount!=='number'||!Number.isSafeInteger(amount)||amount<=0||amount>25000000) return json({error:'Use an amount from KSh 0.01 to KSh 250,000.'},400);
 const s=demoCustomers[Math.floor(Math.random()*demoCustomers.length)];
 const receipt='DEMO'+crypto.randomUUID().replaceAll('-','').slice(0,10).toUpperCase();
 await database().prepare('INSERT INTO payments (receipt,name,phone,amount,received_at) VALUES (?,?,?,?,?)').bind(receipt,s[0],s[1],amount,Date.now()).run();
 return json({receipt},201);
 } catch {return json({error:'Could not add a demo payment. Please try again.'},503);}
}
