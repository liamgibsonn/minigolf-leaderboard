// Sound effects for the big screen, from files in /sounds/ (e.g. /sounds/pinball0.mp3).
// A missing file just means that sound stays silent.
//
// Browsers don't allow sound until someone has clicked or pressed a key on the page, so
// the display shows a "click to turn on sound" note until that happens.

export function createSounds(names) {
  const context = new AudioContext();
  const buffers = {};
  const loaded = Promise.all(
    names.map(async (name) => {
      try {
        const res = await fetch(`/sounds/${name}.mp3`);
        if (res.ok) buffers[name] = await context.decodeAudioData(await res.arrayBuffer());
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
