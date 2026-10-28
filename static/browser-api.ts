import QRCode from "qrcode";
import { buildAnalysis } from "../lib/analysis.ts";
import { amountToCents, coverageError, firstName, isRecent, money, suggestedPassengers, WINDOW_MS, type Journey, type Payment, type SavedRoute } from "../lib/payment-types.ts";
import { earningsBounds, type Earnings, type RideEarnings } from "../lib/earnings-types.ts";
import { generateRideSamples } from "../lib/ride-simulator.ts";

export const STORAGE_KEY = "lipa-verify-browser-ledger-v2";
type Refund = { id: string; paymentId: string; amountCents: number; refundedAt: number };
type Ledger = { version: 2; routeNamesVersion?: 1; payments: Payment[]; journeys: Journey[]; refunds: Refund[]; routes: SavedRoute[] };
type BrowserStorage = Pick<Storage, "getItem" | "setItem">;

function uuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function fail(message: string, status = 422): never { throw Object.assign(new Error(message), { status }); }
function requiredAmount(value: unknown, allowZero = false) {
  const amount = typeof value === "string" ? amountToCents(value, allowZero) : null;
  if (amount === null) fail("Enter a valid amount with up to two decimal places (maximum KSh 250,000).");
  return amount;
}
function routeName(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 60 || /[\u0000-\u001f]/.test(value)) fail("Enter a route name between 1 and 60 characters.");
  return value.trim();
}
function rawJourney(origin: string, destination: string, fareCents: number, now: number): Journey {
  return { id: uuid(), origin, destination, fareCents, startedAt: now, endedAt: null, cashCents: 0, mpesaCents: 0, totalCents: 0, confirmedCents: 0, paymentCount: 0, passengerCount: 0, verifiedCount: 0 };
}
function rawPayment(customer: string, amountCents: number, journey: Journey | null, now: number): Payment {
  return { id: uuid(), receipt: "DE" + uuid().replaceAll("-", "").slice(0, 8).toUpperCase(), customer: firstName(customer), amountCents, receivedAt: now, journeyId: journey?.id ?? null, fareCents: journey?.fareCents ?? null, passengers: null, claimedFareCents: null, claimedCustomer: null, reference: null, verifiedAt: null, refundedCents: 0, combinedTotalCents: null, combinedPassengers: null, combinedReceipts: null };
}
function samples(state: Ledger, journey: Journey, count: number, now: number) {
  const generated = generateRideSamples(journey.fareCents, count);
  generated.forEach((sample, index) => sample.amounts.forEach((amount, part) => {
    state.payments.push(rawPayment(sample.customer, amount, journey, now - (count-index)*2000 + part*500));
  }));
  return { customers: count, passengers: generated.reduce((n,s) => n+s.passengers,0), receipts: generated.reduce((n,s) => n+s.amounts.length,0), exact: generated.filter(s=>s.kind==="exact").length, underpaid: generated.filter(s=>s.kind==="underpaid").length, topups: generated.filter(s=>s.kind==="topup").length, groups: generated.filter(s=>s.kind==="group").length };
}
function seed(now: number): Ledger {
  const state: Ledger = { version: 2, routeNamesVersion: 1, payments: [], journeys: [], refunds: [], routes: [] };
  const ride = rawJourney("Kileleshwa", "Town", 10000, now-10*60000);
  const old = rawJourney("Town", "Westlands", 15000, now-86400000);
  old.endedAt = now-86400000+1800000; old.cashCents = 75000;
  state.journeys.push(ride, old);
  samples(state, ride, 12, now);
  const payment = rawPayment("Grace", 30000, old, old.startedAt+600000);
  Object.assign(payment, { verifiedAt: old.startedAt+601000, passengers: 2, claimedFareCents: 15000, claimedCustomer: "Grace" });
  state.payments.push(payment);
  return state;
}
function refundTotal(state: Ledger, paymentId: string) { return state.refunds.filter(r=>r.paymentId===paymentId).reduce((n,r)=>n+r.amountCents,0); }
function viewPayment(state: Ledger, payment: Payment): Payment {
  const group = payment.reference?.startsWith("combine:") ? state.payments.filter(p=>p.reference===payment.reference) : [];
  return { ...payment, refundedCents: refundTotal(state,payment.id), combinedTotalCents: group.length ? group.reduce((n,p)=>n+p.amountCents,0) : null, combinedPassengers: group.length ? group.reduce((n,p)=>n+(p.passengers??0),0) : null, combinedReceipts: group.length ? group.map(p=>p.receipt).join(" + ") : null };
}
function viewJourney(state: Ledger, journey: Journey): Journey {
  const payments = state.payments.filter(p=>p.journeyId===journey.id);
  const confirmed = payments.filter(p=>p.verifiedAt!==null);
  const mpesaCents = payments.reduce((n,p)=>n+p.amountCents,0);
  return { ...journey, mpesaCents, totalCents: mpesaCents+journey.cashCents, confirmedCents: confirmed.reduce((n,p)=>n+p.amountCents,0), paymentCount: payments.length, passengerCount: confirmed.reduce((n,p)=>n+(p.passengers??0),0), verifiedCount: confirmed.length };
}
function report(state: Ledger, from: string, to: string): Earnings {
  const { start, end } = earningsBounds(from,to);
  const inside = (time: number) => time>=start && time<end;
  const report: Earnings = { from,to,receivedCents:0,cashCents:0,refundedCents:0,netCents:0,confirmedCents:0,unverifiedCents:0,unassignedCents:0,receipts:0,rideCount:0,rides:[] };
  const rides = new Map<string,RideEarnings>();
  const ride = (id: string|null) => {
    if (!id) return null;
    if (rides.has(id)) return rides.get(id)!;
    const j=state.journeys.find(j=>j.id===id); if(!j)return null;
    const row: RideEarnings = { id:j.id,origin:j.origin,destination:j.destination,startedAt:j.startedAt,endedAt:j.endedAt,receivedCents:0,cashCents:0,refundedCents:0,netCents:0,confirmedCents:0,receipts:0 };
    rides.set(id,row); return row;
  };
  for (const p of state.payments.filter(p=>inside(p.receivedAt))) {
    report.receivedCents+=p.amountCents; report.receipts++;
    if(p.verifiedAt!==null)report.confirmedCents+=p.amountCents;else report.unverifiedCents+=p.amountCents;
    const row=ride(p.journeyId);
    if(row){row.receivedCents+=p.amountCents;row.receipts++;if(p.verifiedAt!==null)row.confirmedCents+=p.amountCents;}else report.unassignedCents+=p.amountCents;
  }
  for(const refund of state.refunds.filter(r=>inside(r.refundedAt))) {
    report.refundedCents+=refund.amountCents;
    const p=state.payments.find(p=>p.id===refund.paymentId); const row=ride(p?.journeyId??null);
    if(row)row.refundedCents+=refund.amountCents;
  }
  for(const j of state.journeys.filter(j=>j.endedAt!==null&&inside(j.endedAt)&&j.cashCents>0)){
    report.receivedCents+=j.cashCents;report.cashCents+=j.cashCents;
    const row=ride(j.id)!;row.receivedCents+=j.cashCents;row.cashCents+=j.cashCents;
  }
  report.netCents=report.receivedCents-report.refundedCents;
  report.rideCount=rides.size;
  report.rides=[...rides.values()].map(r=>({...r,netCents:r.receivedCents-r.refundedCents})).sort((a,b)=>b.netCents-a.netCents||b.startedAt-a.startedAt||a.id.localeCompare(b.id)).slice(0,100);
  return report;
}

/** Browser-only demo: each mutation reads and saves one ledger under a same-origin Web Lock. */
export function createBrowserApi(storage: BrowserStorage, clock = Date.now, storageKey = STORAGE_KEY) {
  let queue: Promise<unknown> = Promise.resolve();
  const save=(state:Ledger)=>{try{storage.setItem(storageKey,JSON.stringify(state));}catch{fail("Browser storage is unavailable or full. Allow site storage to save records.",507);}};
  const read=()=>{
    let raw:string|null;
    try{raw=storage.getItem(storageKey);}catch{fail("Browser storage is blocked. Allow site storage to use this demo.",507);}
    if(!raw){const state=seed(clock());save(state);return state;}
    let state:Ledger;
    try{state=JSON.parse(raw);}catch{fail("Saved records could not be read. They have not been overwritten.",500);}
    if(state.version!==2||!Array.isArray(state.payments)||!Array.isArray(state.journeys)||!Array.isArray(state.refunds))fail("The saved records have an unsupported format. They have not been overwritten.",500);
    if (state.routes === undefined) state.routes = [];
    if (!Array.isArray(state.routes)) fail("Saved routes could not be read. Records have not been overwritten.",500);
    // Apply the requested route rename once, keeping receipt links and totals intact.
    if (state.routeNamesVersion !== 1) {
      for (const route of [...state.journeys, ...state.routes]) {
        if (route.origin === "Nairobi" && route.destination === "Town") route.origin = "Kileleshwa";
      }
      state.routeNamesVersion = 1;
      save(state);
    }
    return state;
  };
  async function dispatch(path:string, options:RequestInit={}) {
    if(options.signal?.aborted)throw new DOMException("Aborted","AbortError");
    try {
      const state=read();const now=clock();const url=new URL(path,"https://browser.invalid");const method=options.method??"GET";
      let body:Record<string,unknown>={};
      if(options.body){try{body=JSON.parse(String(options.body));}catch{fail("Invalid request.");}}
      if(!body||typeof body!=="object"||Array.isArray(body))fail("Invalid request.");
      const payment=(id:string)=>state.payments.find(p=>p.id===id)??fail("Receipt not found.",404);
      const activeRide=(id:string)=>state.journeys.find(j=>j.id===id&&j.endedAt===null)??fail("This ride has ended or was not found.",409);
      const available=(p:Payment)=>{if(p.verifiedAt!==null||refundTotal(state,p.id))fail("Receipt already verified or refunded.",409);if(!isRecent(p,now))fail("This receipt is outside the 30-minute window.",410);};
      const claim=(p:Payment,passengers:number,fare:number|null,reference:string|null=null)=>Object.assign(p,{passengers,claimedFareCents:fare,reference,claimedCustomer:firstName(p.customer),verifiedAt:now});
      let result:unknown;
      if(method==="GET"&&url.pathname==="/api/payments"){
        const journeyId=url.searchParams.get("journey");const history=new Set([...state.payments].filter(p=>p.verifiedAt!==null).sort((a,b)=>b.verifiedAt!-a.verifiedAt!).slice(0,500).map(p=>p.id));
        result={payments:state.payments.filter(p=>isRecent(p,now)||(journeyId&&p.journeyId===journeyId)||history.has(p.id)).sort((a,b)=>b.receivedAt-a.receivedAt).map(p=>viewPayment(state,p)),journeys:state.journeys.map(j=>viewJourney(state,j)).sort((a,b)=>b.startedAt-a.startedAt),routes:state.routes,serverTime:now,demo:true};
      }else if(method==="GET"&&url.pathname==="/api/analysis"){
        result=buildAnalysis(state.payments.map(p=>({...p,refundedCents:refundTotal(state,p.id)})),state.journeys,state.refunds.map(r=>({...r,journeyId:state.payments.find(p=>p.id===r.paymentId)?.journeyId??null})),url.searchParams.get("from")??"",url.searchParams.get("to")??"",now,url.searchParams.get("journey"));
      }else if(method==="GET"&&url.pathname==="/api/earnings"){
        result=report(state,url.searchParams.get("from")??"",url.searchParams.get("to")??"");
      }else if(method==="GET"&&url.pathname==="/api/routes"){
        result={routes:state.routes};
      }else if((method==="POST"&&url.pathname==="/api/routes")||(method==="PATCH"&&/^\/api\/routes\/[^/]+$/.test(url.pathname))){
        const origin=routeName(body.origin),destination=routeName(body.destination),fareCents=requiredAmount(body.fare);
        if(origin.toLowerCase()===destination.toLowerCase())fail("Choose a different destination.");
        if(method==="PATCH"){
          const route=state.routes.find(route=>route.id===url.pathname.split("/").pop())??fail("Saved route not found.",404);
          Object.assign(route,{origin,destination,fareCents,updatedAt:now});result={id:route.id};
        }else{
          const route:SavedRoute={id:uuid(),origin,destination,fareCents,createdAt:now,updatedAt:now};
          state.routes.unshift(route);result={id:route.id};
        }
      }else if(method==="POST"&&url.pathname==="/api/journeys"){
        if(state.journeys.some(j=>j.endedAt===null))fail("End the current journey first.",409);
        const origin=routeName(body.origin),destination=routeName(body.destination);
        if(origin.toLowerCase()===destination.toLowerCase())fail("Choose a different destination.");
        const journey=rawJourney(origin,destination,requiredAmount(body.fare),now);state.journeys.push(journey);result={id:journey.id};
      }else if(method==="POST"&&url.pathname==="/api/payments"){
        if(typeof body.customer!=="string"||!body.customer.trim()||body.customer.length>80)fail("Enter the customer’s first name.");
        const p=rawPayment(body.customer,requiredAmount(body.amount),body.journeyId?activeRide(String(body.journeyId)):null,now);state.payments.push(p);result={id:p.id};
      }else if(method==="POST"&&url.pathname==="/api/payments/combine"){
        const ids=body.paymentIds;if(!Array.isArray(ids)||ids.length!==2||ids[0]===ids[1])fail("Select two different receipts.");
        const a=payment(String(ids[0])),b=payment(String(ids[1]));available(a);available(b);
        if(a.journeyId!==b.journeyId||a.fareCents!==b.fareCents||firstName(a.customer).toLowerCase()!==firstName(b.customer).toLowerCase())fail("Choose matching first names, journey and fare. Check both codes with the customer.");
        const fare=a.fareCents??(typeof body.fare==="string"?requiredAmount(body.fare):null),total=a.amountCents+b.amountCents,people=suggestedPassengers(total,fare);
        const error=coverageError(total,fare,people);if(error)fail(error);
        const reference="combine:"+a.id;claim(a,people,fare,reference);claim(b,0,fare,reference);result={verified:true};
      }else{
        const journeyMatch=url.pathname.match(/^\/api\/journeys\/([^/]+)(?:\/(qr|simulate))?$/);
        const paymentMatch=url.pathname.match(/^\/api\/payments\/([^/]+)\/(verify|refund)$/);
        if(journeyMatch){
          const j=activeRide(journeyMatch[1]);
          if(method==="PATCH"&&!journeyMatch[2]){
            if(body.action==="fare")j.fareCents=requiredAmount(body.fare);
            else if(body.action==="end"){j.cashCents=requiredAmount(body.cash===undefined||body.cash===""?"0":body.cash,true);j.endedAt=now;}
            else fail("Choose a valid journey action.");result={id:j.id};
          }else if(method==="POST"&&journeyMatch[2]==="simulate")result=samples(state,j,body.count as number,now);
          else if(method==="POST"&&journeyMatch[2]==="qr"){
            const people=body.passengers;if(typeof people!=="number"||!Number.isSafeInteger(people)||people<1||j.fareCents*people>25000000)fail("Choose a whole passenger count within the KSh 250,000 total limit.");
            const id=uuid(),amountCents=j.fareCents*people;
            const payload=`LipaVerify FARE PREVIEW — not an M-Pesa payment QR\n${j.origin} -> ${j.destination}\nFare per person: KSh ${money(j.fareCents)}\nPassengers: ${people}\nTotal: KSh ${money(amountCents)}\nJourney: ${j.id}\nRequest: ${id}`;
            const svg=await QRCode.toString(payload,{type:"svg",width:360,margin:3,errorCorrectionLevel:"M",color:{dark:"#124b34",light:"#ffffff"}});
            result={id,journeyId:j.id,fareCents:j.fareCents,passengers:people,amountCents,svg,payload,mode:"preview"};
          }else fail("Request not supported.",404);
        }else if(paymentMatch&&method==="POST"){
          const p=payment(paymentMatch[1]);
          if(paymentMatch[2]==="verify"){
            available(p);const fare=p.fareCents??(typeof body.fare==="string"?requiredAmount(body.fare):null),people=suggestedPassengers(p.amountCents,fare);
            const error=coverageError(p.amountCents,fare,people);if(error)fail(error);claim(p,people,fare);result={verified:true};
          }else{
            const amountCents=requiredAmount(body.amount),id=body.requestId;if(typeof id!=="string"||!id)fail("Reopen the refund form.");
            const existing=state.refunds.find(r=>r.id===id);
            if(existing){if(existing.paymentId!==p.id||existing.amountCents!==amountCents)fail("Refund request already used.",409);}
            else{if(amountCents>p.amountCents-refundTotal(state,p.id))fail("Refund exceeds the remaining payment.",409);state.refunds.push({id,paymentId:p.id,amountCents,refundedAt:now});}
            result={refunded:true,mode:"demo-record"};
          }
        }else fail("Request not supported.",404);
      }
      if(options.signal?.aborted)throw new DOMException("Aborted","AbortError");
      if(method!=="GET")save(state);
      return Response.json(result,{headers:{"Cache-Control":"no-store"}});
    }catch(error){
      if(error instanceof DOMException&&error.name==="AbortError")throw error;
      const status=error&&typeof error==="object"&&"status"in error?Number(error.status):422;
      return Response.json({error:error instanceof Error?error.message:"Couldn’t save browser records."},{status});
    }
  }
  return (path:string,options:RequestInit={})=>{
    const run = async (): Promise<Response> => {
      if (globalThis.navigator?.locks?.request) return await globalThis.navigator.locks.request(storageKey, async () => await dispatch(path, options));
      return await dispatch(path, options);
    };
    const pending=queue.then(run,run);queue=pending.catch(()=>undefined);return pending;
  };
}
