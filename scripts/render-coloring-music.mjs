// Original score for Colorare. Render the PCM to stdout for the MP3 encoder:
// node scripts/render-coloring-music.mjs | ffmpeg -i pipe:0 -map_metadata -1 -c:a libmp3lame -q:a 5 public/audio/coloring-game.mp3
const sampleRate = 32000;
const beat = 0.86;
const bars = [
  { chord: [48, 55, 64], melody: [72, null, 76, 79] },
  { chord: [47, 55, 62], melody: [74, null, 71, 74] },
  { chord: [45, 52, 60], melody: [72, 69, 72, null] },
  { chord: [41, 53, 60], melody: [65, null, 69, 72] },
  { chord: [48, 55, 64], melody: [76, null, 79, 76] },
  { chord: [45, 52, 60], melody: [72, 76, 69, null] },
  { chord: [41, 53, 60], melody: [69, null, 72, 77] },
  { chord: [43, 55, 62], melody: [74, 71, 67, null] },
];
const samples = new Float32Array(Math.round(bars.length * 4 * beat * sampleRate));

function addNote(midi, start, duration, level) {
  const pitch = 440 * (2 ** ((midi - 69) / 12));
  const startIndex = Math.round(start * sampleRate);
  for (let i = 0; i < duration * sampleRate; i++) {
    const seconds = i / sampleRate;
    const attack = Math.sin(Math.PI / 2 * Math.min(1, seconds / 0.075)) ** 2;
    const release = Math.min(1, (duration - seconds) / 0.26) ** 2;
    const phase = 2 * Math.PI * pitch * seconds;
    const tone = Math.sin(phase) + 0.14 * Math.sin(2 * phase) * Math.exp(-4 * seconds);
    samples[(startIndex + i) % samples.length] += level * attack * release * Math.exp(-1.8 * seconds) * tone;
  }
}

for (const [index, bar] of bars.entries()) {
  const start = index * 4 * beat;
  bar.chord.forEach((note, offset) => addNote(note, start + offset * beat, 2.4, 0.16));
  bar.melody.forEach((note, offset) => {
    if (note === null) return;
    addNote(note, start + offset * beat, 1.55, 0.45);
    addNote(note, start + offset * beat + 0.25, 1.55, 0.06);
  });
}

const wav = Buffer.alloc(44 + samples.length * 2);
wav.write("RIFF", 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(samples.length * 2, 40);
samples.forEach((value, i) => wav.writeInt16LE(Math.round(value * 32767), 44 + i * 2));
process.stdout.write(wav);
