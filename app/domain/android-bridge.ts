export type AndroidBridge = {
  speak: (text: string, id: string, volume: number) => void;
  stop: () => void;
  saveCsv: (base64: string) => void;
};

export function androidBridge(): AndroidBridge | undefined {
  return typeof window === "undefined" ? undefined : (window as Window & { LetturaGlobaleAndroid?: AndroidBridge }).LetturaGlobaleAndroid;
}

let sequence = 0;
let activeCancel: (() => void) | null = null;

/** A narrow bridge, not a general JavaScript/native command channel. */
export function startAndroidSpeech(bridge: AndroidBridge | undefined, events: EventTarget, text: string, volume: number, onComplete?: () => void) {
  if (!bridge) return null;
  activeCancel?.();
  const id = `speech-${Date.now()}-${++sequence}`;
  let completed = false;
  const cleanup = () => {
    clearTimeout(timer);
    events.removeEventListener("lg-native-speech-end", ended);
    if (activeCancel === cancel) activeCancel = null;
  };
  const finish = () => { if (completed) return; completed = true; cleanup(); onComplete?.(); };
  const cancel = () => { if (completed) return; completed = true; cleanup(); bridge.stop(); };
  const ended = (event: Event) => {
    const detail = (event as CustomEvent<{ id?: string; cancelled?: boolean }>).detail;
    if (detail?.id === id) { if (detail.cancelled) cancel(); else finish(); }
  };
  const timer = setTimeout(finish, Math.max(6_000, Math.min(20_000, 1_600 + text.length * 150)));
  events.addEventListener("lg-native-speech-end", ended);
  activeCancel = cancel;
  try { bridge.speak(text.slice(0, 600), id, Math.max(0, Math.min(1, volume))); } catch { finish(); }
  return cancel;
}

export function stopAndroidSpeech() {
  activeCancel?.();
  androidBridge()?.stop();
}
