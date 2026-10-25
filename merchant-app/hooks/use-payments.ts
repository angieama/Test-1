'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { nextPaymentUpdateAt, type Payment } from '../lib/payment-model';
import { SingleFlight } from '../lib/single-flight';
import type { Ride } from '../lib/ride-model';
type PaymentsResponse = { payments: Payment[]; rides: Ride[]; serverTime: number; error?: string };
export function usePayments() {
  const [rides, setRides] = useState<Ride[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  const [lastSync, setLastSync] = useState(0);
  const requests = useRef(new SingleFlight<void>());
  const load = useCallback((silent = false, force = false) => requests.current.run(async signal => {
    if (signal.aborted) return;
    if (!silent) setLoading(true);
    try {
      const response = await fetch('/api/transactions', { cache: 'no-store', signal });
      const data = await response.json() as PaymentsResponse;
      if (!response.ok) throw new Error(data.error || 'Could not load payments.');
      if (signal.aborted) return;
      setPayments(data.payments);
      setRides(data.rides);
      setOffset(data.serverTime - Date.now());
      setNow(data.serverTime);
      setLastSync(data.serverTime);
      setError('');
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not connect. Please retry.');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, force), []);
  useEffect(() => {
    const reconnect = () => { setOnline(true); void load(true); };
    const disconnect = () => setOnline(false);
    const resume = () => { if (document.visibilityState === 'visible' && navigator.onLine) void load(true); };
    setOnline(navigator.onLine);
    if (navigator.onLine) void load(); else { setLoading(false); setError('Reconnect to load payments.'); }
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', disconnect);
    document.addEventListener('visibilitychange', resume);
    const poll = setInterval(resume, 15_000);
    return () => {
      clearInterval(poll); requests.current.cancel();
      window.removeEventListener('online', reconnect);
      window.removeEventListener('offline', disconnect);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [load]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const time = Date.now() + offset;
      setNow(time);
      const next = nextPaymentUpdateAt(payments, time);
      if (next !== null) timer = setTimeout(tick, Math.max(1, next - time));
    };
    tick();
    return () => clearTimeout(timer);
  }, [payments, offset]);
  return { rides, payments, setPayments, online, loading, error, now, lastSync, load };
}
