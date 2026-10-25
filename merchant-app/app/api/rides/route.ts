import { database, json, validMutation } from '../../../lib/payments';
import { RIDE_SUMMARY_QUERY, RIDE_ENTRIES_QUERY } from '../../../lib/ride-queries';
import { startRide, endRide, RideError, isId, isCents } from '../../../lib/ride-store';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
 try {
  const url=new URL(request.url), rideId=url.searchParams.get('rideId'), offset=Number(url.searchParams.get('offset')||0);
  if(!Number.isSafeInteger(offset)||offset<0||offset>1000000) return json({error:'Invalid page.'},400);
  if(rideId) {
   if(!isId(rideId)) return json({error:'Invalid ride.'},400);
   if(!await database().prepare('SELECT id FROM rides WHERE id=?').bind(rideId).first()) return json({error:'Ride not found.'},404);
   const entries=await database().prepare(RIDE_ENTRIES_QUERY).bind(rideId,rideId,50,offset).all();
   return json({entries:entries.results,nextOffset:entries.results.length===50?offset+50:null});
  }
  const rides=await database().prepare(RIDE_SUMMARY_QUERY).bind(20,offset).all();
  return json({rides:rides.results,nextOffset:rides.results.length===20?offset+20:null});
 } catch {return json({error:'Could not load ride records. Please retry.'},503);}
}
export async function POST(request:Request) {
 if(!validMutation(request)) return json({error:'Invalid request.'},403);
 try {
  const body=await request.json() as Record<string,unknown>;
  if(!body||!isId(body.id)) return json({error:'Invalid ride reference.'},400);
  if(body.action==='end') return json({ride:await endRide(database(),body.id)});
  if(body.action!=='start'||typeof body.route!=='string'||!body.route.trim()||body.route.trim().length>80||!isCents(body.fare)) return json({error:'Enter a route and fare from KSh 0.01 to KSh 250,000.'},400);
  return json({ride:await startRide(database(),{id:body.id,route:body.route.trim(),fare:body.fare})},201);
 } catch(cause) {return json({error:cause instanceof RideError?cause.message:'Could not save the ride. Please retry.'},cause instanceof RideError?cause.status:503);}
}
