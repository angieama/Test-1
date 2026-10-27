"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, requestJson } from "@/lib/client-api";
import type { Journey, Payment, SavedRoute } from "@/lib/payment-types";

type LedgerResponse = { payments: Payment[]; journeys: Journey[]; routes: SavedRoute[]; serverTime: number };

/** Owns polling, cancellation and clock synchronization independently of the screens. */
export function usePaymentLedger(local = false) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [selectedJourneyId, setSelectedJourneyId] = useState("all");
  const [now, setNow] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [offline, setOffline] = useState(false);
  const selectedRef = useRef("all");
  const initialized = useRef(false);
  const offset = useRef(0);
  const sequence = useRef(0);
  const request = useRef<AbortController | null>(null);

  const loadPayments = useCallback(async (journeyId = selectedRef.current): Promise<boolean> => {
    const seq = ++sequence.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    const started = Date.now();
    try {
      const path = "/api/payments" + (journeyId === "all" ? "" : "?journey=" + encodeURIComponent(journeyId));
      const data = await requestJson<LedgerResponse>(path, { signal: controller.signal });
      if (seq !== sequence.current) return false;
      offset.current = data.serverTime - (started + Date.now()) / 2;
      setNow(Date.now() + offset.current);
      setPayments(data.payments);
      setJourneys(data.journeys);
      setRoutes(data.routes ?? []);
      setError(""); setUnauthorized(false); setLoaded(true);
      if (!initialized.current) {
        initialized.current = true;
        const active = data.journeys.find(j => j.endedAt === null);
        if (active) {
          selectedRef.current = active.id; setSelectedJourneyId(active.id);
          return await loadPayments(active.id);
        }
      }
      return true;
    } catch (error) {
      if (controller.signal.aborted || seq !== sequence.current) return false;
      setUnauthorized(error instanceof ApiError && error.status === 401);
      setError(error instanceof Error ? error.message : "Reconnect to refresh your payments.");
      return false;
    } finally {
      if (seq === sequence.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const refresh = () => { if (!document.hidden && (local || navigator.onLine)) void loadPayments(); };
    const connected = () => { setOffline(false); refresh(); };
    const disconnected = () => {
      if (local) { refresh(); return; }
      sequence.current++; request.current?.abort(); setRefreshing(false);
      setOffline(true); setError("You’re offline. Reconnect to refresh and verify payments.");
    };
    if (local || navigator.onLine) void loadPayments(); else disconnected();
    const poll = window.setInterval(refresh, 15000);
    const clock = window.setInterval(() => setNow(Date.now() + offset.current), 5000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => {
      sequence.current++; request.current?.abort();
      clearInterval(poll); clearInterval(clock);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
    };
  }, [loadPayments, local]);

  const selectJourney = useCallback((journeyId: string) => {
    selectedRef.current = journeyId;
    setSelectedJourneyId(journeyId);
  }, []);

  return { payments, journeys, routes, selectedJourneyId, selectJourney,
    now, loaded, refreshing, error, unauthorized, offline, loadPayments };
}
