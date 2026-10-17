// Synthesis engine - oscillators, envelopes, noise, and WAV encoding

const { NOTE_FREQUENCIES } = require('./musicTheory');

class Oscillator {
  // Band-limited oscillators to reduce aliasing

  static sine(phase) {
    return Math.sin(phase * 2 * Math.PI);
  }

  static triangle(phase) {
    const p = ((phase % 1) + 1) % 1;
    return 4 * Math.abs(p - 0.5) - 1;
  }

  static saw(phase) {
    const p = ((phase % 1) + 1) % 1;
    return 2 * p - 1;
  }

  static square(phase, pw = 0.5) {
    const p = ((phase % 1) + 1) % 1;
    return p < pw ? 1 : -1;
  }

  static noise() {
    return Math.random() * 2 - 1;
  }

  // Soft/warm sine - C418's signature tone
  static warmSine(phase, harmonics = 3) {
    let out = 0;
    for (let h = 1; h <= harmonics; h++) {
      const amp = 1 / (h * h); // rapid harmonic decay = warm tone
      out += Math.sin(phase * 2 * Math.PI * h) * amp;
    }
    return out * 0.7;
  }

  // Bell/celesta tone - very C418
  static bell(phase, inharmonicity = 1.004) {
    let out = 0;
    const partials = [1, 2 * inharmonicity, 3 * inharmonicity * inharmonicity, 4.2, 5.4];
    const amps = [1, 0.6, 0.3, 0.2, 0.1];
    for (let i = 0; i < partials.length; i++) {
      out += Math.sin(phase * 2 * Math.PI * partials[i]) * amps[i];
    }
    return out * 0.4;
  }
}

class Envelope {
  // ADSR envelope
  static adsr(t, noteOnTime, noteOffTime, a, d, s, r) {
    const elapsed = t - noteOnTime;
    if (elapsed < 0) return 0;

    if (noteOffTime !== null && t >= noteOffTime) {
      const releaseElapsed = t - noteOffTime;
      const sustainLevel = this.adsrLevel(noteOffTime - noteOnTime, a, d, s);
      return Math.max(0, sustainLevel * (1 - releaseElapsed / r));
    }

    return this.adsrLevel(elapsed, a, d, s);
  }

  static adsrLevel(elapsed, a, d, s) {
    if (elapsed < a) {
      return elapsed / a; // attack
    } else if (elapsed < a + d) {
      return 1 - (1 - s) * ((elapsed - a) / d); // decay
    } else {
      return s; // sustain
    }
  }

  // Percussive envelope (no sustain)
  static perc(t, onset, attack, decay, curve = 2) {
    const elapsed = t - onset;
    if (elapsed < 0) return 0;
    if (elapsed < attack) return elapsed / attack;
    return Math.pow(Math.max(0, 1 - (elapsed - attack) / decay), curve);
  }

  // Slow swell - for pads
  static swell(t, onset, swellTime, holdTime, releaseTime) {
    const elapsed = t - onset;
    if (elapsed < 0) return 0;
    if (elapsed < swellTime) return elapsed / swellTime;
    if (elapsed < swellTime + holdTime) return 1;
    return Math.max(0, 1 - (elapsed - swellTime - holdTime) / releaseTime);
  }
}

// Voice/instrument definitions
class Voices {
  // C418 Piano - warm, slightly detuned, reverby
  static piano(phase, t, onset, freq) {
    const env = Envelope.perc(t, onset, 0.005, 2.5, 2.5);
    const brightEnv = Envelope.perc(t, onset, 0.002, 0.8, 3);

    // Slightly detuned pair for warmth
    const detune = 0.002;
    let out = Oscillator.warmSine(phase, 4) * 0.6;
    out += Oscillator.sine(phase * (1 + detune)) * 0.2;
    out += Oscillator.triangle(phase * 2) * brightEnv * 0.15;
    out += Oscillator.sine(phase * 3) * brightEnv * 0.08;

    return out * env;
  }

  // Ambient pad
  static pad(phase, t, onset, duration) {
    const swellTime = Math.min(1.5, duration * 0.3);
    const holdTime = Math.max(0, duration - swellTime - 1.5);
    const env = Envelope.swell(t, onset, swellTime, holdTime, 1.5);

    const lfo = Math.sin(t * 2 * Math.PI * 0.3) * 0.005;
    let out = Oscillator.warmSine(phase * (1 + lfo), 2) * 0.5;
    out += Oscillator.sine(phase * 2.001) * 0.2;
    out += Oscillator.triangle(phase * 0.999) * 0.3;

    return out * env * 0.6;
  }

  // Pluck synth - like C418's mallet/pluck sounds
  static pluck(phase, t, onset) {
    const env = Envelope.perc(t, onset, 0.001, 1.2, 3);
    const brightEnv = Envelope.perc(t, onset, 0.001, 0.15, 4);

    let out = Oscillator.triangle(phase) * 0.5;
    out += Oscillator.sine(phase * 2) * brightEnv * 0.4;
    out += Oscillator.sine(phase * 3) * brightEnv * 0.15;
    out += Oscillator.sine(phase * 4) * brightEnv * 0.05;

    return out * env;
  }

  // Sub bass
  static bass(phase, t, onset, duration) {
    const env = Envelope.perc(t, onset, 0.01, Math.max(0.5, duration), 2);
    let out = Oscillator.sine(phase) * 0.7;
    out += Oscillator.triangle(phase) * 0.3;
    // Slight overdrive warmth
    out = Math.tanh(out * 1.3);
    return out * env;
  }

  // Bell/celesta - very Minecraft
  static bell(phase, t, onset) {
    const env = Envelope.perc(t, onset, 0.001, 4.0, 1.8);
    return Oscillator.bell(phase) * env;
  }

  // Kick drum synthesis
  static kick(t, onset) {
    const elapsed = t - onset;
    if (elapsed < 0 || elapsed > 0.5) return 0;

    const env = Envelope.perc(t, onset, 0.001, 0.35, 2.5);
    const pitchEnv = Math.exp(-elapsed * 40) * 150 + 45;
    const phase = elapsed * pitchEnv;
    let out = Math.sin(phase * 2 * Math.PI) * env;

    // Click transient
    const click = Envelope.perc(t, onset, 0.0005, 0.008, 4);
    out += Oscillator.noise() * click * 0.3;

    return out * 0.8;
  }

  // Hi-hat synthesis
  static hihat(t, onset, open = false) {
    const elapsed = t - onset;
    if (elapsed < 0 || elapsed > 1) return 0;

    const decay = open ? 0.3 : 0.06;
    const env = Envelope.perc(t, onset, 0.001, decay, 3);

    // Metallic noise
    let out = 0;
    const freqs = [317, 521, 743, 980, 1213, 1543];
    for (const f of freqs) {
      out += Math.sin(elapsed * f * 2 * Math.PI + Math.sin(elapsed * f * 1.41 * 2 * Math.PI) * 0.3);
    }
    out /= freqs.length;

    // Mix with noise
    out = out * 0.5 + Oscillator.noise() * 0.5;

    // Bandpass-ish: reduce low end
    return out * env * 0.25;
  }

  // Soft snare/rim
  static snare(t, onset) {
    const elapsed = t - onset;
    if (elapsed < 0 || elapsed > 0.4) return 0;

    const env = Envelope.perc(t, onset, 0.001, 0.2, 2.5);
    const toneEnv = Envelope.perc(t, onset, 0.001, 0.05, 3);

    // Body tone
    let out = Math.sin(elapsed * 180 * 2 * Math.PI) * toneEnv * 0.5;
    // Noise
    out += Oscillator.noise() * env * 0.4;

    return out * 0.35;
  }
}

class WavEncoder {
  constructor(sampleRate, channels) {
    this.sampleRate = sampleRate;
    this.channels = channels;
  }

  createHeader(totalSamples) {
    const bytesPerSample = 2; // 16-bit
    const dataSize = totalSamples * this.channels * bytesPerSample;
    const buffer = Buffer.alloc(44);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // chunk size
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(this.channels, 22);
    buffer.writeUInt32LE(this.sampleRate, 24);
    buffer.writeUInt32LE(this.sampleRate * this.channels * bytesPerSample, 28);
    buffer.writeUInt16LE(this.channels * bytesPerSample, 32);
    buffer.writeUInt16LE(bytesPerSample * 8, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    return buffer;
  }

  encodeChunk(leftChannel, rightChannel) {
    const samples = leftChannel.length;
    const buffer = Buffer.alloc(samples * this.channels * 2);
    let offset = 0;

    for (let i = 0; i < samples; i++) {
      // Soft clip
      const l = Math.max(-1, Math.min(1, Math.tanh(leftChannel[i])));
      const r = Math.max(-1, Math.min(1, Math.tanh(rightChannel[i])));

      buffer.writeInt16LE(Math.floor(l * 32767), offset);
      offset += 2;
      if (this.channels === 2) {
        buffer.writeInt16LE(Math.floor(r * 32767), offset);
        offset += 2;
      }
    }

    return buffer;
  }
}

module.exports = { Oscillator, Envelope, Voices, WavEncoder };
