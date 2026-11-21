import { createRewardMusic, REWARD_SOUNDTRACK, rewardMusicRange } from "../domain/reward-soundtrack";
import { unlockAudioContext } from "../domain/audio-activation";
import { androidBridge, startAndroidSpeech, stopAndroidSpeech } from "../domain/android-bridge";
import { feedbackStartOffset } from "../domain/feedback-audio";
import { defaultSoundPreferences, soundAsset, type SoundCue, type SoundPreferences } from "../domain/sound-preferences";
import { createBrowserSpeechPlayer } from "../domain/browser-speech";

let currentAudioVolume = 1;

let browserSpeechPlayer: ReturnType<typeof createBrowserSpeechPlayer> | undefined;

export function cancelSpeech() {
  stopAndroidSpeech();
  browserSpeechPlayer?.cancel();
}

function reportSpeechUnavailable() {
  window.dispatchEvent(new Event("lg-speech-unavailable"));
}

export function speakWord(word: string, onComplete?: () => void) {
  cancelSpeech();
  if (currentAudioVolume <= 0) { onComplete?.(); return () => {}; }
  const nativeCancel = startAndroidSpeech(androidBridge(), window, word, currentAudioVolume, onComplete);
  if (nativeCancel) return nativeCancel;
  if (!("speechSynthesis" in window)) { reportSpeechUnavailable(); onComplete?.(); return () => {}; }
  browserSpeechPlayer ??= createBrowserSpeechPlayer({
    synthesis: window.speechSynthesis,
    utterance: (text) => new SpeechSynthesisUtterance(text),
    schedule: (callback, delay) => window.setTimeout(callback, delay),
    clear: (id) => window.clearTimeout(id),
    unavailable: reportSpeechUnavailable,
  });
  return browserSpeechPlayer.speak(word, currentAudioVolume, onComplete);
}

type FeedbackSound = "correct" | "wrong";

let currentSoundPreferences = defaultSoundPreferences;

export const feedbackAudioPlayers: Record<string, HTMLAudioElement> = {};

type PreparedFeedbackSound = { buffer: AudioBuffer; startOffset: number };

const preparedFeedbackSounds: Record<string, PreparedFeedbackSound> = {};

const feedbackSoundPreparation: Partial<Record<string, Promise<void>>> = {};

let feedbackAudioContext: AudioContext | null = null;

let activeFeedbackSource: AudioBufferSourceNode | null = null;

export function feedbackContext() {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  if (!feedbackAudioContext) feedbackAudioContext = new AudioContext({ latencyHint: "interactive" });
  return feedbackAudioContext;
}

function feedbackAudioFor(url: string) {
  if (typeof window === "undefined") return null;
  if (!feedbackAudioPlayers[url]) {
    const audio = new window.Audio(url);
    audio.preload = "auto";
    audio.volume = currentAudioVolume;
    audio.load();
    feedbackAudioPlayers[url] = audio;
  }
  return feedbackAudioPlayers[url] ?? null;
}

export function preloadFeedbackSounds() {
  for (const cue of Object.keys(currentSoundPreferences) as SoundCue[]) {
    const url = soundAsset(cue, currentSoundPreferences[cue]);
    if (url) { feedbackAudioFor(url); prepareFeedbackSound(url); }
  }
  void prepareFeedbackSound(REWARD_SOUNDTRACK.url);
}

function prepareFeedbackSound(url: string) {
  if (preparedFeedbackSounds[url]) return Promise.resolve();
  if (feedbackSoundPreparation[url]) return feedbackSoundPreparation[url];
  const context = feedbackContext();
  if (!context) return;
  feedbackSoundPreparation[url] = fetch(url, { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error("feedback_audio_load_failed");
      return response.arrayBuffer();
    })
    .then((data) => context.decodeAudioData(data))
    .then((buffer) => {
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
      preparedFeedbackSounds[url] = { buffer, startOffset: feedbackStartOffset(channels, buffer.sampleRate) };
      const fallback = feedbackAudioPlayers[url];
      if (fallback) fallback.currentTime = preparedFeedbackSounds[url]?.startOffset ?? 0;
    })
    .catch(() => undefined)
    .finally(() => { delete feedbackSoundPreparation[url]; });
  return feedbackSoundPreparation[url];
}

export function startBackgroundMusic(url: string, volume: number, playbackRange?: typeof rewardMusicRange) {
  return createRewardMusic(feedbackContext(), async () => {
    await prepareFeedbackSound(url);
    return preparedFeedbackSounds[url]?.buffer ?? null;
  }, volume, playbackRange);
}

export function startRewardMusic(volume: number) {
  return startBackgroundMusic(REWARD_SOUNDTRACK.url, volume, rewardMusicRange);
}

export function primeFeedbackSounds() {
  unlockAudioContext(feedbackContext());
  try { if ("speechSynthesis" in window) window.speechSynthesis.getVoices(); } catch { /* A cold engine is handled by the player when speech is requested. */ }
  preloadFeedbackSounds();
}

function playSynthesizedSound(cue: SoundCue, choice: string, selected: boolean) {
  const context = feedbackContext();
  if (!context) return;
  if (context.state === "suspended") void context.resume().catch(() => undefined);
  const notes = cue === "wrong" ? [392, 330] : cue === "finish" ? [523, 659, 784, 1046] : cue === "correct" ? choice === "bright" ? [784, 1175, 1568] : [659, 988] : [selected ? 1046 : 784];
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + index * (cue === "finish" ? 0.16 : 0.12);
    oscillator.type = cue === "wrong" ? "sine" : choice === "soft" ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(frequency, start);
    if (cue === "select") oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.35, start + 0.1);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, (cue === "select" ? 0.07 : 0.055) * currentAudioVolume), start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + (cue === "finish" ? 0.38 : 0.22));
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + (cue === "finish" ? 0.4 : 0.24));
  });
}

export function playSoundCue(cue: SoundCue, enabled: boolean, selected = true, override?: string) {
  if (!enabled) return;
  const choice = override ?? currentSoundPreferences[cue];
  const url = soundAsset(cue, choice);
  if (!url) { playSynthesizedSound(cue, choice, selected); return; }
  const context = feedbackContext();
  const prepared = preparedFeedbackSounds[url];
  if (context?.state === "running" && prepared) {
    activeFeedbackSource?.stop();
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = prepared.buffer;
    gain.gain.value = currentAudioVolume;
    source.connect(gain);
    gain.connect(context.destination);
    source.onended = () => { if (activeFeedbackSource === source) activeFeedbackSource = null; };
    activeFeedbackSource = source;
    source.start(0, prepared.startOffset);
    return;
  }
  if (context?.state === "suspended") void context.resume().catch(() => undefined);
  prepareFeedbackSound(url);
  const audio = feedbackAudioFor(url);
  if (!audio) return;
  Object.values(feedbackAudioPlayers).forEach((player) => {
    player?.pause();
    if (player) player.currentTime = 0;
  });
  audio.currentTime = prepared?.startOffset ?? 0;
  audio.volume = currentAudioVolume;
  void audio.play().catch(() => undefined);
}

export function playFeedbackTone(kind: FeedbackSound, enabled: boolean) { playSoundCue(kind, enabled); }

export function playQuantityTick(selected: boolean, enabled: boolean) {
  playSoundCue("select", enabled, selected);
}

/** Applies the session volume (0–1) to speech and to already created feedback players. */
export function applyAudioVolume(volume: number) {
  currentAudioVolume = volume;
  Object.values(feedbackAudioPlayers).forEach((player) => { if (player) player.volume = currentAudioVolume; });
}

/** Replaces the cloud sound preferences and warms up the selected sounds. */
export function applySoundPreferences(preferences: SoundPreferences) {
  currentSoundPreferences = preferences;
  preloadFeedbackSounds();
}
