// Pattern generation for the 32-step sequencer

class PatternGenerator {
  constructor(theory) {
    this.theory = theory;
  }

  // Generate a 32-step kick pattern
  generateKick(density, variation) {
    const pattern = new Array(32).fill(0);
    // C418 style: minimal, often on 1 and occasional syncopation
    const basePattern = [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
                         1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];

    for (let i = 0; i < 32; i++) {
      if (basePattern[i]) {
        pattern[i] = 0.8 + this.theory.rngFloat(-0.1, 0.1);
      } else if (this.theory.rng() < density * 0.15) {
        pattern[i] = this.theory.rngFloat(0.3, 0.5); // ghost notes
      }
    }

    // Add variation
    if (variation > 0.5) {
      const extraHits = [4, 12, 20, 28]; // offbeat positions
      for (const pos of extraHits) {
        if (this.theory.rng() < variation * 0.3) {
          pattern[pos] = this.theory.rngFloat(0.4, 0.7);
        }
      }
    }

    return pattern;
  }

  // Generate hi-hat patterns
  generateHiHat(density, swing) {
    const pattern = new Array(32).fill(0);

    for (let i = 0; i < 32; i++) {
      // Even 8ths base
      if (i % 4 === 0) {
        pattern[i] = this.theory.rng() < density ? this.theory.rngFloat(0.5, 0.8) : 0;
      } else if (i % 2 === 0) {
        pattern[i] = this.theory.rng() < density * 0.7 ? this.theory.rngFloat(0.3, 0.6) : 0;
      } else {
        pattern[i] = this.theory.rng() < density * 0.3 ? this.theory.rngFloat(0.1, 0.4) : 0;
      }
    }

    return { pattern, swing };
  }

  // Generate melodic pattern (returns scale degrees + velocities for 32 steps)
  generateMelodicPattern(motif, stepsPerBeat) {
    const pattern = new Array(32).fill(null);
    let step = 0;

    for (const note of motif) {
      if (step >= 32) break;
      const stepDuration = Math.round(note.duration * stepsPerBeat);

      if (!note.isRest) {
        pattern[step] = {
          scaleDegree: note.scaleDegree,
          velocity: note.velocity,
          duration: note.duration
        };
      }

      step += Math.max(1, stepDuration);
    }

    return pattern;
  }

  // Generate bass pattern following chord roots
  generateBassPattern(chordIndex, density) {
    const pattern = new Array(32).fill(null);
    const chord = this.theory.chordProgression[chordIndex % this.theory.chordProgression.length];
    const root = chord[0];

    // C418 bass: sparse, mainly root notes with occasional movement
    const positions = [0, 8, 16, 24]; // downbeats

    for (const pos of positions) {
      if (this.theory.rng() < density) {
        pattern[pos] = {
          scaleDegree: root,
          velocity: this.theory.rngFloat(0.6, 0.9),
          duration: this.theory.rngFloat(0.5, 2.0)
        };
      }
    }

    // Occasional passing tones
    if (this.theory.rng() < density * 0.4) {
      const passingPos = this.theory.rngChoice([4, 12, 20, 28]);
      const fifth = chord[2] !== undefined ? chord[2] : chord[0] + 4;
      pattern[passingPos] = {
        scaleDegree: fifth,
        velocity: this.theory.rngFloat(0.3, 0.6),
        duration: 0.5
      };
    }

    return pattern;
  }

  // Generate pad/chord pattern
  generatePadPattern(chordIndex) {
    const pattern = new Array(32).fill(null);
    const chord = this.theory.chordProgression[chordIndex % this.theory.chordProgression.length];

    // Pads typically hold for full bars or half bars
    pattern[0] = {
      chordDegrees: chord,
      velocity: this.theory.rngFloat(0.3, 0.6),
      duration: 4.0 // whole bar sustain
    };

    return pattern;
  }

  // Generate arpeggio pattern from chord tones
  generateArpPattern(chordIndex, style) {
    const pattern = new Array(32).fill(null);
    const chord = this.theory.chordProgression[chordIndex % this.theory.chordProgression.length];

    let noteSequence;
    switch (style) {
      case 'up':
        noteSequence = [...chord];
        break;
      case 'down':
        noteSequence = [...chord].reverse();
        break;
      case 'updown':
        noteSequence = [...chord, ...chord.slice(1, -1).reverse()];
        break;
      case 'random':
        noteSequence = chord.map(c => c);
        for (let i = noteSequence.length - 1; i > 0; i--) {
          const j = this.theory.rngInt(0, i);
          [noteSequence[i], noteSequence[j]] = [noteSequence[j], noteSequence[i]];
        }
        break;
      default:
        noteSequence = [...chord];
    }

    const stepInterval = this.theory.rngChoice([2, 4, 3, 6]);
    let noteIdx = 0;

    for (let i = 0; i < 32; i += stepInterval) {
      const degree = noteSequence[noteIdx % noteSequence.length];
      if (this.theory.rng() < 0.85) { // occasional skips for C418 feel
        pattern[i] = {
          scaleDegree: degree,
          velocity: this.theory.rngFloat(0.3, 0.7),
          duration: (stepInterval / 8) * 0.8
        };
      }
      noteIdx++;
    }

    return pattern;
  }
}

module.exports = { PatternGenerator };
