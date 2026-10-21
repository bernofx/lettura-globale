export function shouldAutoPronouncePrompt(options: {
  sessionActive: boolean;
  awaitingNextExercise: boolean;
  isRecognition: boolean;
  enabled: boolean;
  promptWord?: string;
}) {
  return options.sessionActive && !options.awaitingNextExercise && options.isRecognition && options.enabled && Boolean(options.promptWord);
}
