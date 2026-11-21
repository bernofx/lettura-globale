import { useContext, useEffect, useRef } from "react";
import { createCorrectMatchFeedback } from "../../domain/correct-match-feedback";
import { speakWord } from "../../shared/audio";
import { RewardActiveContext } from "../../shared/hooks";

export function useCorrectMatchFeedback(matchId: string | null, text: string | null, manualAdvance: boolean, soundEffects: boolean, advance: () => void) {
  const rewardActive = useContext(RewardActiveContext);
  const effectiveManual = manualAdvance || rewardActive;
  const advanceRef = useRef(advance);
  const manualRef = useRef(manualAdvance);
  const soundEffectsRef = useRef(soundEffects);
  const controller = useRef<ReturnType<typeof createCorrectMatchFeedback> | null>(null);
  useEffect(() => { advanceRef.current = advance; }, [advance]);
  useEffect(() => { soundEffectsRef.current = soundEffects; }, [soundEffects]);
  useEffect(() => {
    manualRef.current = effectiveManual;
    controller.current?.setManual(effectiveManual);
  }, [effectiveManual]);
  useEffect(() => {
    if (!matchId) return;
    const feedback = createCorrectMatchFeedback({
      text, manual: manualRef.current, soundEffects: soundEffectsRef.current, speak: speakWord,
      schedule: (callback, delay) => window.setTimeout(callback, delay),
      clear: (timer) => window.clearTimeout(timer),
      advance: () => advanceRef.current(),
    });
    controller.current = feedback;
    return () => { feedback.cancel(); controller.current = null; };
  }, [matchId, text]);
}
