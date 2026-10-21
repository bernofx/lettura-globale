"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { controllerUrl, type RemoteControllerEvent, type RemoteSessionSnapshot } from "./domain/remote-controller";

export type RemoteHostStatus = "off" | "creating" | "waiting" | "pending" | "connected" | "lost" | "error";

export type RemoteHostState = {
  status: RemoteHostStatus;
  qrDataUrl: string;
  pairingUrl: string;
  pendingAdultName: string;
  error: string;
  approve: () => Promise<void>;
  refreshPairing: () => Promise<void>;
};

type HostOptions = {
  enabled: boolean;
  sessionId: string;
  childId: string;
  snapshot: RemoteSessionSnapshot | null;
  onCommand: (event: RemoteControllerEvent) => void;
};

const initialState = { status: "off" as RemoteHostStatus, qrDataUrl: "", pairingUrl: "", pendingAdultName: "", error: "" };

export function useRemoteSessionHost({ enabled, sessionId, childId, snapshot, onCommand }: HostOptions): RemoteHostState {
  const [state, setState] = useState(initialState);
  const latestSequence = useRef(0);
  const commandHandler = useRef(onCommand);
  const snapshotRef = useRef(snapshot);
  const creating = useRef(false);
  commandHandler.current = onCommand;
  snapshotRef.current = snapshot;

  const createPairing = useCallback(async () => {
    const currentSnapshot = snapshotRef.current;
    if (!enabled || !sessionId || !childId || !currentSnapshot || creating.current) return;
    creating.current = true;
    setState((current) => ({ ...current, status: "creating", error: "" }));
    try {
      const response = await fetch("/api/controller/pairing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", sessionId, childId, snapshot: currentSnapshot }) });
      if (!response.ok) throw new Error(response.status === 503 ? "La migrazione realtime non è ancora disponibile." : "Impossibile creare il collegamento.");
      const result = await response.json() as { token: string };
      const url = controllerUrl(window.location.origin, result.token);
      const qrDataUrl = await QRCode.toDataURL(url, { width: 260, margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b3a6d", light: "#ffffff" } });
      latestSequence.current = 0;
      setState({ status: "waiting", qrDataUrl, pairingUrl: url, pendingAdultName: "", error: "" });
    } catch (error) {
      setState((current) => ({ ...current, status: "error", error: error instanceof Error ? error.message : "Collegamento non disponibile." }));
    } finally {
      creating.current = false;
    }
  }, [childId, enabled, sessionId]);

  useEffect(() => {
    if (!enabled) { setState(initialState); return; }
    void createPairing();
  }, [createPairing, enabled]);

  useEffect(() => {
    if (!enabled || !sessionId || !state.pairingUrl) return;
    let cancelled = false;
    let polling = false;
    const poll = async () => {
      if (polling || cancelled) return;
      polling = true;
      try {
        const currentSnapshot = snapshotRef.current;
        if (currentSnapshot) await fetch(`/api/controller/session/${encodeURIComponent(sessionId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "sync", snapshot: currentSnapshot }) });
        const response = await fetch(`/api/controller/session/${encodeURIComponent(sessionId)}?since=${latestSequence.current}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Stato controller non disponibile.");
        const result = await response.json() as { status: string; connected: boolean; pendingAdultName?: string | null; latestSequence: number; events?: RemoteControllerEvent[] };
        for (const event of result.events ?? []) {
          if (event.serverSequence <= latestSequence.current) continue;
          commandHandler.current(event);
          latestSequence.current = event.serverSequence;
        }
        latestSequence.current = Math.max(latestSequence.current, result.latestSequence ?? 0);
        setState((current) => ({
          ...current,
          status: result.status === "pending" ? "pending" : result.connected ? "connected" : result.status === "connected" ? "lost" : "waiting",
          pendingAdultName: result.pendingAdultName ?? "",
          error: "",
        }));
      } catch {
        setState((current) => ({ ...current, status: current.status === "connected" ? "lost" : current.status }));
      } finally {
        polling = false;
      }
    };
    void poll();
    const timer = window.setInterval(poll, 1_250);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [enabled, sessionId, state.pairingUrl]);

  useEffect(() => {
    if (enabled || !sessionId) return;
    void fetch(`/api/controller/session/${encodeURIComponent(sessionId)}`, { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "close" }) }).catch(() => undefined);
  }, [enabled, sessionId]);

  const approve = useCallback(async () => {
    try {
      const response = await fetch(`/api/controller/session/${encodeURIComponent(sessionId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approve" }) });
      if (!response.ok) throw new Error("Impossibile approvare questo telefono.");
    } catch (error) {
      setState((current) => ({ ...current, status: "error", error: error instanceof Error ? error.message : "Impossibile approvare questo telefono." }));
    }
  }, [sessionId]);

  return { ...state, approve, refreshPairing: createPairing };
}
