import { database, json, validMutation, WINDOW } from '../../../lib/payments';
import { CLAIM_QUERY } from '../../../lib/ride-queries';
import { isId } from '../../../lib/ride-store';
export async function POST(request:Request) {
 if(!validMutation(request)) return json({error:'Invalid request.'},403);
 try {
 const raw=await request.json() as unknown;
 if(!raw||typeof raw!=='object') return json({error:'Invalid request.'},400);
 const body=raw as Record<string,unknown>;
 if(typeof body.receipt!=='string'||!/^DEMO[A-Z0-9-]{1,50}$/.test(body.receipt)||typeof body.claimedFor!=='string'||!body.claimedFor.trim()||body.claimedFor.trim().length>80) return json({error:'Enter a customer name, seat or order reference (up to 80 characters).'},400);
 const rideId=body.rideId??null;
 if(rideId!==null&&!isId(rideId)) return json({error:'Invalid ride reference.'},400);
 const now=Date.now();
 const result=await database().prepare(CLAIM_QUERY).bind(now,body.claimedFor.trim(),rideId,body.receipt,now-WINDOW,now,rideId,rideId).first();
 if(!result) return json({error:'This payment is already confirmed, expired, or the active ride changed. Refresh to see its status.'},409);
 return json({payment:result});
 } catch {return json({error:'Confirmation could not be saved. Please try again.'},503);}
}
