/** Short, locally synthesized pop: no downloaded samples or extra audio context. */
export async function playBalloonPop(context: AudioContext | null, volume: number) {
  const level = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0;
  if (!context || level === 0 || context.state === "closed") return;
  try {
    if (context.state === "suspended") await context.resume();
    if (context.state !== "running") return;
    const duration = 0.12;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = (Math.random() * 2 - 1) * Math.exp(-index / context.sampleRate * 32);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = 3500;
    filter.Q.value = 0.7;
    const start = context.currentTime;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.56 * level, start + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(start);
    source.stop(start + duration);
  } catch { /* Audio unavailable/blocked: the visual reward must still work. */ }
}
