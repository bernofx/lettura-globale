export const GAME_SOUNDTRACK_URL = "/api/game-soundtrack";
export const DEFAULT_GAME_SOUNDTRACK = "/audio/coloring-calypso.mp3";
export const MAX_SOUNDTRACK_BYTES = 6_000_000;
export const MAX_SOUNDTRACK_SECONDS = 300;

export type GameSoundtrack = { name: string; etag: string };

const mpeg1Bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const lowerBitrates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const sampleRates = [44100, 48000, 32000];

// Parse MPEG Layer III frame lengths rather than trusting the extension or ID3 tag.
export function mp3Duration(bytes: Uint8Array): number | null {
  let start = 0;
  let end = bytes.length;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    if (end < 10 || bytes.subarray(6, 10).some(value => value >= 128)) return null;
    const tagSize = bytes.subarray(6, 10).reduce((size, byte) => size * 128 + byte, 0);
    start = 10 + tagSize + (bytes[3] === 4 && (bytes[5] & 16) ? 10 : 0);
  }
  if (end >= 128 && bytes[end - 128] === 0x54 && bytes[end - 127] === 0x41 && bytes[end - 126] === 0x47) end -= 128;
  let frames = 0;
  let duration = 0;
  while (start + 4 <= end) {
    const second = bytes[start + 1];
    const third = bytes[start + 2];
    if (bytes[start] !== 0xff || (second & 0xe6) !== 0xe2) return null;
    const version = (second >> 3) & 3;
    const rateCode = (third >> 2) & 3;
    if (version === 1 || rateCode === 3) return null;
    const bitrate = (version === 3 ? mpeg1Bitrates : lowerBitrates)[third >> 4];
    if (!bitrate) return null;
    const sampleRate = sampleRates[rateCode] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    const samples = version === 3 ? 1152 : 576;
    const length = Math.floor(samples * bitrate * 1000 / (8 * sampleRate)) + ((third >> 1) & 1);
    start += length;
    duration += samples / sampleRate;
    frames++;
    if (duration > MAX_SOUNDTRACK_SECONDS) return duration;
  }
  return frames >= 2 && start === end ? duration : null;
}
