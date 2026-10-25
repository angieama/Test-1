'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, BusFront, Check, ChevronRight, Clock3, Flag, Plus, RefreshCw, Wallet, X } from 'lucide-react';
import { newRequestId } from '../lib/request-id';
import { money } from '../lib/payment-model';
import { parseCashAmount, rideTotal, type Ride, type RideEntry } from '../lib/ride-model';
const dateFormat = new Intl.DateTimeFormat('en-KE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Africa/Nairobi'});
const timeFormat = new Intl.DateTimeFormat('en-KE',{hour:'2-digit',minute:'2-digit',timeZone:'Africa/Nairobi'});
type Props = { rides: Ride[]; online: boolean; onChanged: () => Promise<void>; onNotice: (message: string) => void };
type Dialog = 'start'|'cash'|'end'|null;
export default function RideSales({rides,online,onChanged,onNotice}:Props) {
 const [older,setOlder]=useState<Ride[]>([]),[hasOlder,setHasOlder]=useState(rides.length===20),[loadingOlder,setLoadingOlder]=useState(false);
 const [selectedId,setSelectedId]=useState<string|null>(null),[dialog,setDialog]=useState<Dialog>(null),[saving,setSaving]=useState(false),[formError,setFormError]=useState('');
 const [dialogRide,setDialogRide]=useState<Ride|null>(null);
 const [route,setRoute]=useState(''),[fare,setFare]=useState('100'),[cash,setCash]=useState('100'),[passengers,setPassengers]=useState('1'),[note,setNote]=useState('');
 const [entries,setEntries]=useState<RideEntry[]>([]),[nextOffset,setNextOffset]=useState<number|null>(null),[loadingEntries,setLoadingEntries]=useState(false),[detailsError,setDetailsError]=useState('');
 const focusRef=useRef<string|undefined>(undefined);
 const modal=useRef<HTMLDialogElement>(null),requestId=useRef(''),savingRef=useRef(false);
 const allRides=useMemo(()=>[...rides,...older.filter(r=>!rides.some(latest=>latest.id===r.id))],[rides,older]);
 const active=rides.find(r=>r.active_slot===1);
 const focused=allRides.find(r=>r.id===selectedId)||active||allRides[0];
 const firstId=rides[0]?.id;
 useEffect(()=>{setOlder([]);setHasOlder(rides.length===20);},[firstId]);
 useEffect(()=>{if(dialog)modal.current?.showModal();else modal.current?.close();},[dialog]);
 focusRef.current=focused?.id;
 const focusId=focused?.id, entryCount=(focused?.cash_count??0)+(focused?.mpesa_count??0);
 useEffect(()=>{
  if(!focusId){setEntries([]);return;}
  const controller=new AbortController();setEntries([]);setLoadingEntries(true);setDetailsError('');setNextOffset(null);
  fetch(`/api/rides?rideId=${encodeURIComponent(focusId)}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
   const data=await response.json() as {entries:RideEntry[];nextOffset:number|null;error?:string};
   if(!response.ok)throw Error(data.error||'Could not load ride entries.');
   if(!controller.signal.aborted){setEntries(data.entries);setNextOffset(data.nextOffset);}
  }).catch(cause=>{if(!controller.signal.aborted)setDetailsError(cause instanceof Error?cause.message:'Could not load entries.');}).finally(()=>{if(!controller.signal.aborted)setLoadingEntries(false);});
  return()=>controller.abort();
 },[focusId,entryCount,online]);
 async function moreEntries(){
  if(!focused||nextOffset===null||loadingEntries)return;
  const id=focused.id;setLoadingEntries(true);
  try{const response=await fetch(`/api/rides?rideId=${encodeURIComponent(id)}&offset=${nextOffset}`,{cache:'no-store'});const data=await response.json() as {entries:RideEntry[];nextOffset:number|null;error?:string};if(!response.ok)throw Error(data.error);if(focusRef.current!==id)return;setEntries(rows=>[...rows,...data.entries.filter(row=>!rows.some(prior=>prior.id===row.id))]);setNextOffset(data.nextOffset);setDetailsError('');}
  catch(cause){if(focusRef.current===id)setDetailsError(cause instanceof Error?cause.message:'Could not load more entries.');}finally{if(focusRef.current===id)setLoadingEntries(false);}
 }
 async function moreRides(){
  if(loadingOlder)return;setLoadingOlder(true);
  try{const response=await fetch(`/api/rides?offset=${rides.length+older.length}`,{cache:'no-store'});const data=await response.json() as {rides:Ride[];nextOffset:number|null;error?:string};if(!response.ok)throw Error(data.error);setOlder(rows=>[...rows,...data.rides]);setHasOlder(data.nextOffset!==null);}
  catch(cause){setDetailsError(cause instanceof Error?cause.message:'Could not load older rides.');}finally{setLoadingOlder(false);}
 }
 function open(kind:Dialog){setDialogRide(active??null);requestId.current=newRequestId();setFormError('');if(kind==='cash'){setCash(String((active?.fare??10000)/100));setPassengers('1');setNote('');}setDialog(kind);}
 async function submit(){
  if(!online||savingRef.current)return;
  const fareCents=parseCashAmount(fare),cashCents=parseCashAmount(cash),passengerCount=Number(passengers);
  if(dialog==='start'&&(!route.trim()||!fareCents)){setFormError('Enter a route and a valid fare.');return;}
  if(dialog==='cash'&&(!dialogRide||!cashCents||!Number.isInteger(passengerCount)||passengerCount<1||passengerCount>100)){setFormError('Enter a valid total amount and 1–100 passengers.');return;}
  savingRef.current=true;setSaving(true);setFormError('');
  try{
   const payload=dialog==='start'?{action:'start',id:requestId.current,route:route.trim(),fare:fareCents}:dialog==='end'?{action:'end',id:dialogRide?.id}:{id:requestId.current,rideId:dialogRide?.id,amount:cashCents,passengers:passengerCount,note};
   const response=await fetch(dialog==='cash'?'/api/cash':'/api/rides',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   const data=await response.json() as {ride?:{id:string};error?:string};if(!response.ok)throw Error(data.error||'Could not save. Please retry.');
   const action=dialog;setDialog(null);if(data.ride)setSelectedId(data.ride.id);else if(dialogRide)setSelectedId(dialogRide.id);
   await onChanged();onNotice(action==='start'?'Ride started. Verified payments now count toward this ride.':action==='cash'?'Cash payment saved to the ride.':'Ride ended. Sales are saved in your ride history.');
  }catch(cause){setFormError(cause instanceof Error?cause.message:'Could not save. Please retry.');await onChanged();}
  finally{savingRef.current=false;setSaving(false);}
 }
 return <section className="ride-sales">
  <div className="ride-toolbar"><div><span className={`ride-status ${active?'active':''}`}><span/>{active?'Ride in progress':'No active ride'}</span><p>Sales are saved for each journey.</p></div>{!active&&<button className="small-primary" onClick={()=>open('start')} disabled={!online}><Plus size={16}/>Start ride</button>}</div>
  {!online&&<div className="error-banner">You’re offline. Reconnect to record sales.</div>}
  {active&&<div className="active-ride-card"><div className="ride-card-top"><BusFront size={23}/><div><b>{active.route}</b><span>Started {timeFormat.format(active.started_at)} · Fare KSh {money(active.fare)}</span></div></div><div className="active-ride-total"><span>This ride’s sales</span><strong><small>KSh</small> {money(rideTotal(active))}</strong></div><div className="active-breakdown"><div><span>Verified M-Pesa</span><b>KSh {money(active.mpesa_total)}</b><small>{active.mpesa_count} receipts</small></div><div><span>Cash received</span><b>KSh {money(active.cash_total)}</b><small>{active.cash_passengers} passengers</small></div></div><div className="ride-actions"><button className="cash-button" onClick={()=>open('cash')} disabled={!online}><Banknote size={18}/>Add cash</button><button className="end-ride-button" onClick={()=>open('end')} disabled={!online}><Flag size={16}/>End ride</button></div></div>}
  {!allRides.length&&<div className="ride-empty"><BusFront size={36}/><h2>Your first ride starts here</h2><p>Enter a route and fare. Tick-off M-Pesa payments and cash fares will be recorded against that ride.</p><button className="primary-button" onClick={()=>open('start')} disabled={!online}>Start your first ride</button></div>}
  {!!allRides.length&&<><div className="ride-section-heading"><h2>Ride history</h2><span>{allRides.length} loaded</span></div><div className="ride-history">{allRides.map(ride=><button className={`ride-history-row ${focused?.id===ride.id?'selected':''}`} key={ride.id} onClick={()=>setSelectedId(ride.id)} aria-pressed={focused?.id===ride.id}><span className="ride-history-icon"><BusFront size={19}/></span><span className="ride-history-label"><b>{ride.route}</b><small>{dateFormat.format(ride.started_at)} · {ride.ended_at?'Ended':'In progress'}</small></span><span className="ride-history-amount">KSh {money(rideTotal(ride))}<ChevronRight size={15}/></span></button>)}</div>{hasOlder&&<button className="load-ride-records" onClick={moreRides} disabled={loadingOlder||!online}>{loadingOlder?'Loading…':'Load older rides'}</button>}</>}
  {focused&&<div className="ride-detail"><div className="ride-section-heading"><h2>{focused.route}</h2><span>{focused.ended_at?'Completed ride':'Current ride'}</span></div><div className="ride-detail-totals"><div><span>Total sales</span><b>KSh {money(rideTotal(focused))}</b></div><div><span>M-Pesa</span><b>{money(focused.mpesa_total)}</b></div><div><span>Cash</span><b>{money(focused.cash_total)}</b></div></div><p className="ride-accounting-note">M-Pesa sales count only receipts ticked off for this ride. Cash entries are added separately.</p><div className="ride-entries">{entries.map(entry=><article key={`${entry.kind}-${entry.id}`} className="ride-entry"><span className={`entry-icon ${entry.kind}`}>{entry.kind==='cash'?<Banknote size={18}/>:<Check size={18}/>}</span><div><b>{entry.kind==='cash'?`Cash · ${entry.passengers} passenger${entry.passengers===1?'':'s'}`:entry.customer}</b><p>{entry.kind==='mpesa'?entry.id:entry.reference||'Cash fare'}</p><small>{timeFormat.format(entry.occurred_at)}{entry.kind==='mpesa'&&entry.reference?` · ${entry.reference}`:''}</small></div><strong>KSh {money(entry.amount)}</strong></article>)}</div>{loadingEntries&&<p className="ride-loading"><RefreshCw size={14}/>Loading entries…</p>}{!loadingEntries&&!entries.length&&!detailsError&&<p className="ride-loading">No sales recorded for this ride yet.</p>}{detailsError&&<p className="claim-error" role="alert">{detailsError}</p>}{nextOffset!==null&&<button className="load-ride-records" onClick={moreEntries} disabled={loadingEntries||!online}>Load more entries</button>}</div>}
  <dialog ref={modal} className="modal ride-modal" aria-labelledby="ride-dialog-title" onCancel={event=>{if(saving)event.preventDefault();else setDialog(null);}} onClose={()=>{if(!saving)setDialog(null);}}><button className="modal-close icon-button" aria-label="Close ride form" disabled={saving} onClick={()=>setDialog(null)}><X size={22}/></button><span className="modal-symbol">{dialog==='cash'?<Banknote size={25}/>:<BusFront size={25}/>}</span><h2 id="ride-dialog-title">{dialog==='start'?'Start a ride':dialog==='cash'?'Record cash received':'End this ride?'}</h2><p>{dialog==='start'?'Give this journey a route and fare. New confirmations will count toward this ride.':dialog==='cash'?'Enter the total cash received. You can record fares for several passengers together.':'Your sales will stay in the database. Start a new ride before recording the next journey’s sales.'}</p><form onSubmit={event=>{event.preventDefault();void submit();}}>
   {dialog==='start'&&<><label htmlFor="ride-route">Route / journey</label><input id="ride-route" placeholder="e.g. CBD → Rongai" value={route} onChange={event=>setRoute(event.target.value)} required maxLength={80} disabled={saving}/><label htmlFor="ride-fare">Fare per passenger (KSh)</label><input id="ride-fare" inputMode="decimal" value={fare} onChange={event=>setFare(event.target.value)} required disabled={saving}/></>}
   {dialog==='cash'&&<><div className="cash-for-ride"><BusFront size={16}/>{dialogRide?.route}</div><label htmlFor="cash-total">Total cash received (KSh)</label><input id="cash-total" inputMode="decimal" value={cash} onChange={event=>setCash(event.target.value)} required disabled={saving}/><label htmlFor="cash-passengers">Number of passengers</label><input id="cash-passengers" type="number" inputMode="numeric" min="1" max="100" value={passengers} onChange={event=>setPassengers(event.target.value)} required disabled={saving}/><button type="button" className="fare-helper" disabled={saving} onClick={()=>setCash(String((dialogRide?.fare??0)*Number(passengers)/100))}>Use fare × passenger count</button><label htmlFor="cash-note">Note (optional)</label><input id="cash-note" placeholder="e.g. Three fares at the stage" maxLength={120} value={note} onChange={event=>setNote(event.target.value)} disabled={saving}/><p className="ride-accounting-note">Saving records cash you have already received. It does not transfer money.</p></>}
   {dialog==='end'&&dialogRide&&<div className="end-summary"><b>{dialogRide.route}</b><strong>KSh {money(rideTotal(dialogRide))}</strong><span>M-Pesa {money(dialogRide.mpesa_total)} + Cash {money(dialogRide.cash_total)}</span></div>}
   {formError&&<p className="claim-error" role="alert">{formError}</p>}{!online&&<p className="claim-error">Reconnect before saving.</p>}<button className="primary-button" disabled={saving||!online}>{saving?'Saving…':dialog==='start'?'Start ride':dialog==='cash'?'Save cash payment':'End ride & save totals'}</button><button type="button" className="cancel-button" disabled={saving} onClick={()=>setDialog(null)}>Go back</button>
  </form></dialog>
 </section>;
}
