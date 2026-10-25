import { database, json, validMutation } from '../../../lib/payments';
import { recordCash, RideError, isId, isCents } from '../../../lib/ride-store';
export async function POST(request:Request) {
 if(!validMutation(request)) return json({error:'Invalid request.'},403);
 try {
  const body=await request.json() as Record<string,unknown>;
  if(!body||!isId(body.id)||!isId(body.rideId)||!isCents(body.amount)||typeof body.passengers!=='number'||!Number.isInteger(body.passengers)||body.passengers<1||body.passengers>100||typeof body.note!=='string'||body.note.trim().length>120) return json({error:'Enter a cash amount, 1–100 passengers and an optional note (up to 120 characters).'},400);
  return json({entry:await recordCash(database(),{id:body.id,rideId:body.rideId,amount:body.amount,passengers:body.passengers,note:body.note.trim()})},201);
 } catch(cause) {return json({error:cause instanceof RideError?cause.message:'Could not save cash. Retry with the same reference to avoid duplicates.'},cause instanceof RideError?cause.status:503);}
}
