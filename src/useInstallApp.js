import { useEffect, useRef, useState } from 'react';

export function useInstallApp() {
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const [installed, setInstalled] = useState(standalone);
  const [canPrompt, setCanPrompt] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);
  const deferredPrompt = useRef(null);
  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const onPrompt = event => { event.preventDefault(); deferredPrompt.current = event; setCanPrompt(true); };
    const onInstalled = () => { deferredPrompt.current = null; setCanPrompt(false); setInstalled(true); };
    const onDisplayMode = () => setInstalled(standalone());
    const onConnection = () => setOnline(navigator.onLine);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', onConnection);
    window.addEventListener('offline', onConnection);
    media.addEventListener('change', onDisplayMode);
    let disposed = false;
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .then(() => navigator.serviceWorker.ready)
        .then(() => { if (!disposed) setOfflineReady(true); })
        .catch(error => console.warn('Offline demo setup is unavailable:', error.message));
    }
    return () => {
      disposed = true;
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', onConnection);
      window.removeEventListener('offline', onConnection);
      media.removeEventListener('change', onDisplayMode);
    };
  }, []);
  async function promptInstall() {
    const event = deferredPrompt.current;
    if (!event) return 'unavailable';
    deferredPrompt.current = null;
    setCanPrompt(false);
    try {
      // Must run directly from the user's tap, before any other asynchronous work.
      await event.prompt();
      const { outcome } = await event.userChoice;
      return outcome;
    } catch { return 'unavailable'; }
  }
  return { installed, canPrompt, online, offlineReady, promptInstall };
}
