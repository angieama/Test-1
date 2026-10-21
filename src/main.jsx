import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownLeft, ArrowRight, Check, CheckCheck, Download, CircleHelp, Clock3, Edit3, Filter, LayoutDashboard, LockKeyhole, Moon, Plus, QrCode, Search, ShieldCheck, Smartphone, Sun, TicketCheck, X, Zap } from 'lucide-react';
import { useInstallApp } from './useInstallApp';
import mockData from './mock-transactions.json';
import { filterTransactions, lockTransaction, money, parseFare, TIME_RANGES } from './domain';
import './styles.css';
const STORAGE = 'lipa-verify-demo-v1';
function initialState() {
  try { const raw = JSON.parse(localStorage.getItem(STORAGE)); if(raw?.version === 1 && Array.isArray(raw.transactions) && Number.isFinite(raw.fare) && raw.claims && typeof raw.claims === 'object') return raw; } catch {}
  const now = Date.now();
  return { version:1, fare:100, updatedAt:now, transactions:mockData.map(({ minutesAgo, ...tx }) => ({ ...tx, receivedAt:now - minutesAgo * 60000 })), claims:{} };
}
const clock = timestamp => new Intl.DateTimeFormat('en-KE', {hour:'2-digit', minute:'2-digit', hour12:true, timeZone:'Africa/Nairobi'}).format(timestamp);
function Modal({ title, children, onClose }) {
 const ref = useRef(null);
 useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close(); }, []);
 return <dialog ref={ref} aria-label={title} onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}} className="modal"><div className="flex items-center justify-between mb-6"><h2 className="text-xl font-bold">{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={21}/></button></div>{children}</dialog>;
}
function App() {
 const install = useInstallApp();
 const [installBusy,setInstallBusy] = useState(false);
 async function installApp() {
   if(installBusy)return;
   if(!install.canPrompt){setModal('install');return;}
   setInstallBusy(true);
   const result=await install.promptInstall();
   setInstallBusy(false);
   if(result==='accepted'){setModal(null);setToast('Installation accepted. Look for LipaVerify on your home screen.');}
   else if(result==='unavailable')setModal('install');
 }

 const [state,setState] = useState(initialState);
 const [view,setView] = useState('payments');
 const [range,setRange] = useState('30');
 const [query,setQuery] = useState('');
 const [status,setStatus] = useState('all');
 const [now,setNow] = useState(Date.now());
 const [modal,setModal] = useState(null);
 const [fareDraft,setFareDraft] = useState('100');
 const [fareError,setFareError] = useState('');
 const [toast,setToast] = useState('');
 const [dark,setDark] = useState(false);
 const [stream,setStream] = useState(false);
 const stateRef = useRef(state);
 useEffect(()=>{ stateRef.current = state; },[state]);
 useEffect(()=>{const interval=setInterval(()=>setNow(Date.now()),10000);return()=>clearInterval(interval);},[]);
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),4000);return()=>clearTimeout(t);},[toast]);
 useEffect(()=>{const sync=e=>{if(e.key===STORAGE){try{const next=JSON.parse(e.newValue);if(next?.version===1){stateRef.current=next;setState(next);}}catch{}}};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
 function commit(next) {
   try { localStorage.setItem(STORAGE,JSON.stringify(next)); stateRef.current=next;setState(next);return true; }
   catch { setToast('Could not save. Enable browser storage and try again.');return false; }
 }
 function addPayment() {
   const current=stateRef.current; const time=Date.now(); const index=current.transactions.length % mockData.length;
   const tx={ id:`DEMO${time.toString(36).toUpperCase()}${Math.random().toString(36).slice(2,5).toUpperCase()}`, name:mockData[index].name, amount:current.fare, receivedAt:time };
   if(commit({...current, transactions:[tx,...current.transactions]})){setNow(time);setToast(`Demo payment received · KSh ${money(tx.amount)}`);}
 }
 useEffect(()=>{if(!stream)return;const t=setInterval(addPayment,18000);return()=>clearInterval(t);},[stream]);
 const matching = useMemo(()=>filterTransactions(state.transactions,{fare:state.fare,range,now}),[state.transactions,state.fare,range,now]);
 const visible = useMemo(()=>filterTransactions(state.transactions,{fare:state.fare,range,query,status,claims:state.claims,now}),[state,range,query,status,now]);
 const claimed = matching.filter(t=>state.claims[t.id]).length;
 const unclaimed = matching.length-claimed;
 function claim(tx) {
   let current=stateRef.current;
   // Re-read before writing to reduce stale state in multiple tabs. A server must enforce atomic locks in production.
   try {const persisted=JSON.parse(localStorage.getItem(STORAGE));if(persisted?.version===1)current=persisted;}catch{}
   if(current.claims[tx.id]){setState(current);setToast('This receipt has already been claimed.');return;}
   const next={...current,claims:lockTransaction(current.claims,tx)};
   if(commit(next)){navigator.vibrate?.([35,25,55]);setToast(`${tx.name.trim().split(/\s+/)[0]} · payment claimed`);}
 }
 function saveFare(e) {
   e.preventDefault();const fare=parseFare(fareDraft);
   if(fare===null){setFareError('Enter a valid amount between KSh 0.01 and 250,000.');return;}
   if(commit({...stateRef.current,fare,updatedAt:Date.now()})){setModal(null);setToast(`Active fare updated to KSh ${money(fare)}`);}
 }
 return <div className={`app view-${view}${dark?' dark-mode':''}`}>

  <div className="main-shell">
   <header className="topbar"><div className="mobile-brand"><span className="brand-icon"><CheckCheck size={24}/></span><div><b>LipaVerify</b><small>MERCHANT MINI APP</small></div></div><div className="flex items-center gap-2"><span className="demo-badge"><span/>Demo</span><button className="icon-button" onClick={()=>setDark(!dark)} aria-label={dark?'Use light theme':'Use dark theme'}>{dark?<Sun size={21}/>:<Moon size={21}/>}</button></div></header>
   <main id="payments">
    <div className="page-heading"><div><div className="eyebrow">LIPA NA M-PESA</div><h1>{view==='overview'?'Your payment overview':'Verify payments'}</h1><p>{view==='overview'?'A quick look at your current fare and window.':'Find the name. Check the code. Tick it off.'}</p></div></div>
    {!install.online&&<div className="offline-banner" role="status"><CircleHelp size={18}/><span>Offline demo · Live payment verification needs internet.</span></div>}
    {!install.installed&&<section className="install-banner" aria-label="Install LipaVerify"><span className="install-mark"><Download size={21}/></span><div><strong>Keep LipaVerify on your phone</strong><p>Open it from your home screen.</p></div><button onClick={installApp} disabled={installBusy}>{installBusy?'Opening…':'Install app'}</button></section>}
    <div className="overview-grid">
     <section className="fare-card" aria-label="Current active fare"><div className="fare-top"><span className="flex items-center gap-2"><TicketCheck size={19}/> CURRENT ACTIVE FARE</span><span className="active-label"><span/>Active</span></div><div className="fare-body"><div className="fare-amount"><span>KSh</span> {money(state.fare)}</div><button className="edit-fare" onClick={()=>{setFareDraft(String(state.fare));setFareError('');setModal('fare');}}><Edit3 size={17}/> Change fare</button></div><div className="fare-footer"><div><QrCode size={16}/><span>Filtering by your active fare</span></div><span>Updated {clock(state.updatedAt)}</span></div><div className="fare-watermark"><QrCode size={180} strokeWidth={1}/></div></section>

    </div>
    <div className="content-grid"><section className="payments-panel">
      <div className="feed-title"><div className="flex items-center gap-3"><span className="section-icon"><ArrowDownLeft size={20}/></span><div><h2>Incoming payments</h2><p>Only payments of <strong>KSh {money(state.fare)}</strong></p></div></div><span className="matched-badge">{matching.length} matched</span></div>
      <div className="filters"><div className="range-row"><span className="filter-label"><Clock3 size={15}/> Time range</span><div className="time-chips" aria-label="Payment time range">{TIME_RANGES.map(r=><button key={r.id} aria-pressed={range===r.id} className={range===r.id?'chip selected':'chip'} onClick={()=>setRange(r.id)}>{r.label}</button>)}</div></div><div className="search-box"><Search size={20}/><input aria-label="Search customer name" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search first name…" autoComplete="off"/>{query?<button aria-label="Clear search" onClick={()=>setQuery('')}><X size={18}/></button>:<span className="search-hint">Find a payment</span>}</div></div>
      <div className="status-tabs" aria-label="Claim status">{[['all','All payments',matching.length],['unclaimed','Unclaimed',unclaimed],['claimed','Claimed',claimed]].map(([id,label,count])=><button key={id} onClick={()=>setStatus(id)} className={id===status?'selected':''} aria-pressed={id===status}>{label}<span>{count}</span></button>)}</div>
      <div className="list-heading"><span>FIRST NAME / TRANSACTION CODE</span><span>VERIFY</span></div>
      <div className="transaction-list">{visible.length?visible.map(tx=>{
       const locked=state.claims[tx.id];
       const firstName=tx.name.trim().split(/\s+/)[0];
       return <article className={`transaction ${locked?'is-claimed':''}`} key={tx.id}><div className="transaction-person"><h3>{firstName}</h3><div className="transaction-meta"><span>{tx.id}</span></div>{locked&&<small className="claim-stamp"><LockKeyhole size={10}/> Claimed</small>}</div><button className={locked?'claim-button locked':'claim-button'} disabled={!!locked} aria-label={locked?`${firstName} payment already claimed`:`Claim ${firstName}'s payment`} onClick={()=>claim(tx)}>{locked?<CheckCheck size={21}/>:<Check size={23}/>}<span>{locked?'Claimed':'Tick off'}</span></button></article>;
      }):<div className="empty-state"><Search size={32}/><h3>No matching payments</h3><p>{query?`No customer matches “${query}”.`:status==='claimed'?'Claimed payments will appear here.':'Try a longer time range or add a demo payment.'}</p><button onClick={()=>{setQuery('');setStatus('all');setRange('today');}} className="text-link">Clear filters <ArrowRight size={16}/></button></div>}</div>
      <div className="feed-footer"><ShieldCheck size={14}/><span>Ticked-off receipts stay locked to the paying customer.</span></div>
     </section>
     <aside className="right-rail"><section className="summary-card"><div className="rail-title"><h2>At a glance</h2><span>{TIME_RANGES.find(r=>r.id===range).label}</span></div><div className="summary-value"><small>Matching payments</small><strong><span>KSh</span> {money(matching.reduce((s,t)=>s+t.amount,0))}</strong></div><div className="summary-stats"><div><span className="stat-dot green"/>Claimed<strong>{claimed}</strong></div><div><span className="stat-dot amber"/>To verify<strong>{unclaimed}</strong></div></div><div className="progress-track"><div style={{width:`${matching.length?claimed/matching.length*100:0}%`}}/></div><p className="progress-caption">{claimed} of {matching.length} payments accounted for</p></section>

      <section className="demo-controls"><div className="rail-title"><h2>Try a payment</h2><span className="tiny-badge">SANDBOX</span></div><p>Add a mock payment at your active fare and watch it appear.</p><button className="add-payment" onClick={addPayment}><Plus size={18}/> Add demo payment</button><label className="stream-toggle"><span>Auto-play demo stream<small>A payment every 18 seconds</small></span><input type="checkbox" checked={stream} onChange={e=>setStream(e.target.checked)}/><span className="switch"/></label></section>
     </aside></div>
     <footer className="page-footer"><span><ShieldCheck size={15}/> Demo only · Mock M-Pesa payments</span></footer>
   </main>
  </div>
  <nav className="bottom-nav" aria-label="Main navigation"><button aria-current={view==='payments'?'page':undefined} className={view==='payments'?'selected':''} onClick={()=>{setView('payments');window.scrollTo({top:0});}}><CheckCheck size={23}/><span>Payments</span></button><button aria-current={view==='overview'?'page':undefined} className={view==='overview'?'selected':''} onClick={()=>{setView('overview');window.scrollTo({top:0});}}><LayoutDashboard size={22}/><span>Overview</span></button><button onClick={()=>setModal('help')}><CircleHelp size={22}/><span>Help</span></button></nav>
  {toast&&<div className="toast" role="status"><CheckCheck size={20}/>{toast}</div>}
  {modal==='install'&&<Modal title="Install LipaVerify" onClose={()=>setModal(null)}><div className="install-hero"><span className="brand-icon"><CheckCheck size={36}/></span><h3>Your payments. One tap away.</h3><p>Add the app to your home screen and open it in its own window.</p></div>{install.canPrompt?<button className="primary-button" disabled={installBusy} onClick={installApp}><Download size={19}/>{installBusy?'Opening installer…':'Install on this device'}</button>:<><div className="install-platform"><h3>Android</h3><p>Open this page in Chrome. Tap the browser menu <strong>⋮</strong>, then <strong>Install app</strong> or <strong>Add to Home screen</strong>, and confirm.</p></div><div className="install-platform"><h3>iPhone / iPad</h3><p>Open this page in Safari. Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</p></div><p className="install-browser-note">Using an in-app browser? Open this page in your phone’s main browser first. You may need to sign in to access this private prototype. Installation options depend on your browser.</p></>}<div className="integration-note"><ShieldCheck size={18}/><p>This installs the web app on your device. It uses mock payments. {install.offlineReady?'The demo is saved for offline use.':'Open it online once to prepare the offline demo.'} Real payment confirmation requires an online backend connection.</p></div><button className="primary-button secondary-button" onClick={()=>setModal(null)}>Done <Check size={18}/></button></Modal>}
  {modal==='fare'&&<Modal title="Change active fare" onClose={()=>setModal(null)}><p className="modal-copy">The payment feed will immediately match your new fare.</p><form onSubmit={saveFare}><label className="field-label" htmlFor="fare">Amount in KSh</label><div className="fare-input"><span>KSh</span><input autoFocus id="fare" inputMode="decimal" value={fareDraft} onChange={e=>{setFareDraft(e.target.value);setFareError('');}} aria-describedby={fareError?'fare-error':undefined}/></div><div className="fare-presets">{[50,100,150,200].map(n=><button type="button" key={n} onClick={()=>{setFareDraft(String(n));setFareError('');}} className={String(n)===fareDraft?'chip selected':'chip'}>{n}</button>)}</div>{fareError&&<p className="error" id="fare-error" role="alert">{fareError}</p>}<div className="integration-note"><QrCode size={18}/><p>Demo: this updates your local filter. Customer QR payment prompts require a connected merchant backend.</p></div><button type="submit" className="primary-button">Set active fare <ArrowRight size={18}/></button></form></Modal>}
  {modal==='qr'&&<Modal title="One sticker. A flexible fare." onClose={()=>setModal(null)}><div className="modal-symbol"><QrCode size={40}/></div><p className="modal-copy">The physical QR should point to a merchant payment page that looks up the latest fare from your server before requesting payment.</p><ol className="steps"><li><b>Set the fare</b><span>The merchant updates the amount.</span></li><li><b>Scan the same sticker</b><span>The customer page fetches the current fare.</span></li><li><b>Pay and verify</b><span>A confirmed payment enters this feed.</span></li></ol><div className="integration-note"><CircleHelp size={18}/><p>This prototype uses mock payments. A standard static M-Pesa QR does not change when you edit this local fare.</p></div><button className="primary-button" onClick={()=>setModal(null)}>Got it <Check size={18}/></button></Modal>}
  {modal==='help'&&<Modal title="Confirm a payment in seconds" onClose={()=>setModal(null)}><ol className="steps"><li><b>Set your active fare</b><span>Use Change fare. The amount filter updates automatically.</span></li><li><b>Find the customer</b><span>Select a time range, then search their name.</span></li><li><b>Tick it off</b><span>The receipt locks to the sender and stays claimed on this browser.</span></li></ol><p className="modal-copy">The summary follows the fare and time range. Name search and status tabs only narrow the list.</p><div className="integration-note"><ShieldCheck size={18}/><p>Demo locks use browser storage. Production needs authenticated, atomic server-side claims shared across all merchant devices.</p></div><button className="add-payment help-install" onClick={()=>setModal('install')}><Download size={18}/>{install.installed?'App installation info':'Install LipaVerify'}</button><button className="primary-button" onClick={()=>setModal(null)}>Ready to verify <ArrowRight size={18}/></button></Modal>}
 </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
