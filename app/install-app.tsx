"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Download, ExternalLink, Share2, ShieldCheck, Smartphone, X } from "lucide-react";

type InstallPrompt = Event & {
  prompt: () => Promise<unknown>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type Platform = "android" | "ios" | "desktop";

export default function InstallApp() {
  const [available, setAvailable] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<Platform>("android");
  const [embedded, setEmbedded] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const isInstalled = () => setInstalled(standalone.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
    isInstalled();
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setPlatform(isIOS ? "ios" : /Android/i.test(navigator.userAgent) ? "android" : "desktop");
    setEmbedded(window.self !== window.top);
    const ready = (event: Event) => { event.preventDefault(); setAvailable(event as InstallPrompt); };
    const complete = () => { setInstalled(true); setAvailable(null); setShow(false); };
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", complete);
    standalone.addEventListener("change", isInstalled);
    // Production only: development uses live reload rather than an installed worker.
    if (import.meta.env.PROD && window.isSecureContext && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
        // Installation guidance remains available if this browser blocks workers.
      });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", complete);
      standalone.removeEventListener("change", isInstalled);
    };
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (show) element?.showModal();
    else element?.close();
  }, [show]);

  async function install() {
    if (!available || busy) return;
    const prompt = available;
    setAvailable(null);
    setBusy(true);
    try {
      await prompt.prompt();
      const result = await prompt.userChoice;
      if (result.outcome === "accepted") { setInstalled(true); setShow(false); }
      else setNotice("You can install later from your browser’s menu.");
    } catch { setNotice("Use your browser’s menu to add LipaVerify to your home screen."); }
    finally { setBusy(false); }
  }

  if (installed) return null;

  return <>
    <button className="install-app-button" aria-label="Install LipaVerify on your phone" title="Install LipaVerify" onClick={() => { setNotice(""); setShow(true); }}><Smartphone size={17} /><span>Install app</span></button>
    <dialog ref={dialog} className="dialog install-dialog" aria-labelledby="install-title" onCancel={e => { e.preventDefault(); if (!busy) setShow(false); }} onClick={e => { if (e.target === e.currentTarget && !busy) setShow(false); }}>
      <div className="dialog-body"><div className="dialog-heading"><h2 id="install-title">Your biashara, in your pocket.</h2><button className="icon-button" aria-label="Close install instructions" onClick={() => setShow(false)} disabled={busy}><X size={20} /></button></div>
        <p className="dialog-description">Add LipaVerify to your home screen and open it like an app.</p>
        <div className="install-app-identity"><img src="/icons/icon-192.png" width="56" height="56" alt="" /><div><strong>LipaVerify</strong><span>Merchant payment verification</span><small><ShieldCheck size={11} />Your saved receipt locks, wherever you go</small></div></div>
        <div className="install-benefits"><span><Check size={13} />Home screen icon</span><span><Check size={13} />Opens without browser tabs</span></div>
        {available && !embedded && <button className="button button-primary install-native-button" onClick={() => void install()} disabled={busy}><Download size={17} />{busy ? "Opening installer…" : "Install LipaVerify"}</button>}
        {embedded && <div className="install-open-browser"><p>Open LipaVerify in your phone’s browser to install it.</p><a className="button button-primary" href="/" target="_blank" rel="noopener noreferrer">Open app<ExternalLink size={14} /></a></div>}
        <div className="install-platforms" role="group" aria-label="Choose your device">{([["android", "Android"], ["ios", "iPhone / iPad"], ["desktop", "Computer"]] as const).map(([key, label]) => <button key={key} aria-pressed={platform === key} className={platform === key ? "selected" : ""} onClick={() => setPlatform(key)}>{label}</button>)}</div>
        <ol className="install-steps">{(platform === "ios" ? [<>Open this app in <strong>Safari</strong> and sign in.</>, <>Tap <strong>Share</strong> <Share2 size={13} /> in the browser.</>, <>Choose <strong>Add to Home Screen</strong>, keep <strong>Open as Web App</strong> on if shown, then tap <strong>Add</strong>.</>] : platform === "android" ? [<>Open this app in <strong>Chrome</strong> and sign in.</>, <>Tap the <strong>⋮</strong> menu and choose <strong>Add to Home screen</strong> or <strong>Install app</strong>.</>, <>Tap <strong>Install</strong>, then open <strong>LipaVerify</strong> from your home screen.</>] : [<>Open this app in <strong>Chrome</strong> or <strong>Edge</strong> and sign in.</>, <>Use the browser’s <strong>Install app</strong> option in the address bar or menu.</>, <>Open <strong>LipaVerify</strong> from your apps. On Mac, Safari offers <strong>File → Add to Dock</strong>.</>]).map((step, index) => <li key={index}><span>{index + 1}</span><p>{step}</p></li>)}</ol>
        {notice && <p className="install-notice" role="status">{notice}</p>}
        <p className="install-connection-note"><ShieldCheck size={14} />Keep a connection to refresh and verify payments.</p>
        <button className="button button-outline full-width" onClick={() => setShow(false)} disabled={busy}>Back to payments<ArrowRight size={15} /></button>
      </div>
    </dialog>
  </>;
}
