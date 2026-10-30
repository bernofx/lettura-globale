export const REWARD_SOUNDTRACK = {
  title: "Colonna sonora del gioco dei palloncini",
  url: "/audio/balloon-game.mp3",
  source: "File untitled.wav fornito dall’utente il 30 ottobre 2026",
  author: "Non indicato",
  license: "Uso nell’app richiesto dall’utente; nessuna ulteriore licenza dichiarata",
};

export type RewardMusicPlayer = { retry: () => void; setVolume: (volume: number) => void; stop: () => void };
const levelFor = (volume: number) => Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) * 0.45 : 0;

/** Independent source: popping balloons/feedback must not interrupt the music. */
export function createRewardMusic(context: AudioContext | null, load: () => Promise<AudioBuffer | null>, volume: number): RewardMusicPlayer {
  let disposed = false;
  let loading = false;
  let level = levelFor(volume);
  let source: AudioBufferSourceNode | null = null;
  let gain: GainNode | null = null;
  const retry = async () => {
    if (!context || disposed || loading || level === 0 || context.state === "closed") return;
    loading = true;
    try {
      if (context.state === "suspended") await context.resume();
      if (disposed || source || context.state !== "running") return;
      const buffer = await load();
      if (!buffer || disposed || level === 0 || context.state !== "running") return;
      source = context.createBufferSource();
      gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = level;
      source.connect(gain);
      gain.connect(context.destination);
      source.start(0);
    } catch {
      // Autoplay/network failure never blocks the visual game. Retry on a gesture.
      source?.disconnect(); gain?.disconnect(); source = null; gain = null;
    }
    finally { loading = false; }
  };
  void retry();
  return {
    retry: () => {
      // Some browsers leave the first resume promise pending until a trusted
      // gesture calls resume again; do not let the loading lock swallow it.
      if (context?.state === "suspended" && loading && !disposed && level > 0) void context.resume().catch(() => undefined);
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
      try { source?.stop(); } catch { /* Already stopped/closed context. */ }
      source?.disconnect();
      gain?.disconnect();
      source = null;
      gain = null;
    },
  };
}
