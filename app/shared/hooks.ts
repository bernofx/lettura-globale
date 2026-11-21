import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { type RemoteControllerEvent } from "../domain/remote-controller";
import { type RemoteHostState } from "../use-remote-session-host";

const REMOTE_COMPONENT_EVENT = "lg:remote-controller-command";

type AudioVolumeControl = { volume: number; setVolume: (volume: number) => void };

export const AudioVolumeContext = createContext<AudioVolumeControl>({ volume: 100, setVolume: () => undefined });

export const RewardActiveContext = createContext(false);

export const RemoteHostContext = createContext<RemoteHostState | null>(null);

export function emitRemoteComponentCommand(event: RemoteControllerEvent) {
  window.dispatchEvent(new CustomEvent<RemoteControllerEvent>(REMOTE_COMPONENT_EVENT, { detail: event }));
}

export function useRemoteComponentCommand(handler: (event: RemoteControllerEvent) => void) {
  const handlerRef = useRef(handler);
  useEffect(() => { handlerRef.current = handler; }, [handler]);
  useEffect(() => {
    const listener = (event: Event) => handlerRef.current((event as CustomEvent<RemoteControllerEvent>).detail);
    window.addEventListener(REMOTE_COMPONENT_EVENT, listener);
    return () => window.removeEventListener(REMOTE_COMPONENT_EVENT, listener);
  }, []);
}

export function useLocalFallbackAdvance(manualAdvance: boolean, pending: boolean, advance: () => void, delayMs: number) {
  const rewardActive = useContext(RewardActiveContext);
  const effectiveManual = manualAdvance || rewardActive;
  const wasManual = useRef(effectiveManual);
  const advanceRef = useRef(advance);
  useEffect(() => { advanceRef.current = advance; }, [advance]);
  useEffect(() => {
    const controllerDisconnected = wasManual.current && !effectiveManual;
    wasManual.current = effectiveManual;
    if (!controllerDisconnected || !pending) return;
    const timer = window.setTimeout(() => advanceRef.current(), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, effectiveManual, pending]);
}

export function useToastMessage() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const notify = useCallback((next: string, durationMs = 2600) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setMessage(next);
    timer.current = window.setTimeout(() => { setMessage(null); timer.current = null; }, durationMs);
  }, []);
  const dismiss = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setMessage(null);
  }, []);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  return [message, notify, dismiss] as const;
}

export function useStoredState<T>(key: string, fallback: T, migrate?: (saved: T) => T, prepare?: (value: T) => T) {
  const [value, setValue] = useState<T>(fallback);
  const [isLoaded, setIsLoaded] = useState(false);
  const loaded = useRef(false);
  const migrateRef = useRef(migrate);
  const prepareRef = useRef(prepare);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { const saved = localStorage.getItem(key); if (saved) { const parsed = JSON.parse(saved) as T; setValue(migrateRef.current ? migrateRef.current(parsed) : parsed); } } catch { /* storage can be unavailable */ }
      loaded.current = true;
      setIsLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key]);
  useEffect(() => { if (!loaded.current) return; try { localStorage.setItem(key, JSON.stringify(prepareRef.current ? prepareRef.current(value) : value)); } catch { /* storage can be unavailable */ } }, [key, value]);
  return [value, setValue, isLoaded] as const;
}
