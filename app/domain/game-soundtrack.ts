export const GAME_SOUNDTRACK_URL = "/api/game-soundtrack";
export const DEFAULT_GAME_SOUNDTRACK = "/audio/coloring-calypso.mp3";
export const MAX_SOUNDTRACK_BYTES = 6_000_000;
export const MAX_SOUNDTRACK_SECONDS = 300;

/** Source, licence and rights confirmation are mandatory metadata (AGENTS.md). */
export type GameSoundtrack = { name: string; etag: string; source?: string; license?: string; rightsConfirmedAt?: string };
export const SOUNDTRACK_TEXT_LIMIT = 120;

const mpeg1Bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const lowerBitrates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const sampleRates = [44100, 48000, 32000];

const ascii = (bytes: Uint8Array, at: number, text: string) => [...text].every((char, index) => bytes[at + index] === char.charCodeAt(0));

// Data that players ignore after the audio frames: APEv2, Lyrics3, an appended
// ID3v2 (or its "3DI" footer), an ID3v1 tag or zero padding.
function isTrailer(bytes: Uint8Array, start: number, end: number) {
  if (ascii(bytes, start, "APETAGEX") || ascii(bytes, start, "LYRICSBEGIN") || ascii(bytes, start, "ID3") || ascii(bytes, start, "3DI") || ascii(bytes, start, "TAG")) return true;
  for (let index = start; index < end; index++) if (bytes[index] !== 0) return false;
  return true;
}

// Parse MPEG Layer III frame lengths rather than trusting the extension or ID3 tag.
export function mp3Duration(bytes: Uint8Array): number | null {
  let start = 0;
  let end = bytes.length;
  if (ascii(bytes, 0, "ID3")) {
    if (end < 10 || bytes.subarray(6, 10).some(value => value >= 128)) return null;
    const tagSize = bytes.subarray(6, 10).reduce((size, byte) => size * 128 + byte, 0);
    start = 10 + tagSize + (bytes[3] === 4 && (bytes[5] & 16) ? 10 : 0);
  }
  if (end >= 128 && ascii(bytes, end - 128, "TAG")) end -= 128;
  // Some encoders pad the ID3 tag with zeros before the first frame.
  while (start < end && bytes[start] === 0) start++;
  let frames = 0;
  let duration = 0;
  while (start + 4 <= end) {
    const second = bytes[start + 1];
    const third = bytes[start + 2];
    const header = bytes[start] === 0xff && (second & 0xe6) === 0xe2;
    const version = (second >> 3) & 3;
    const rateCode = (third >> 2) & 3;
    const bitrate = (version === 3 ? mpeg1Bitrates : lowerBitrates)[third >> 4];
    if (!header || version === 1 || rateCode === 3 || !bitrate) {
      // After real audio, accept only data players ignore; anything else is not an MP3.
      return frames >= 2 && isTrailer(bytes, start, end) ? duration : null;
    }
    const sampleRate = sampleRates[rateCode] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    const samples = version === 3 ? 1152 : 576;
    const length = Math.floor(samples * bitrate * 1000 / (8 * sampleRate)) + ((third >> 1) & 1);
    // A truncated final frame (cut files) still plays: count it and stop.
    if (start + length > end) return frames >= 1 ? duration + samples / sampleRate : null;
    start += length;
    duration += samples / sampleRate;
    frames++;
    if (duration > MAX_SOUNDTRACK_SECONDS) return duration;
  }
  if (frames < 2) return null;
  return start === end || isTrailer(bytes, start, end) ? duration : null;
}
