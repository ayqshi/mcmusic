const http = require('http');
const fs = require('fs');
const path = require('path');
const { SongStructure } = require('./src/songStructure');
const { Sequencer } = require('./src/sequencer');
const { WavEncoder } = require('./src/synthesis');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/' || url.pathname === '/index.html') {
    const htmlPath = path.join(__dirname, 'public', 'index.html');
    fs.readFile(htmlPath, (err, data) => {
      if (err) {
        res.writeHead(500);
        return res.end('Error loading page');
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
    return;
  }

  if (url.pathname === '/api/generate') {
    const key = url.searchParams.get('key') || 'C';
    const scale = url.searchParams.get('scale') || 'minor_pentatonic';
    const bpm = parseInt(url.searchParams.get('bpm')) || 95;
    const seed = parseInt(url.searchParams.get('seed')) || Math.floor(Math.random() * 999999);

    res.writeHead(200, {
      'Content-Type': 'audio/wav',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'X-Seed': seed.toString(),
      'X-Key': key,
      'X-Scale': scale,
      'X-BPM': bpm.toString()
    });

    generateAndStream(res, { key, scale, bpm, seed });
    return;
  }

  if (url.pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: 'Minecraft C418-Style Sequencer',
      version: '1.0.0',
      endpoints: {
        '/api/generate': {
          method: 'GET',
          params: {
            key: 'Root key (C, D, E, F, G, A, B) - default: C',
            scale: 'Scale type (minor_pentatonic, dorian, aeolian, mixolydian, lydian) - default: minor_pentatonic',
            bpm: 'Tempo 60-140 - default: 95',
            seed: 'Random seed for reproducibility'
          },
          returns: 'audio/wav stream'
        }
      },
      features: [
        '32-step sequencer',
        'C418-inspired ambient/electronic generation',
        'Real music theory (scales, chord progressions, voice leading)',
        'Song structure with intro, phases, drops, outro',
        'Reverb, delay, EQ, compression, soft clipping',
        'Multi-voice synthesis (piano, pad, bass, pluck, percussion)',
        '~2 minute compositions',
        'Deterministic with seed parameter'
      ]
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

async function generateAndStream(res, config) {
  try {
    const sampleRate = 44100;
    const duration = 120; // 2 minutes
    const totalSamples = sampleRate * duration;

    const songStructure = new SongStructure(config.bpm, duration, config.seed);
    const sequencer = new Sequencer(config, songStructure);
    const encoder = new WavEncoder(sampleRate, 2); // stereo

    // Write WAV header with estimated size
    const header = encoder.createHeader(totalSamples);
    res.write(header);

    const chunkDuration = 0.5; // generate 0.5s chunks
    const samplesPerChunk = Math.floor(sampleRate * chunkDuration);
    let samplesWritten = 0;
    let currentTime = 0;

    const generateChunk = () => {
      if (samplesWritten >= totalSamples || res.destroyed) {
        if (!res.destroyed) res.end();
        return;
      }

      const samplesToGenerate = Math.min(samplesPerChunk, totalSamples - samplesWritten);
      const leftChannel = new Float64Array(samplesToGenerate);
      const rightChannel = new Float64Array(samplesToGenerate);

      for (let i = 0; i < samplesToGenerate; i++) {
        const t = currentTime + i / sampleRate;
        const [l, r] = sequencer.getSample(t);
        leftChannel[i] = l;
        rightChannel[i] = r;
      }

      currentTime += samplesToGenerate / sampleRate;

      const pcmData = encoder.encodeChunk(leftChannel, rightChannel);
      const canContinue = res.write(pcmData);
      samplesWritten += samplesToGenerate;

      if (canContinue) {
        setImmediate(generateChunk);
      } else {
        res.once('drain', generateChunk);
      }
    };

    generateChunk();
  } catch (err) {
    console.error('Generation error:', err);
    if (!res.destroyed) res.end();
  }
}

server.listen(PORT, () => {
  console.log(`Minecraft Sequencer API running on port ${PORT}`);
  console.log(`   Open http://localhost:${PORT} for the web player`);
  console.log(`   Stream: http://localhost:${PORT}/api/generate`);
});
