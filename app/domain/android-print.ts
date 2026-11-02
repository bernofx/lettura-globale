import type { AndroidBridge } from "./android-bridge.ts";
export class AndroidPrintError extends Error {}
let printSequence = 0;
export function printAndroidCaa(bridge: AndroidBridge, events: EventTarget, title: string, size: { width: number; height: number },timeoutMs = 120_000): Promise<"opened" | "cancelled"> {
  if (!bridge.printCaa) return Promise.reject(new AndroidPrintError("Per stampare o salvare PDF dall’app serve l’APK 0.1.3 o successiva. Aggiorna l’app senza disinstallarla; con questa versione puoi stampare dal browser."));
  if (!title.trim() || title.length > 140 || [size.width,size.height].some(n => !Number.isFinite(n) || n < 80 || n > 600)) return Promise.reject(new AndroidPrintError("Titolo o formato del foglio non validi per la stampa Android."));
  const id = `print-${Date.now()}-${++printSequence}`;
  return new Promise((resolve,reject) => {
    const cleanup = () => { clearTimeout(timer); events.removeEventListener("lg-native-print-result",result); };
    const result = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; status?: string; message?: string }>).detail;
      if (detail?.id !== id) return;
      cleanup();
      if (detail.status === "opened" || detail.status === "cancelled") resolve(detail.status);
      else reject(new AndroidPrintError(detail.message?.slice(0,240) || "Stampa Android non disponibile."));
    };
    const timer = setTimeout(() => { cleanup(); reject(new AndroidPrintError("Nessuna conferma dalla stampa Android. Chiudi eventuali finestre del sistema e riprova.")); },timeoutMs);
    events.addEventListener("lg-native-print-result",result);
    try { bridge.printCaa!(title,size.width,size.height,id); } catch { cleanup(); reject(new AndroidPrintError("Impossibile aprire la stampa Android.")); }
  });
}
