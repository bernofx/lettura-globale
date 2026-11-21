import { DEFAULT_GAME_SOUNDTRACK, GAME_SOUNDTRACK_URL } from "../../domain/game-soundtrack";
import { createRewardMusic, type RewardMusicPlayer } from "../../domain/reward-soundtrack";
import { feedbackContext } from "../../shared/audio";

async function loadGameSoundtrack(context: AudioContext, signal: AbortSignal) {
  try {
    const custom = await fetch(GAME_SOUNDTRACK_URL, {
      cache: "no-store",
      signal: typeof AbortSignal.any === "function" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.any([signal, AbortSignal.timeout(6000)])
        : signal,
    });
    if (custom.ok) return await context.decodeAudioData(await custom.arrayBuffer());
  } catch {
    // A custom track may be unavailable when the game is opened offline.
  }
  if (signal.aborted) return null;
  const standard = await fetch(DEFAULT_GAME_SOUNDTRACK, { signal });
  return standard.ok ? context.decodeAudioData(await standard.arrayBuffer()) : null;
}

export function startGameMusic(volume: number): RewardMusicPlayer {
  const context = feedbackContext();
  const request = new AbortController();
  let level = volume;
  const player = createRewardMusic(context, async () => context && loadGameSoundtrack(context, request.signal), document.hidden ? 0 : level);
  const updateVolume = () => player.setVolume(document.hidden ? 0 : level);
  document.addEventListener("visibilitychange", updateVolume);

  return {
    ...player,
    setVolume(nextVolume) {
      level = nextVolume;
      updateVolume();
    },
    stop() {
      document.removeEventListener("visibilitychange", updateVolume);
      request.abort();
      player.stop();
    },
  };
}
