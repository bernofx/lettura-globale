const silentUnlocks = new WeakMap<AudioContext, AudioBufferSourceNode>();

/** Run synchronously in a real local gesture, before fetch/decode/React effects. */
export function unlockAudioContext(context: AudioContext | null) {
  if (!context || context.state === "closed" || context.state === "running") return;
  let source: AudioBufferSourceNode | null = null;
  try {
    void context.resume().catch(() => undefined);
    if (silentUnlocks.has(context)) return;
    source = context.createBufferSource();
    source.buffer = context.createBuffer(1, 1, context.sampleRate);
    source.connect(context.destination);
    silentUnlocks.set(context, source);
    const pendingSource = source;
    source.onended = () => { pendingSource.disconnect(); silentUnlocks.delete(context); };
    source.start(0);
  } catch { source?.disconnect(); silentUnlocks.delete(context); /* Never block the UI. */ }
}

/** Touch activation is granted on pointerup/click, not necessarily pointerdown. */
export function listenForAudioGestures(target: EventTarget, prime: () => void) {
  const events = ["pointerdown", "pointerup", "click", "keydown"];
  for (const event of events) target.addEventListener(event, prime, { capture: true });
  return () => { for (const event of events) target.removeEventListener(event, prime, { capture: true }); };
}
