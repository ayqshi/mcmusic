// Audio effects: reverb, delay, EQ, compression, stereo processing

class DelayLine {
  constructor(maxSamples) {
    this.buffer = new Float64Array(maxSamples);
    this.writePos = 0;
    this.length = maxSamples;
  }

  write(sample) {
    this.buffer[this.writePos] = sample;
    this.writePos = (this.writePos + 1) % this.length;
  }

  read(delaySamples) {
    const readPos = ((this.writePos - Math.floor(delaySamples)) % this.length + this.length) % this.length;
    return this.buffer[readPos];
  }

  readInterpolated(delaySamples) {
    const floor = Math.floor(delaySamples);
    const frac = delaySamples - floor;
    const a = this.read(floor);
    const b = this.read(floor + 1);
    return a + (b - a) * frac;
  }
}

class AllPassFilter {
  constructor(delaySamples, gain) {
    this.delay = new DelayLine(delaySamples + 1);
    this.delaySamples = delaySamples;
    this.gain = gain;
  }

  process(input) {
    const delayed = this.delay.read(this.delaySamples);
    const output = -this.gain * input + delayed + this.gain * delayed;
    this.delay.write(input + this.gain * delayed);
    // Simplified: standard all-pass topology
    const v = input + delayed * this.gain;
    const out = delayed - this.gain * v;
    this.delay.write(v);
    return out;
  }
}

class CombFilter {
  constructor(delaySamples, feedback, damping) {
    this.delay = new DelayLine(delaySamples + 1);
    this.delaySamples = delaySamples;
    this.feedback = feedback;
    this.damping = damping;
    this.filterState = 0;
  }

  process(input) {
    const delayed = this.delay.read(this.delaySamples);
    // One-pole lowpass damping
    this.filterState = delayed * (1 - this.damping) + this.filterState * this.damping;
    this.delay.write(input + this.filterState * this.feedback);
    return delayed;
  }
}

class Reverb {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;

    // Schroeder-Moorer reverb topology
    // 8 comb filters with prime-number delays for density
    const combDelays = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116];
    const feedback = 0.84; // long, lush reverb tail
    const damping = 0.35; // warm tone

    this.combsL = combDelays.map(d => new CombFilter(d, feedback, damping));
    this.combsR = combDelays.map(d => new CombFilter(d + 23, feedback, damping)); // stereo offset

    // 4 all-pass filters for diffusion
    const apDelays = [225, 556, 441, 341];
    this.allPassesL = apDelays.map(d => new AllPassFilter(d, 0.5));
    this.allPassesR = apDelays.map(d => new AllPassFilter(d + 17, 0.5));

    this.mix = 0.35; // wet/dry
  }

  process(inputL, inputR) {
    // Sum combs in parallel
    let wetL = 0, wetR = 0;
    for (const comb of this.combsL) wetL += comb.process(inputL);
    for (const comb of this.combsR) wetR += comb.process(inputR);
    wetL /= this.combsL.length;
    wetR /= this.combsR.length;

    // Series all-pass
    for (const ap of this.allPassesL) wetL = ap.process(wetL);
    for (const ap of this.allPassesR) wetR = ap.process(wetR);

    return [
      inputL * (1 - this.mix) + wetL * this.mix,
      inputR * (1 - this.mix) + wetR * this.mix
    ];
  }

  setMix(mix) {
    this.mix = mix;
  }
}

class StereoDelay {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    const maxDelay = sampleRate * 2;
    this.delayL = new DelayLine(maxDelay);
    this.delayR = new DelayLine(maxDelay);
    this.timeL = 0.375; // dotted eighth
    this.timeR = 0.5; // quarter
    this.feedback = 0.3;
    this.mix = 0.2;
    this.filterStateL = 0;
    this.filterStateR = 0;
    this.damping = 0.4;
  }

  process(inputL, inputR) {
    const delaySamplesL = this.timeL * this.sampleRate;
    const delaySamplesR = this.timeR * this.sampleRate;

    const delayedL = this.delayL.readInterpolated(delaySamplesL);
    const delayedR = this.delayR.readInterpolated(delaySamplesR);

    // Damped feedback
    this.filterStateL = delayedL * (1 - this.damping) + this.filterStateL * this.damping;
    this.filterStateR = delayedR * (1 - this.damping) + this.filterStateR * this.damping;

    // Cross-feed for ping-pong effect
    this.delayL.write(inputL + this.filterStateR * this.feedback);
    this.delayR.write(inputR + this.filterStateL * this.feedback);

    return [
      inputL * (1 - this.mix) + delayedL * this.mix,
      inputR * (1 - this.mix) + delayedR * this.mix
    ];
  }

  setTempo(bpm) {
    const beatDuration = 60 / bpm;
    this.timeL = beatDuration * 0.75; // dotted eighth
    this.timeR = beatDuration; // quarter
  }
}

class EQ {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    // Biquad filter states
    this.lowState = { x1: 0, x2: 0, y1: 0, y2: 0 };
    this.midState = { x1: 0, x2: 0, y1: 0, y2: 0 };
    this.highState = { x1: 0, x2: 0, y1: 0, y2: 0 };

    // Default: slight low-end warmth, cut some mids, gentle high shelf
    this.setLowShelf(200, 2.0); // +2dB at 200Hz
    this.setMidPeak(2000, -1.5, 1.0); // -1.5dB at 2kHz
    this.setHighShelf(8000, 1.0); // +1dB at 8kHz
  }

  setLowShelf(freq, gainDb) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * freq / this.sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / 2 * Math.sqrt(2);
    const sqrtA = Math.sqrt(A);

    this.lowCoeffs = {
      b0: A * ((A + 1) - (A - 1) * cosw0 + 2 * sqrtA * alpha),
      b1: 2 * A * ((A - 1) - (A + 1) * cosw0),
      b2: A * ((A + 1) - (A - 1) * cosw0 - 2 * sqrtA * alpha),
      a0: (A + 1) + (A - 1) * cosw0 + 2 * sqrtA * alpha,
      a1: -2 * ((A - 1) + (A + 1) * cosw0),
      a2: (A + 1) + (A - 1) * cosw0 - 2 * sqrtA * alpha
    };
  }

  setMidPeak(freq, gainDb, q) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * freq / this.sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / (2 * q);

    this.midCoeffs = {
      b0: 1 + alpha * A,
      b1: -2 * cosw0,
      b2: 1 - alpha * A,
      a0: 1 + alpha / A,
      a1: -2 * cosw0,
      a2: 1 - alpha / A
    };
  }

  setHighShelf(freq, gainDb) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * freq / this.sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / 2 * Math.sqrt(2);
    const sqrtA = Math.sqrt(A);

    this.highCoeffs = {
      b0: A * ((A + 1) + (A - 1) * cosw0 + 2 * sqrtA * alpha),
      b1: -2 * A * ((A - 1) + (A + 1) * cosw0),
      b2: A * ((A + 1) + (A - 1) * cosw0 - 2 * sqrtA * alpha),
      a0: (A + 1) - (A - 1) * cosw0 + 2 * sqrtA * alpha,
      a1: 2 * ((A - 1) - (A + 1) * cosw0),
      a2: (A + 1) - (A - 1) * cosw0 - 2 * sqrtA * alpha
    };
  }

  biquad(sample, coeffs, state) {
    const out = (coeffs.b0 / coeffs.a0) * sample
      + (coeffs.b1 / coeffs.a0) * state.x1
      + (coeffs.b2 / coeffs.a0) * state.x2
      - (coeffs.a1 / coeffs.a0) * state.y1
      - (coeffs.a2 / coeffs.a0) * state.y2;

    state.x2 = state.x1;
    state.x1 = sample;
    state.y2 = state.y1;
    state.y1 = out;

    return out;
  }

  process(sample) {
    let out = sample;
    if (this.lowCoeffs) out = this.biquad(out, this.lowCoeffs, this.lowState);
    if (this.midCoeffs) out = this.biquad(out, this.midCoeffs, this.midState);
    if (this.highCoeffs) out = this.biquad(out, this.highCoeffs, this.highState);
    return out;
  }
}

class Compressor {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.threshold = 0.6;
    this.ratio = 3;
    this.attack = 0.005;
    this.release = 0.1;
    this.makeupGain = 1.2;
    this.envelope = 0;
  }

  process(sample) {
    const abs = Math.abs(sample);
    const attackCoeff = Math.exp(-1 / (this.sampleRate * this.attack));
    const releaseCoeff = Math.exp(-1 / (this.sampleRate * this.release));

    if (abs > this.envelope) {
      this.envelope = attackCoeff * this.envelope + (1 - attackCoeff) * abs;
    } else {
      this.envelope = releaseCoeff * this.envelope + (1 - releaseCoeff) * abs;
    }

    let gain = 1;
    if (this.envelope > this.threshold) {
      const overDb = 20 * Math.log10(this.envelope / this.threshold);
      const compressedDb = overDb / this.ratio;
      gain = Math.pow(10, (compressedDb - overDb) / 20);
    }

    return sample * gain * this.makeupGain;
  }
}

class StereoWidener {
  constructor() {
    this.width = 0.3;
  }

  process(l, r) {
    const mid = (l + r) * 0.5;
    const side = (l - r) * 0.5;
    return [
      mid + side * (1 + this.width),
      mid - side * (1 + this.width)
    ];
  }
}

module.exports = { Reverb, StereoDelay, EQ, Compressor, StereoWidener, DelayLine };
