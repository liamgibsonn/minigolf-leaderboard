export function createSounds(names) {
  const context = new AudioContext();
  const buffers = {};
  const hits = {}; // ms into each file where it is properly heard
  const loaded = Promise.all(
    names.map(async (name) => {
      try {
        const res = await fetch(`/sounds/${name}.mp3`);
        if (res.ok) {
          buffers[name] = await context.decodeAudioData(await res.arrayBuffer());
          hits[name] = findHit(buffers[name]);
        }
      } catch {
        // Missing or not a sound file: stays silent.
      }
    }),
  );

  return {
    // true if any sound file loaded
    ready: loaded.then(() => Object.keys(buffers).length > 0),
    get locked() {
      return context.state !== 'running';
    },
    unlock: () => context.resume(),
    // ms after play() until the sound is heard: its hit point plus speaker delay. null if it won't play.
    heardAfter(name) {
      if (!(name && buffers[name]) || context.state !== 'running') return null;
      const speakerDelay = (context.outputLatency || 0) + (context.baseLatency || 0);
      return hits[name] + speakerDelay * 1000;
    },
    play(name) {
      const buffer = name && buffers[name];
      if (!buffer || context.state !== 'running') return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start();
    },
  };
}

// The hit: where it first reaches half its peak within 0.4s (a pinball), or else where it
// first becomes audible (a swelling choir). MP3s start with a little silence.
function findHit(buffer) {
  const samples = buffer.getChannelData(0);
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  const within = Math.min(samples.length, buffer.sampleRate * 0.4);
  let at = -1;
  for (let i = 0; i < within; i++) if (Math.abs(samples[i]) >= peak * 0.5) { at = i; break; }
  if (at === -1) at = Math.max(0, samples.findIndex((value) => Math.abs(value) >= peak * 0.05));
  return (at / buffer.sampleRate) * 1000;
}
