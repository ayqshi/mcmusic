# Minecraft C418-Style Sequencer API

A zero-dependency Node.js API that procedurally generates and streams C418-inspired Minecraft music using a 32-step sequencer with real music theory, synthesis, and audio effects.

## Features

- **32-step sequencer** with swing timing
- **Real music theory**: scales (pentatonic, dorian, aeolian, etc.), chord progressions, voice leading, motif development
- **Multi-voice synthesis**: warm piano, ambient pads, pluck, bell/celesta, sub bass
- **Drum synthesis**: kick, hi-hat, snare (all synthesized, no samples)
- **Effects chain**: Schroeder reverb, stereo ping-pong delay, 3-band parametric EQ, compressor, stereo widener, soft clipping
- **Song structure**: short intro → theme → build → climax/drop → breakdown → second peak → outro
- **~2 minute compositions** with fade-out
- **Deterministic**: same seed = same song
- **Zero dependencies** - pure Node.js

## Quick Start

```bash
git clone https://github.com/YOUR_USER/minecraft-sequencer-api.git
cd minecraft-sequencer-api
npm start
