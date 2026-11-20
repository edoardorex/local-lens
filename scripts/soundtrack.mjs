import { writeFile } from 'node:fs/promises';

// Original procedural score: no samples, recordings, or external music.
export async function writeSoundtrack(destination, seconds) {
  const rate = 44100;
  const count = Math.ceil(seconds * rate);
  const left = new Float32Array(count);
  const right = new Float32Array(count);
  const beat = 60 / 112;
  let seed = 42;
  const noise = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
  const hz = (note) => 440 * 2 ** ((note - 69) / 12);
  function note(start, duration, midi, level, pan = 0, bass = false) {
    const frequency = hz(midi);
    for (let i = 0; i < duration * rate; i++) {
      const index = Math.floor(start * rate) + i;
      if (index >= count) break;
      const time = i / rate;
      const envelope = Math.min(1, time / 0.008) * Math.exp(-time * (bass ? 7 : 5))
        * Math.min(1, (duration - time) / 0.04);
      const wave = Math.sin(2 * Math.PI * frequency * time)
        + 0.22 * Math.sin(2 * Math.PI * frequency * 2 * time)
        + (bass ? 0 : 0.10 * Math.sin(2 * Math.PI * frequency * 3 * time));
      const sample = wave * envelope * level;
      left[index] += sample * (1 - pan * 0.35);
      right[index] += sample * (1 + pan * 0.35);
      const echo = index + Math.floor(beat * 0.75 * rate);
      if (!bass && echo < count) {
        left[echo] += sample * 0.17 * (1 + pan);
        right[echo] += sample * 0.17 * (1 - pan);
      }
    }
  }
  function drum(start, kind) {
    const duration = kind === 'kick' ? 0.28 : kind === 'clap' ? 0.16 : 0.055;
    for (let i = 0; i < duration * rate; i++) {
      const index = Math.floor(start * rate) + i;
      if (index >= count) break;
      const time = i / rate;
      let sample;
      if (kind === 'kick') {
        sample = Math.sin(2 * Math.PI * (48 * time + 7 * (1 - Math.exp(-time * 35))))
          * Math.exp(-time * 19) * 0.48;
      } else {
        const transient = noise() * Math.exp(-time * (kind === 'clap' ? 34 : 100));
        sample = transient * (kind === 'clap' ? 0.18 : 0.07);
      }
      left[index] += sample;
      right[index] += sample;
    }
  }
  const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [60, 64, 67, 71], [55, 59, 62, 67]];
  const melody = [0, 2, 1, 3, 2, 1, 3, 2];
  for (let step = 0; step * beat / 2 < seconds; step++) {
    const time = step * beat / 2;
    const chord = chords[Math.floor(step / 16) % chords.length];
    note(time, beat * 0.9, chord[melody[step % melody.length]] + 12, 0.075, step % 2 ? 0.6 : -0.6);
    if (step % 4 === 0) note(time, beat * 1.8, chord[0] - 12, 0.23, 0, true);
    if (time > beat * 4) {
      drum(time, 'hat');
      if (step % 2 === 0) drum(time, 'kick');
      if (step % 4 === 2) drum(time, 'clap');
    }
  }
  const buffer = Buffer.alloc(44 + count * 4);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(count * 4, 40);
  for (let i = 0; i < count; i++) {
    const fade = Math.min(1, i / rate / 0.7, (count - i) / rate / 1.5);
    buffer.writeInt16LE(Math.round(Math.tanh(left[i]) * fade * 27000), 44 + i * 4);
    buffer.writeInt16LE(Math.round(Math.tanh(right[i]) * fade * 27000), 46 + i * 4);
  }
  await writeFile(destination, buffer);
}
