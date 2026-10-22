"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { controllerUrl, REMOTE_HOST_POLL_MS, type RemoteControllerEvent, type RemoteSessionSnapshot } from "./domain/remote-controller";
import { realtimeControllerUrl, type ControllerTransport } from "./domain/realtime-protocol";
import { RealtimeSocket } from "./realtime-socket";

export type RemoteHostStatus = "off" | "creating" | "waiting" | "pending" | "connected" | "lost" | "error";

export type RemoteHostState = {
  status: RemoteHostStatus;
  qrDataUrl: string;
  pairingUrl: string;
  pendingAdultName: string;
  error: string;
  refreshPairing: () => Promise<void>;
  transport?: ControllerTransport;
  selectTransport?: (transport: ControllerTransport) => Promise<void>;
};

type HostOptions = {
  enabled: boolean;
  sessionId: string;
  childId: string;
  snapshot: RemoteSessionSnapshot | null;
  onCommand: (event: RemoteControllerEvent) => void;
  sessionEnabled?: boolean;
};

const initialState = { status: "off" as RemoteHostStatus, qrDataUrl: "", pairingUrl: "", pendingAdultName: "", error: "" };

function useClassicRemoteSessionHost({ enabled, sessionEnabled, sessionId, childId, snapshot, onCommand }: HostOptions): RemoteHostState {
  const [state, setState] = useState(initialState);
  const latestSequence = useRef(0);
  const commandHandler = useRef(onCommand);
  const snapshotRef = useRef(snapshot);
  const creating = useRef(false);
  commandHandler.current = onCommand;
  snapshotRef.current = snapshot;
  const snapshotPayload = snapshot ? JSON.stringify(snapshot) : "";

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
    if (!snapshotPayload) return;
    const controller = new AbortController();
    void fetch(`/api/controller/session/${encodeURIComponent(sessionId)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "sync", snapshot: snapshotRef.current }),
      signal: controller.signal,
    }).catch(() => undefined);
    return () => controller.abort();
  }, [enabled, sessionId, snapshotPayload, state.pairingUrl]);

  useEffect(() => {
    if (!enabled || !sessionId || !state.pairingUrl) return;
    let cancelled = false;
    let polling = false;
    const poll = async () => {
      if (polling || cancelled) return;
      polling = true;
      try {
        const response = await fetch(`/api/controller/session/${encodeURIComponent(sessionId)}?since=${latestSequence.current}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Stato controller non disponibile.");
        const result = await response.json() as { status: string; connected: boolean; pendingAdultName?: string | null; latestSequence: number; events?: RemoteControllerEvent[] };
        for (const event of result.events ?? []) {
          if (event.serverSequence <= latestSequence.current) continue;
          commandHandler.current(event);
          latestSequence.current = event.serverSequence;
        }
        latestSequence.current = Math.max(latestSequence.current, result.latestSequence ?? 0);
        setState((current) => {
          const status = result.status === "pending" ? "pending" : result.connected ? "connected" : result.status === "connected" ? "lost" : "waiting";
          const pendingAdultName = result.pendingAdultName ?? "";
          return current.status === status && current.pendingAdultName === pendingAdultName && !current.error
            ? current
            : { ...current, status, pendingAdultName, error: "" };
        });
      } catch {
        setState((current) => current.status === "connected" ? { ...current, status: "lost" } : current);
      } finally {
        polling = false;
      }
    };
    void poll();
    const timer = window.setInterval(poll, REMOTE_HOST_POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [enabled, sessionId, state.pairingUrl]);

  useEffect(() => {
    if ((sessionEnabled ?? enabled) || !sessionId) return;
    void fetch(`/api/controller/session/${encodeURIComponent(sessionId)}`, { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "close" }) }).catch(() => undefined);
  }, [enabled, sessionEnabled, sessionId]);

  return { ...state, refreshPairing: createPairing };
}

function useDurableRemoteSessionHost({ enabled, sessionEnabled, sessionId, childId, snapshot, onCommand }: HostOptions): RemoteHostState {
  const [state, setState] = useState(initialState);
  const socket = useRef<RealtimeSocket | null>(null);
  const latestSequence = useRef(0);
  const current = useRef({ snapshot, onCommand });
  current.current = { snapshot, onCommand };
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
      if (!response.ok) throw new Error("Realtime DO non disponibile. Puoi scegliere la modalità Classico.");
      const result = await response.json() as { token: string; latestSequence?: number };
      const url = realtimeControllerUrl(window.location.origin, result.token, sessionId);
      const qrDataUrl = await QRCode.toDataURL(url, { width: 260, margin: 1, errorCorrectionLevel: "M" });
      if (attempt !== generation.current) return;
      latestSequence.current = result.latestSequence ?? 0;
      setState({ status: "waiting", pairingUrl: url, qrDataUrl, pendingAdultName: "", error: "" });
      socket.current = new RealtimeSocket({ sessionId, role: "host", since: () => latestSequence.current,
        onConnection: (connected, reason) => {
          if (attempt !== generation.current) return;
          if (connected) { const saved = current.current.snapshot; if (saved) socket.current?.send({ type: "sync", snapshot: saved }); }
          else setState((old) => ({ ...old, status: reason ? "error" : "lost", error: reason ? "Collegamento DO terminato. Genera un nuovo QR." : "" }));
        },
        onMessage: (message) => {
          if (attempt !== generation.current) return;
          if (message.type === "events") for (const event of message.events) {
            if (event.serverSequence <= latestSequence.current) continue;
            flushSync(() => current.current.onCommand(event));
            latestSequence.current = event.serverSequence;
          }
          if (message.type === "state") setState((old) => {
            const status = message.connected ? "connected" : message.status === "connected" ? "lost" : "waiting";
            return old.status === status && !old.error ? old : { ...old, status, error: "" };
          });
        },
      });
    } catch (error) {
      if (attempt === generation.current) setState((old) => ({ ...old, status: "error", error: error instanceof Error ? error.message : "Realtime DO non disponibile" }));
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
    if ((sessionEnabled ?? enabled) || !sessionId || usedSession.current !== sessionId) return;
    void fetch("/api/controller/realtime", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "close", role: "host", sessionId }) }).catch(() => undefined);
  }, [enabled, sessionEnabled, sessionId]);
  return { ...state, refreshPairing: createPairing };
}

export function useRemoteSessionHost(options: HostOptions): RemoteHostState {
  const [choice, setChoice] = useState<{ sessionId: string; transport: ControllerTransport }>({ sessionId: "", transport: "classic" });
  const [switching, setSwitching] = useState(false);
  const transport = choice.sessionId === options.sessionId ? choice.transport : "classic";
  const classic = useClassicRemoteSessionHost({ ...options, sessionEnabled: options.enabled, enabled: options.enabled && transport === "classic" });
  const durable = useDurableRemoteSessionHost({ ...options, sessionEnabled: options.enabled, enabled: options.enabled && transport === "do" });
  const selected = transport === "do" ? durable : classic;
  const selectTransport = async (next: ControllerTransport) => {
    if (next === transport || switching || selected.status === "creating") return;
    setSwitching(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6_500);
      try {
        if (selected.status === "error" && !selected.pairingUrl) {
          setChoice({ sessionId: options.sessionId, transport: next });
          return;
        }
        const response = await fetch(transport === "classic" ? `/api/controller/session/${encodeURIComponent(options.sessionId)}` : "/api/controller/realtime", {
          method: "POST", signal: controller.signal, headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "close", role: "host", sessionId: options.sessionId }),
        });
        if (!response.ok && response.status !== 404) return;
      } finally { clearTimeout(timer); }
      setChoice({ sessionId: options.sessionId, transport: next });
    } catch { /* Keep the selected transport if closing it failed. */ }
    finally { setSwitching(false); }
  };
  return { ...selected, status: switching ? "creating" : selected.status, transport, selectTransport };
}
