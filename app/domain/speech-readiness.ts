export type SpeechVoiceSource<T> = {
  getVoices: () => T[];
  addEventListener: (type: "voiceschanged", listener: () => void) => void;
  removeEventListener: (type: "voiceschanged", listener: () => void) => void;
};

export function waitForSpeechVoices<T>(source: SpeechVoiceSource<T>, timeoutMs = 1000): Promise<T[]> {
  const available = source.getVoices();
  if (available.length) return Promise.resolve(available);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (voices: T[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      source.removeEventListener("voiceschanged", onVoicesChanged);
      resolve(voices);
    };
    const onVoicesChanged = () => {
      const voices = source.getVoices();
      if (voices.length) finish(voices);
    };
    const timeout = setTimeout(() => finish(source.getVoices()), timeoutMs);
    source.addEventListener("voiceschanged", onVoicesChanged);
    onVoicesChanged();
  });
}
