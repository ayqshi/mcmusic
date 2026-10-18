// Comprehensive music theory engine for C418-style generation

const NOTE_FREQUENCIES = {};
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Pre-calculate all MIDI note frequencies
for (let midi = 0; midi < 128; midi++) {
  NOTE_FREQUENCIES[midi] = 440 * Math.pow(2, (midi - 69) / 12);
}

const SCALES = {
  minor_pentatonic: [0, 3, 5, 7, 10],
  major_pentatonic: [0, 2, 4, 7, 9],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
  whole_tone: [0, 2, 4, 6, 8, 10]
};

const KEY_TO_MIDI = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };

// C418-style chord progressions (scale degree based, 0-indexed)
const CHORD_PROGRESSIONS = {
  ambient_drift: [
    [0, 2, 4], // i
    [3, 5, 0], // iv
    [5, 0, 2], // VI
    [4, 6, 1], // v
  ],
  melancholy: [
    [0, 2, 4], // i
    [5, 0, 2], // VI
    [3, 5, 0], // iv
    [6, 1, 3], // VII
  ],
  hopeful: [
    [0, 2, 4], // I
    [4, 6, 1], // v
    [3, 5, 0], // IV
    [0, 2, 4], // I
  ],
  discovery: [
    [0, 2, 4],
    [1, 3, 5],
    [5, 0, 2],
    [4, 6, 1],
  ],
  tension: [
    [0, 2, 4],
    [6, 1, 3],
    [5, 0, 2],
    [3, 5, 0],
  ]
};

class MusicTheory {
  constructor(key, scaleName, seed) {
    this.rootNote = KEY_TO_MIDI[key] || 0;
    this.scaleName = scaleName;
    this.scaleIntervals = SCALES[scaleName] || SCALES.minor_pentatonic;
    this.seed = seed;
    this.rng = this.createRNG(seed);

    // Pick a chord progression
    const progNames = Object.keys(CHORD_PROGRESSIONS);
    this.chordProgression = CHORD_PROGRESSIONS[progNames[this.rngInt(0, progNames.length - 1)]];
  }

  createRNG(seed) {
    // Mulberry32
    let s = seed | 0;
    return () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  rngFloat(min, max) {
    return min + this.rng() * (max - min);
  }

  rngInt(min, max) {
    return Math.floor(this.rngFloat(min, max + 0.999));
  }

  rngChoice(arr) {
    return arr[this.rngInt(0, arr.length - 1)];
  }

  rngWeighted(items, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.rng() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  // Get MIDI note for a scale degree at a given octave
  getNote(scaleDegree, octave) {
    const wrappedDegree = ((scaleDegree % this.scaleIntervals.length) + this.scaleIntervals.length) % this.scaleIntervals.length;
    const octaveOffset = Math.floor(scaleDegree / this.scaleIntervals.length);
    const midi = this.rootNote + (octave + octaveOffset) * 12 + this.scaleIntervals[wrappedDegree];
    return midi;
  }

  getFrequency(midi) {
    return NOTE_FREQUENCIES[Math.max(0, Math.min(127, midi))] || 440;
  }

  // Get chord notes for a given section/bar position
  getChordNotes(barIndex, octave) {
    const chordIdx = barIndex % this.chordProgression.length;
    const chord = this.chordProgression[chordIdx];
    return chord.map(degree => this.getNote(degree, octave));
  }

  // Generate a melody motif (array of {scaleDegree, duration} )
  generateMotif(length, range) {
    const motif = [];
    let currentDegree = this.rngInt(0, range);

    for (let i = 0; i < length; i++) {
      // C418 tends to use small intervals with occasional leaps
      const intervalWeights = [0, 1, -1, 2, -2, 3, -3];
      const weights = [3, 5, 5, 3, 3, 1, 1]; // prefer steps over leaps
      const interval = this.rngWeighted(intervalWeights, weights);
      currentDegree = Math.max(0, Math.min(range, currentDegree + interval));

      // Rhythmic variation - C418 uses lots of rests and varying note lengths
      const durationChoices = [0.25, 0.5, 0.5, 1, 1, 1.5, 2];
      const durWeights = [1, 3, 3, 4, 4, 2, 1];
      const duration = this.rngWeighted(durationChoices, durWeights);

      const isRest = this.rng() < 0.15; // 15% chance of rest

      motif.push({
        scaleDegree: currentDegree,
        duration,
        velocity: isRest ? 0 : this.rngFloat(0.4, 0.9),
        isRest
      });
    }

    return motif;
  }

  // Voice leading - smooth transition between chords
  voiceLead(fromChord, toChord) {
    return toChord.map((note, i) => {
      if (!fromChord[i]) return note;
      const diff = note - fromChord[i];
      // If interval > 6 semitones, use inversion
      if (Math.abs(diff) > 6) {
        return diff > 0 ? note - 12 : note + 12;
      }
      return note;
    });
  }
}

module.exports = { MusicTheory, SCALES, NOTE_FREQUENCIES };
if (typeof window !== 'undefined') window.MusicTheoryModule = { MusicTheory, SCALES, NOTE_FREQUENCIES };
