// Main sequencer - ties everything together

// Universal require - works in Node and browser
const { MusicTheory } = (typeof require !== 'undefined') ? require('./musicTheory') : window.MusicTheoryModule;
const { PatternGenerator } = (typeof require !== 'undefined') ? require('./patterns') : window.PatternsModule;
const { Voices } = (typeof require !== 'undefined') ? require('./synthesis') : window.SynthesisModule;
const { Reverb, StereoDelay, EQ, Compressor, StereoWidener } = (typeof require !== 'undefined') ? require('./effects') : window.EffectsModule;

class Sequencer {
  constructor(config, songStructure) {
    this.config = config;
    this.structure = songStructure;
    this.sampleRate = 44100;

    this.theory = new MusicTheory(config.key, config.scale, config.seed);
    this.patternGen = new PatternGenerator(this.theory);

    // Effects chain
    this.reverb = new Reverb(this.sampleRate);
    this.delay = new StereoDelay(this.sampleRate);
    this.delay.setTempo(config.bpm);
    this.eqL = new EQ(this.sampleRate);
    this.eqR = new EQ(this.sampleRate);
    this.compressorL = new Compressor(this.sampleRate);
    this.compressorR = new Compressor(this.sampleRate);
    this.widener = new StereoWidener();

    // Phase tracking for oscillators
    this.phases = {};
    this.notePhases = new Map();

    // Pre-generate all patterns for the song
    this.generateAllPatterns();

    // Active notes tracking
    this.activeNotes = [];

    // Last step to detect step changes
    this.lastStep = -1;
    this.lastBar = -1;
    this.currentBarPatterns = null;

    // Low-pass filter state for filter sweeps
    this.lpfStateL = 0;
    this.lpfStateR = 0;
  }

  generateAllPatterns() {
    this.barPatterns = {};

    const totalBars = this.structure.totalBars;

    // Generate motifs (reusable melodic phrases)
    this.pianoMotifA = this.theory.generateMotif(12, 10);
    this.pianoMotifB = this.theory.generateMotif(10, 8);
    this.pluckMotifA = this.theory.generateMotif(8, 7);
    this.bellMotif = this.theory.generateMotif(6, 12);

    const arpStyles = ['up', 'down', 'updown', 'random'];

    for (let bar = 0; bar < totalBars; bar++) {
      const chordIndex = bar % this.theory.chordProgression.length;
      const section = this.structure.getSectionAtTime(bar * this.structure.barDuration);

      // Vary motif usage by section
      const useMotifB = (section.name === 'peak2' || section.name === 'climax');
      const pianoMotif = useMotifB ? this.pianoMotifB : this.pianoMotifA;

      // Create variation every 4 bars
      const variationSeed = Math.floor(bar / 4);

      this.barPatterns[bar] = {
        kick: this.patternGen.generateKick(section.density, section.density),
        hihat: this.patternGen.generateHiHat(section.density, section.swingAmount),
        piano: this.patternGen.generateMelodicPattern(pianoMotif, this.structure.stepsPerBeat),
        pluck: this.patternGen.generateMelodicPattern(this.pluckMotifA, this.structure.stepsPerBeat),
        bass: this.patternGen.generateBassPattern(chordIndex, section.density),
        pad: this.patternGen.generatePadPattern(chordIndex),
        arp: this.patternGen.generateArpPattern(chordIndex, arpStyles[variationSeed % arpStyles.length]),
        bell: this.patternGen.generateMelodicPattern(this.bellMotif, this.structure.stepsPerBeat),
        snare: this.generateSnarePattern(section.density)
      };
    }
  }

  generateSnarePattern(density) {
    const pattern = new Array(32).fill(0);
    // Snare on beats 2 and 4 (steps 8 and 24)
    if (this.theory.rng() < density) pattern[8] = this.theory.rngFloat(0.5, 0.8);
    if (this.theory.rng() < density) pattern[24] = this.theory.rngFloat(0.5, 0.8);
    // Ghost notes
    if (this.theory.rng() < density * 0.3) {
      const ghostPos = this.theory.rngChoice([6, 14, 22, 30]);
      pattern[ghostPos] = this.theory.rngFloat(0.15, 0.3);
    }
    return pattern;
  }

  getPhase(key, freq, dt) {
    if (!this.phases[key]) this.phases[key] = 0;
    this.phases[key] = (this.phases[key] + freq * dt) % 1;
    return this.phases[key];
  }

  triggerNote(voice, scaleDegree, octave, velocity, time, duration) {
    const midi = this.theory.getNote(scaleDegree, octave);
    const freq = this.theory.getFrequency(midi);
    const id = `${voice}_${midi}_${time.toFixed(4)}`;

    this.activeNotes.push({
      id,
      voice,
      freq,
      midi,
      velocity,
      onset: time,
      duration,
      offTime: time + duration,
      phase: 0,
      alive: true
    });
  }

  getSample(t) {
    const dt = 1 / this.sampleRate;
    const params = this.structure.getParamsAtTime(t);
    const bar = Math.floor(params.bar);
    const step = this.structure.getStepAtTime(t, params.swingAmount);

    // Get patterns for current bar
    const patterns = this.barPatterns[bar] || this.barPatterns[0];

    // Detect new step
    if (step !== this.lastStep || bar !== this.lastBar) {
      this.lastStep = step;
      this.lastBar = bar;

      const layers = params.layers;

      // Trigger piano notes
      if (layers.piano && patterns.piano && patterns.piano[step]) {
        const note = patterns.piano[step];
        this.triggerNote('piano', note.scaleDegree, 4, note.velocity * params.dynamics, t, note.duration);
      }

      // Trigger pluck
      if (layers.pluck && patterns.pluck && patterns.pluck[step]) {
        const note = patterns.pluck[step];
        this.triggerNote('pluck', note.scaleDegree, 5, note.velocity * params.dynamics * 0.7, t, note.duration);
      }

      // Trigger bell
      if (layers.bell && patterns.bell && patterns.bell[step]) {
        const note = patterns.bell[step];
        if (this.theory.rng() < 0.4) { // bells are sparse
          this.triggerNote('bell', note.scaleDegree, 5, note.velocity * params.dynamics * 0.5, t, note.duration);
        }
      }

      // Trigger arp
      if (layers.arp && patterns.arp && patterns.arp[step]) {
        const note = patterns.arp[step];
        this.triggerNote('pluck', note.scaleDegree, 5, note.velocity * params.dynamics * 0.5, t, note.duration);
      }

      // Trigger bass
      if (layers.bass && patterns.bass && patterns.bass[step]) {
        const note = patterns.bass[step];
        this.triggerNote('bass', note.scaleDegree, 2, note.velocity * params.dynamics, t, note.duration);
      }

      // Trigger pad
      if (layers.pad && patterns.pad && patterns.pad[step]) {
        const padNote = patterns.pad[step];
        for (const degree of padNote.chordDegrees) {
          this.triggerNote('pad', degree, 3, padNote.velocity * params.dynamics, t, padNote.duration);
        }
      }

      // Trigger kick
      if (layers.kick && patterns.kick && patterns.kick[step] > 0) {
        this.activeNotes.push({
          id: `kick_${t}`,
          voice: 'kick',
          freq: 0,
          velocity: patterns.kick[step] * params.dynamics,
          onset: t,
          duration: 0.5,
          offTime: t + 0.5,
          phase: 0,
          alive: true
        });
      }

      // Trigger hihat
      if (layers.hihat && patterns.hihat && patterns.hihat.pattern[step] > 0) {
        const isOpen = step % 8 === 4 && this.theory.rng() < 0.3;
        this.activeNotes.push({
          id: `hihat_${t}`,
          voice: 'hihat',
          freq: 0,
          velocity: patterns.hihat.pattern[step] * params.dynamics,
          onset: t,
          duration: isOpen ? 0.3 : 0.06,
          offTime: t + (isOpen ? 0.3 : 0.06),
          phase: 0,
          alive: true,
          open: isOpen
        });
      }

      // Trigger snare
      if (layers.snare && patterns.snare && patterns.snare[step] > 0) {
        this.activeNotes.push({
          id: `snare_${t}`,
          voice: 'snare',
          freq: 0,
          velocity: patterns.snare[step] * params.dynamics,
          onset: t,
          duration: 0.3,
          offTime: t + 0.3,
          phase: 0,
          alive: true
        });
      }
    }

    // === Render all active notes ===
    let mixL = 0, mixR = 0;

    for (let i = this.activeNotes.length - 1; i >= 0; i--) {
      const note = this.activeNotes[i];
      const elapsed = t - note.onset;

      // Remove dead notes
      if (elapsed > note.duration + 5) { // 5s tail for reverb
        this.activeNotes.splice(i, 1);
        continue;
      }

      note.phase += note.freq * dt;
      let sample = 0;

      switch (note.voice) {
        case 'piano':
          sample = Voices.piano(note.phase, t, note.onset, note.freq) * note.velocity;
          break;
        case 'pad':
          sample = Voices.pad(note.phase, t, note.onset, note.duration) * note.velocity;
          break;
        case 'pluck':
          sample = Voices.pluck(note.phase, t, note.onset) * note.velocity;
          break;
        case 'bass':
          sample = Voices.bass(note.phase, t, note.onset, note.duration) * note.velocity;
          break;
        case 'bell':
          sample = Voices.bell(note.phase, t, note.onset) * note.velocity;
          break;
        case 'kick':
          sample = Voices.kick(t, note.onset) * note.velocity;
          break;
        case 'hihat':
          sample = Voices.hihat(t, note.onset, note.open) * note.velocity;
          break;
        case 'snare':
          sample = Voices.snare(t, note.onset) * note.velocity;
          break;
      }

      // Pan based on voice
      let pan = 0.5;
      switch (note.voice) {
        case 'piano': pan = 0.4; break;
        case 'pad': pan = 0.5; break;
        case 'pluck': pan = 0.65; break;
        case 'bass': pan = 0.5; break;
        case 'bell': pan = 0.35; break;
        case 'kick': pan = 0.5; break;
        case 'hihat': pan = 0.6 + Math.sin(t * 0.5) * 0.1; break;
        case 'snare': pan = 0.45; break;
      }

      const panL = Math.cos(pan * Math.PI * 0.5);
      const panR = Math.sin(pan * Math.PI * 0.5);
      mixL += sample * panL;
      mixR += sample * panR;
    }

    // Limit active notes to prevent CPU overload
    if (this.activeNotes.length > 80) {
      // Sort by onset time and remove oldest
      this.activeNotes.sort((a, b) => b.onset - a.onset);
      this.activeNotes.length = 60;
    }

    // === Low-pass filter sweep ===
    const cutoff = params.filterCutoff;
    const lpfCoeff = Math.exp(-2 * Math.PI * (200 + cutoff * 18000) * dt);
    this.lpfStateL = this.lpfStateL * lpfCoeff + mixL * (1 - lpfCoeff);
    this.lpfStateR = this.lpfStateR * lpfCoeff + mixR * (1 - lpfCoeff);

    // Blend between filtered and dry based on cutoff
    const filterBlend = Math.min(1, cutoff * 1.5);
    mixL = mixL * filterBlend + this.lpfStateL * (1 - filterBlend);
    mixR = mixR * filterBlend + this.lpfStateR * (1 - filterBlend);

    // === EQ ===
    mixL = this.eqL.process(mixL);
    mixR = this.eqR.process(mixR);

    // === Stereo Delay ===
    this.delay.mix = params.delayMix;
    [mixL, mixR] = this.delay.process(mixL, mixR);

    // === Reverb ===
    this.reverb.setMix(params.reverbMix);
    [mixL, mixR] = this.reverb.process(mixL, mixR);

    // === Stereo Widening ===
    [mixL, mixR] = this.widener.process(mixL, mixR);

    // === Compression ===
    mixL = this.compressorL.process(mixL);
    mixR = this.compressorR.process(mixR);

    // === Master Volume & Fading ===
    let masterVol = 0.7;

    // Fade out last 5 seconds
    if (params.isFading) {
      const fadeTime = this.structure.duration - t;
      masterVol *= Math.max(0, fadeTime / 5);
    }

    // Very quick fade in (0.1s)
    if (t < 0.1) {
      masterVol *= t / 0.1;
    }

    mixL *= masterVol;
    mixR *= masterVol;

    // Soft clipping (tanh)
    mixL = Math.tanh(mixL * 1.1);
    mixR = Math.tanh(mixR * 1.1);

    return [mixL, mixR];
  }
}

module.exports = { Sequencer };
