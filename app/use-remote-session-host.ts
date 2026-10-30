"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { RemoteControllerEvent, RemoteSessionSnapshot } from "./domain/remote-controller";
import { realtimeControllerUrl } from "./domain/realtime-protocol";
import { RealtimeSocket } from "./realtime-socket";

export type RemoteHostStatus = "off" | "creating" | "waiting" | "pending" | "connected" | "lost" | "error";
export type RemoteHostState = {
  status: RemoteHostStatus;
  qrDataUrl: string;
  pairingUrl: string;
  pendingAdultName: string;
  error: string;
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

function closePairing(sessionId: string) {
  return fetch("/api/controller/realtime", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "close", role: "host", sessionId }) }).catch(() => undefined);
}

/** One DO and one lease survive ready -> active, without a second scan. */
export function useRemoteSessionHost({ enabled, sessionId, childId, snapshot, onCommand }: HostOptions): RemoteHostState {
  const [state, setState] = useState(initialState);
  const socket = useRef<RealtimeSocket | null>(null);
  const latestSequence = useRef(0);
  const current = useRef({ snapshot, onCommand, enabled, sessionId });
  current.current = { snapshot, onCommand, enabled, sessionId };
  const generation = useRef(0);
  const usedSession = useRef("");
  const createPairing = useCallback(async () => {
    if (!enabled || !sessionId || !childId || !current.current.snapshot) return;
    usedSession.current = sessionId;
    const attempt = ++generation.current;
    setState((old) => ({ ...old, status: "creating", error: "" }));
    socket.current?.stop();
    try {
      const response = await fetch("/api/controller/realtime", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", sessionId, childId, snapshot: current.current.snapshot }) });
      if (!response.ok) throw new Error("Collegamento Realtime non disponibile. Riprova o inizia dal PC.");
      const result = await response.json() as { token: string; latestSequence?: number };
      const url = realtimeControllerUrl(window.location.origin, result.token, sessionId);
      const qrDataUrl = await QRCode.toDataURL(url, { width: 260, margin: 1, errorCorrectionLevel: "M" });
      if (attempt !== generation.current) {
        // Back can be pressed while create is still in flight; close after it completes too.
        if (!current.current.enabled || current.current.sessionId !== sessionId) void closePairing(sessionId);
        return;
      }
      latestSequence.current = result.latestSequence ?? 0;
      setState({ status: "waiting", pairingUrl: url, qrDataUrl, pendingAdultName: "", error: "" });
      socket.current = new RealtimeSocket({ sessionId, role: "host", since: () => latestSequence.current,
        onConnection: (connected, reason) => {
          if (attempt !== generation.current) return;
          if (connected) { const saved = current.current.snapshot; if (saved) socket.current?.send({ type: "sync", snapshot: saved }); }
          else setState((old) => ({ ...old, status: reason ? "error" : "lost", error: reason ? "Collegamento terminato. Genera un nuovo QR." : "" }));
        },
        onMessage: (message) => {
          if (attempt !== generation.current) return;
          if (message.type === "events") for (const event of message.events) {
            if (event.serverSequence <= latestSequence.current) continue;
            const connection = socket.current;
            const started = performance.now();
            flushSync(() => current.current.onCommand(event));
            latestSequence.current = event.serverSequence;
            connection?.send({ type: "applied", clientEventId: event.clientEventId, serverSequence: event.serverSequence, hostMs: Math.round(performance.now() - started) });
          }
          if (message.type === "state") setState((old) => {
            const status = message.connected ? "connected" : message.status === "connected" ? "lost" : "waiting";
            return old.status === status && !old.error ? old : { ...old, status, error: "" };
          });
        },
      });
    } catch (error) {
      if (attempt === generation.current) setState((old) => ({ ...old, status: "error", error: error instanceof Error ? error.message : "Realtime non disponibile" }));
    }
  }, [enabled, sessionId, childId]);
  useEffect(() => {
    if (enabled) void createPairing();
    else setState(initialState);
    return () => { generation.current += 1; socket.current?.stop(); socket.current = null; };
  }, [enabled, createPairing]);
  const payload = snapshot ? JSON.stringify(snapshot) : "";
  useEffect(() => { const saved = current.current.snapshot; if (enabled && saved) socket.current?.send({ type: "sync", snapshot: saved }); }, [enabled, payload]);
  useEffect(() => {
    if (enabled || !sessionId || usedSession.current !== sessionId) return;
    void closePairing(sessionId);
  }, [enabled, sessionId]);
  return { ...state, refreshPairing: createPairing };
}
