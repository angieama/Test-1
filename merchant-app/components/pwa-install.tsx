'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Check,Download,EllipsisVertical,PlusSquare,Share,Smartphone,X} from 'lucide-react';
interface InstallEvent extends Event {prompt():Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>;}
export default function PwaInstall(){
 const [deferred,setDeferred]=useState<InstallEvent|null>(null),[installed,setInstalled]=useState(false),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[ios,setIos]=useState(false),[notice,setNotice]=useState('');
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const mode=window.matchMedia('(display-mode: standalone)');
  const isInstalled=()=>setInstalled(mode.matches||Boolean((navigator as Navigator & {standalone?:boolean}).standalone));
  isInstalled();setIos(/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1));
  const ready=(e:Event)=>{e.preventDefault();setDeferred(e as InstallEvent);};
  const completed=()=>{setInstalled(true);setDeferred(null);setOpen(false);};
  window.addEventListener('beforeinstallprompt',ready);window.addEventListener('appinstalled',completed);mode.addEventListener('change',isInstalled);
  if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{});
  return()=>{window.removeEventListener('beforeinstallprompt',ready);window.removeEventListener('appinstalled',completed);mode.removeEventListener('change',isInstalled);};
 },[]);
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
 async function install(){
  if(!deferred){setOpen(true);return;}
  const prompt=deferred;setDeferred(null);setBusy(true);setNotice('');
  try{await prompt.prompt();const result=await prompt.userChoice;if(result.outcome==='dismissed'){setNotice('You can install later from your browser menu.');setOpen(true);}}
  catch{setOpen(true);setNotice('Use your browser menu to add Lipa Verify to your home screen.');}
  finally{setBusy(false);}
 }
 return <><button className="install-trigger" onClick={()=>installed?setOpen(true):install()} disabled={busy} aria-label={installed?'Mobile app information':'Install mobile app'}>{installed?<Check size={16}/>:<Download size={16}/>}<span>{installed?'App ready':busy?'Opening…':'Install'}</span></button>
 <dialog ref={dialog} className="modal install-modal" aria-labelledby="install-title" onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)}><button className="modal-close icon-button" aria-label="Close install guide" onClick={()=>setOpen(false)}><X size={22}/></button><span className="modal-symbol"><Smartphone size={27}/></span><span className="install-eyebrow">YOUR BIASHARA, ON THE GO</span><h2 id="install-title">Lipa Verify. On your home screen.</h2><p>Open it with one tap, in its own app window. No app store download needed.</p>{notice&&<p className="install-notice" role="status">{notice}</p>}{installed?<div className="install-success"><Check size={20}/><div><b>You’re using the mobile app</b><p>Your app is ready to go.</p></div></div>:<><div className="install-platform"><h3>{ios?'iPhone · Safari':'Android · Chrome'}</h3><ol><li><span>1</span><p>{ios?<>Tap <Share size={15}/> <b>Share</b> in Safari.</>:<>Tap the browser menu <EllipsisVertical size={16}/> in Chrome.</>}</p></li><li><span>2</span><p>Choose <PlusSquare size={15}/> <b>Add to Home Screen</b>{!ios&&' or Install app'}.</p></li><li><span>3</span><p>{ios?<>Keep <b>Open as Web App</b> on if shown, then tap <b>Add</b>.</>:<>Tap <b>Install</b> or <b>Add</b>, then launch Lipa Verify.</>}</p></li></ol></div><details className="other-platform"><summary>{ios?'Using Android instead?':'Using an iPhone instead?'}</summary><p>{ios?'In Chrome, open the menu → Add to Home Screen → Install.':'Open this link in Safari → Share → Add to Home Screen → Add. Keep Open as Web App on if shown.'}</p></details></>}
 <div className="install-footnote">An internet connection is needed to load payments and confirm receipts. This is a demo with sample payments.</div><button className="primary-button" onClick={()=>{if(deferred)install();else setOpen(false);}}>{deferred?'Install Lipa Verify':'Got it'}<ArrowRight size={17}/></button></dialog></>;
}
