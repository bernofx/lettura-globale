export type SpeechVoiceSource<T> = {
  getVoices: () => T[];
  addEventListener: (type: "voiceschanged", listener: () => void) => void;
  removeEventListener: (type: "voiceschanged", listener: () => void) => void;
};

export function waitForSpeechVoices<T>(source: SpeechVoiceSource<T>, timeoutMs = 1000, signal?: AbortSignal): Promise<T[]> {
  if (signal?.aborted) return Promise.resolve([]);
  const available = source.getVoices();
  if (available.length) return Promise.resolve(available);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (voices: T[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      source.removeEventListener("voiceschanged", onVoicesChanged);
      signal?.removeEventListener("abort", onAbort);
      resolve(voices);
    };
    const onVoicesChanged = () => {
      const voices = source.getVoices();
      if (voices.length) finish(voices);
    };
    const timeout = setTimeout(() => finish(source.getVoices()), timeoutMs);
    const onAbort = () => finish([]);
    signal?.addEventListener("abort", onAbort, { once: true });
    source.addEventListener("voiceschanged", onVoicesChanged);
    onVoicesChanged();
  });
}
