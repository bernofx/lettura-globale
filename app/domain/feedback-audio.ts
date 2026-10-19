const DEFAULT_THRESHOLD = 0.012;
const DEFAULT_PREROLL_MS = 5;

export function feedbackStartOffset(
  channels: readonly Float32Array[],
  sampleRate: number,
  threshold = DEFAULT_THRESHOLD,
  prerollMs = DEFAULT_PREROLL_MS,
) {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !channels.length) return 0;

  const signalThreshold = Math.max(0, threshold);
  const length = Math.max(...channels.map((channel) => channel.length));
  let firstSignalSample = -1;

  for (let sample = 0; sample < length; sample += 1) {
    if (channels.some((channel) => Math.abs(channel[sample] ?? 0) >= signalThreshold)) {
      firstSignalSample = sample;
      break;
    }
  }

  if (firstSignalSample < 0) return 0;
  const prerollSamples = Math.round(sampleRate * Math.max(0, prerollMs) / 1000);
  return Math.max(0, firstSignalSample - prerollSamples) / sampleRate;
}
