import { feedbackStartOffset } from "./feedback-audio.ts";

export const REWARD_SOUNDTRACK = {
  title: "Colonna sonora del gioco dei palloncini",
  url: "/audio/balloon-game.mp3",
  source: "File untitled.wav fornito dall’utente il 30 ottobre 2026",
  author: "Non indicato",
  license: "Uso nell’app richiesto dall’utente; nessuna ulteriore licenza dichiarata",
};

export type RewardMusicPlayer = { retry: () => void; isPlaying: () => boolean; setVolume: (volume: number) => void; stop: () => void };
const levelFor = (volume: number) => Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) * 0.45 : 0;
type PlaybackRange = { start: number; end: number };
const ranges = new WeakMap<AudioBuffer, PlaybackRange>();

/** Preserve the uploaded file; skip its silent lead-in/tail only during play. */
export function rewardMusicRange(buffer: AudioBuffer): PlaybackRange {
  const cached = ranges.get(buffer);
  if (cached) return cached;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  const start = feedbackStartOffset(channels, buffer.sampleRate);
  let end = buffer.duration;
  const length = Math.max(0, ...channels.map((channel) => channel.length));
  for (let sample = length - 1; sample >= 0; sample--) {
    if (channels.some((channel) => Math.abs(channel[sample] ?? 0) >= 0.012)) {
      end = Math.min(buffer.duration, (sample + 1) / buffer.sampleRate + 0.005);
      break;
    }
  }
  const range = { start, end: Math.max(start, end) };
  ranges.set(buffer, range);
  return range;
}

/** Independent source: popping balloons/feedback must not interrupt the music. */
export function createRewardMusic(context: AudioContext | null, load: () => Promise<AudioBuffer | null>, volume: number, playbackRange?: (buffer: AudioBuffer) => PlaybackRange): RewardMusicPlayer {
  let disposed = false;
  let loading = false;
  let level = levelFor(volume);
  let source: AudioBufferSourceNode | null = null;
  let gain: GainNode | null = null;
  const retry = async () => {
    if (!context || disposed || loading || level === 0 || context.state === "closed") return;
    loading = true;
    try {
      if (context.state !== "running") await context.resume();
      if (disposed || source || context.state !== "running") return;
      const buffer = await load();
      if (!buffer || disposed || level === 0 || context.state !== "running") return;
      source = context.createBufferSource();
      gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      const range = playbackRange?.(buffer);
      if (range) { source.loopStart = range.start; source.loopEnd = range.end; }
      gain.gain.value = level;
      source.connect(gain);
      gain.connect(context.destination);
      source.start(0, range?.start ?? 0);
    } catch {
      // Autoplay/network failure never blocks the visual game. Retry on a gesture.
      source?.disconnect(); gain?.disconnect(); source = null; gain = null;
    }
    finally { loading = false; }
  };
  const stateChanged = () => { if (context?.state === "running") void retry(); };
  context?.addEventListener("statechange", stateChanged);
  void retry();
  return {
    isPlaying: () => Boolean(source && !disposed && context?.state === "running" && level > 0),
    retry: () => {
      // Some browsers leave the first resume promise pending until a trusted
      // gesture calls resume again; do not let the loading lock swallow it.
      if (context && context.state !== "running" && context.state !== "closed" && loading && !disposed && level > 0) void context.resume().catch(() => undefined);
      void retry();
    },
    setVolume: (volume) => {
      level = levelFor(volume);
      if (gain) gain.gain.value = level;
      if (level > 0) void retry();
    },
    stop: () => {
      if (disposed) return;
      disposed = true;
      context?.removeEventListener("statechange", stateChanged);
      try { source?.stop(); } catch { /* Already stopped/closed context. */ }
      source?.disconnect();
      gain?.disconnect();
      source = null;
      gain = null;
    },
  };
}
