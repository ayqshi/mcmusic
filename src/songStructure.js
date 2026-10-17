// Song structure manager - defines phases, dynamics, and arrangement

class SongStructure {
  constructor(bpm, duration, seed) {
    this.bpm = bpm;
    this.duration = duration;
    this.seed = seed;
    this.beatsPerBar = 4;
    this.beatDuration = 60 / bpm;
    this.barDuration = this.beatDuration * this.beatsPerBar;
    this.stepsPerBeat = 8; // 32 steps / 4 beats
    this.stepDuration = this.beatDuration / this.stepsPerBeat;
    this.totalBars = Math.floor(duration / this.barDuration);

    // RNG for structure decisions
    this.rng = this.createRNG(seed + 777);

    this.buildStructure();
  }

  createRNG(seed) {
    let s = seed | 0;
    return () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  buildStructure() {
    // C418-style structure: gets to the point fast
    // Short intro → establish theme → build → climax/drop → wind down → end
    // Total ~2 minutes

    this.sections = [];
    let currentBar = 0;

    // === INTRO (2-4 bars) - very short, atmospheric ===
    const introBars = 2 + Math.floor(this.rng() * 3);
    this.sections.push({
      name: 'intro',
      startBar: currentBar,
      endBar: currentBar + introBars,
      layers: {
        pad: true, piano: false, pluck: false, bass: false,
        arp: false, kick: false, hihat: false, snare: false, bell: true
      },
      dynamics: 0.3,
      density: 0.2,
      reverbMix: 0.5,
      delayMix: 0.3,
      filterCutoff: 0.4,
      swingAmount: 0
    });
    currentBar += introBars;

    // === PHASE A (8 bars) - main theme established ===
    const phaseABars = 8;
    this.sections.push({
      name: 'phase_a',
      startBar: currentBar,
      endBar: currentBar + phaseABars,
      layers: {
        pad: true, piano: true, pluck: false, bass: true,
        arp: false, kick: false, hihat: false, snare: false, bell: true
      },
      dynamics: 0.5,
      density: 0.4,
      reverbMix: 0.4,
      delayMix: 0.25,
      filterCutoff: 0.6,
      swingAmount: 0.1
    });
    currentBar += phaseABars;

    // === BUILD (8 bars) - adding layers ===
    const buildBars = 8;
    this.sections.push({
      name: 'build',
      startBar: currentBar,
      endBar: currentBar + buildBars,
      layers: {
        pad: true, piano: true, pluck: true, bass: true,
        arp: true, kick: true, hihat: true, snare: false, bell: true
      },
      dynamics: 0.65,
      density: 0.6,
      reverbMix: 0.35,
      delayMix: 0.2,
      filterCutoff: 0.75,
      swingAmount: 0.15
    });
    currentBar += buildBars;

    // === CLIMAX / PEAK (8-12 bars) - full orchestration, beat drop ===
    const climaxBars = 10;
    this.sections.push({
      name: 'climax',
      startBar: currentBar,
      endBar: currentBar + climaxBars,
      layers: {
        pad: true, piano: true, pluck: true, bass: true,
        arp: true, kick: true, hihat: true, snare: true, bell: true
      },
      dynamics: 0.85,
      density: 0.8,
      reverbMix: 0.3,
      delayMix: 0.15,
      filterCutoff: 1.0,
      swingAmount: 0.2
    });
    currentBar += climaxBars;

    // === BREAKDOWN (4 bars) - sudden strip-down for contrast ===
    const breakdownBars = 4;
    this.sections.push({
      name: 'breakdown',
      startBar: currentBar,
      endBar: currentBar + breakdownBars,
      layers: {
        pad: true, piano: true, pluck: false, bass: false,
        arp: false, kick: false, hihat: false, snare: false, bell: true
      },
      dynamics: 0.35,
      density: 0.25,
      reverbMix: 0.55,
      delayMix: 0.35,
      filterCutoff: 0.5,
      swingAmount: 0
    });
    currentBar += breakdownBars;

    // === SECOND PEAK (8 bars) - return with variation, key moment ===
    const peak2Bars = 8;
    this.sections.push({
      name: 'peak2',
      startBar: currentBar,
      endBar: currentBar + peak2Bars,
      layers: {
        pad: true, piano: true, pluck: true, bass: true,
        arp: true, kick: true, hihat: true, snare: true, bell: true
      },
      dynamics: 0.9,
      density: 0.85,
      reverbMix: 0.3,
      delayMix: 0.15,
      filterCutoff: 1.0,
      swingAmount: 0.2
    });
    currentBar += peak2Bars;

    // === OUTRO (remaining bars) - fade and dissolve ===
    const outroBars = Math.max(4, this.totalBars - currentBar);
    this.sections.push({
      name: 'outro',
      startBar: currentBar,
      endBar: currentBar + outroBars,
      layers: {
        pad: true, piano: true, pluck: false, bass: false,
        arp: false, kick: false, hihat: false, snare: false, bell: true
      },
      dynamics: 0.3,
      density: 0.15,
      reverbMix: 0.6,
      delayMix: 0.4,
      filterCutoff: 0.35,
      swingAmount: 0
    });
  }

  getSectionAtTime(t) {
    const bar = t / this.barDuration;
    for (let i = this.sections.length - 1; i >= 0; i--) {
      if (bar >= this.sections[i].startBar) return this.sections[i];
    }
    return this.sections[0];
  }

  // Get interpolated parameters (smooth transitions between sections)
  getParamsAtTime(t) {
    const bar = t / this.barDuration;
    const section = this.getSectionAtTime(t);
    const nextSectionIdx = this.sections.indexOf(section) + 1;

    // Find transition zone (last 2 beats of section)
    const transitionStart = (section.endBar - 0.5) * this.barDuration;
    const transitionEnd = section.endBar * this.barDuration;

    if (nextSectionIdx < this.sections.length && t >= transitionStart && t < transitionEnd) {
      const nextSection = this.sections[nextSectionIdx];
      const blend = (t - transitionStart) / (transitionEnd - transitionStart);
      const smooth = blend * blend * (3 - 2 * blend); // smoothstep

      return {
        section: section.name,
        nextSection: nextSection.name,
        layers: section.layers, // layers switch at boundary
        dynamics: section.dynamics + (nextSection.dynamics - section.dynamics) * smooth,
        density: section.density + (nextSection.density - section.density) * smooth,
        reverbMix: section.reverbMix + (nextSection.reverbMix - section.reverbMix) * smooth,
        delayMix: section.delayMix + (nextSection.delayMix - section.delayMix) * smooth,
        filterCutoff: section.filterCutoff + (nextSection.filterCutoff - section.filterCutoff) * smooth,
        swingAmount: section.swingAmount + (nextSection.swingAmount - section.swingAmount) * smooth,
        bar: bar,
        beatInBar: (bar % 1) * this.beatsPerBar,
        globalProgress: t / this.duration,
        isFading: t > this.duration - 5 // last 5 seconds fade
      };
    }

    return {
      section: section.name,
      nextSection: null,
      layers: section.layers,
      dynamics: section.dynamics,
      density: section.density,
      reverbMix: section.reverbMix,
      delayMix: section.delayMix,
      filterCutoff: section.filterCutoff,
      swingAmount: section.swingAmount,
      bar: bar,
      beatInBar: (bar % 1) * this.beatsPerBar,
      globalProgress: t / this.duration,
      isFading: t > this.duration - 5
    };
  }

  // Get the step index (0-31) for a given time, accounting for swing
  getStepAtTime(t, swingAmount) {
    const beatPos = (t / this.beatDuration) % this.beatsPerBar;
    const rawStep = beatPos * this.stepsPerBeat;
    const stepIndex = Math.floor(rawStep) % 32;

    // Calculate swing-adjusted timing
    const stepInPair = stepIndex % 2;
    if (stepInPair === 1 && swingAmount > 0) {
      // Delay odd steps for swing feel
      const swingDelay = swingAmount * this.stepDuration * 0.5;
      const adjustedTime = t - swingDelay;
      const adjustedBeatPos = (adjustedTime / this.beatDuration) % this.beatsPerBar;
      return Math.floor(adjustedBeatPos * this.stepsPerBeat) % 32;
    }

    return stepIndex;
  }
}

module.exports = { SongStructure };
