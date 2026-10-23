/** One spoken confirmation per match; controller changes never replay it. */
export function createCorrectMatchFeedback(options: {
  text: string | null;
  manual: boolean;
  soundEffects: boolean;
  speak: (text: string, done: () => void) => () => void;
  schedule: (callback: () => void, delay: number) => number;
  clear: (timer: number) => void;
  advance: () => void;
}) {
  let manual = options.manual;
  let cancelled = false;
  let finished = false;
  let advanced = false;
  let advanceTimer: number | null = null;
  let stopSpeech: (() => void) | undefined;
  const queueAdvance = () => {
    if (cancelled || manual || !finished || advanced || advanceTimer !== null) return;
    advanceTimer = options.schedule(() => {
      advanceTimer = null;
      if (cancelled || manual || advanced) return;
      advanced = true;
      options.advance();
    }, options.text ? 180 : 0);
  };
  const timer = options.schedule(() => {
    if (cancelled) return;
    const done = () => { if (!cancelled) { finished = true; queueAdvance(); } };
    if (options.text) stopSpeech = options.speak(options.text, done);
    else done();
  }, options.text ? (options.soundEffects ? 360 : 120) : 750);
  return {
    setManual(value: boolean) {
      manual = value;
      if (advanceTimer !== null) { options.clear(advanceTimer); advanceTimer = null; }
      queueAdvance();
    },
    cancel() {
      cancelled = true;
      options.clear(timer);
      if (advanceTimer !== null) options.clear(advanceTimer);
      stopSpeech?.();
    },
  };
}

export function correctMatchSpeech(kind: "articles" | "word-categories", enabled: boolean | undefined, word: string, answer: string): string | null {
  if (!enabled) return null;
  return kind === "articles" ? `${answer.toLocaleLowerCase("it-IT")} ${word}` : answer;
}
