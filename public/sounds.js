// Sound effects for the big screen, from files in /sounds/ (e.g. /sounds/pinball0.mp3).
// A missing file just means that sound stays silent.
//
// Browsers don't allow sound until someone has clicked or pressed a key on the page, so
// the display shows a "click to turn on sound" note until that happens.

export function createSounds(names) {
  const context = new AudioContext();
  const buffers = {};
  const hits = {}; // ms into each file where it's properly heard (see findHit)
  const loaded = Promise.all(
    names.map(async (name) => {
      try {
        const res = await fetch(`/sounds/${name}.mp3`);
        if (res.ok) {
          buffers[name] = await context.decodeAudioData(await res.arrayBuffer());
          hits[name] = findHit(buffers[name]);
        }
      } catch {
        // No file (or not a sound file): stays silent.
      }
    }),
  );

  return {
    // Resolves once the files have been fetched; true if any sound is available.
    ready: loaded.then(() => Object.keys(buffers).length > 0),
    get locked() {
      return context.state !== 'running';
    },
    unlock: () => context.resume(),
    // How long a sound lasts, in ms (0 if it's missing or sound is off, so nothing waits
    // on silence).
    duration(name) {
      const buffer = name && buffers[name];
      return buffer && context.state === 'running' ? buffer.duration * 1000 : 0;
    },
    // How long after play() the sound is actually heard, in ms: its hit point plus the
    // delay between the browser and the speakers. null if it won't play.
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

// Where a sound is properly heard: the first point it reaches half its peak volume within
// the opening 0.4s (a hit like a pinball), or else where it first becomes audible (a sound
// that swells, like a choir). MP3s usually start with a little silence, and many sounds
// build up to their hit, so this is often ~0.1s in.
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
