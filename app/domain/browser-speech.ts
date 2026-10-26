import { waitForSpeechVoices } from "./speech-readiness.ts";

type Environment = {
  synthesis: SpeechSynthesis;
  utterance: (text: string) => SpeechSynthesisUtterance;
  schedule: (callback: () => void, delay: number) => number;
  clear: (id: number) => void;
  unavailable: () => void;
};

/** One active request, at most one retry, and no replay after observed speech. */
export function createBrowserSpeechPlayer(env: Environment) {
  let activeCancel: (() => void) | null = null;
  const cancel = () => { activeCancel?.(); };
  const speak = (text: string, volume: number, done?: () => void) => {
    cancel();
    if (volume <= 0) { done?.(); return () => {}; }
    let stopped = false;
    const controller = new AbortController();
    let current: { utterance: SpeechSynthesisUtterance; started: boolean } | null = null;
    let retryTimer: number | null = null;
    const timers = new Set<number>();
    const schedule = (callback: () => void, delay: number) => {
      const id = env.schedule(() => { timers.delete(id); if (!stopped) callback(); }, delay);
      timers.add(id);
      return id;
    };
    const clear = (id: number | null) => { if (id !== null) { env.clear(id); timers.delete(id); } };
    const cleanup = () => { controller.abort(); timers.forEach(env.clear); timers.clear(); if (activeCancel === stop) activeCancel = null; };
    const stop = () => {
      if (stopped) return;
      stopped = true;
      current = null; // Ignore synchronous cancelled/error events from the old engine.
      cleanup();
      env.synthesis.cancel();
    };
    const finish = () => { if (stopped) return; stopped = true; cleanup(); current = null; done?.(); };
    const fail = () => { if (stopped) return; stop(); env.unavailable(); done?.(); };
    activeCancel = stop;

    const attempt = (retried: boolean) => {
      if (stopped) return;
      current = null;
      env.synthesis.cancel();
      const start = (voices: SpeechSynthesisVoice[]) => {
        if (stopped) return;
        const utterance = env.utterance(`${text}!`);
        const request = { utterance, started: false };
        current = request; // Retain the utterance until end/cancellation, including on mobile.
        const live = () => !stopped && current === request;
        const italian = voices.filter((voice) => voice.lang.toLowerCase().startsWith("it"));
        const voice = italian.find((item) => /elsa|isabella|google.*ital/i.test(item.name)) ?? italian.find((item) => item.localService) ?? italian[0];
        if (voice) utterance.voice = voice;
        utterance.lang = "it-IT";
        utterance.rate = 0.72;
        utterance.pitch = 1;
        utterance.volume = volume;
        let startTimer: number | null = null;
        const retry = () => {
          if (!live() || request.started || retryTimer !== null) return;
          clear(startTimer);
          if (retried) { fail(); return; }
          retryTimer = schedule(() => {
            retryTimer = null;
            if (live() && !request.started) attempt(true);
          }, 160);
        };
        const started = () => {
          if (!live() || request.started) return;
          request.started = true;
          clear(startTimer);
          clear(retryTimer);
          retryTimer = null;
          // Some engines omit end: preserve feedback completion without replaying speech.
          schedule(() => { if (live()) finish(); }, Math.max(6000, Math.min(20000, 2500 + text.length * 250)));
        };
        utterance.onstart = started;
        utterance.onboundary = started;
        utterance.onend = () => { if (live()) finish(); };
        utterance.onerror = (event) => {
          if (!live()) return;
          if (request.started) finish();
          else if (event.error === "not-allowed") fail(); // Requires a real local gesture, not a retry loop.
          else retry();
        };
        startTimer = schedule(() => {
          if (!live() || request.started) return;
          if (env.synthesis.speaking) {
            // Missing start event does not prove silence. Do not repeat possibly audible speech.
            schedule(() => { if (live() && !request.started) fail(); }, 4000);
          } else retry();
        }, 1600);
        try {
          if (env.synthesis.paused) env.synthesis.resume();
          env.synthesis.speak(utterance);
        } catch { retry(); }
      };
      try {
        const voices = env.synthesis.getVoices();
        // Keep warm-engine calls synchronous, especially manual taps on mobile.
        if (voices.length) start(voices);
        else void waitForSpeechVoices(env.synthesis, retried ? 250 : 1200, controller.signal).then(start).catch(() => { if (!stopped) fail(); });
      } catch { fail(); }
    };
    attempt(false);
    return stop;
  };
  return { speak, cancel };
}
