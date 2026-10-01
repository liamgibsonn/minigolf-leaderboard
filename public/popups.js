import { animalImg, esc } from '/scoring.js';
import { playFlag } from '/flag.js';

const GATHER_MS = 1000;
const GAP_MS = 200;

const COMBO = {
  step: 220,
  maxAnimals: 5,
  notFullCut: 1000,
  perMissingCut: 200,
  sounds: ['pinball', 'pinball', 'pinball', 'pinball', ['pinball', 'choir']],
};

// In play order. All times are ms from the pop-up's start. See CODE_GUIDE.md.
const POPUPS = {
  'hole-in-one': {
    label: 'Hole in one!',
    countWord: 'combo',
    flag: true,
    sounds: [],
    timing: { appear: 2920, animals: 3070, leave: 5670, gone: 6170 },
  },
  eagle: {
    label: 'Eagle!',
    countWord: 'combo',
    art: '/eagle.svg',
    drift: '2.7vmin',
    keepLength: true,
    sounds: [[0, 'eaglein'], [1600, 'eagle'], [5600, 'eagleout']],
    timing: { appear: 1600, arrive: 2100, animals: 2600, leave: 5600, gone: 6600 },
  },
  birdie: {
    label: 'Birdie!',
    countWord: 'combo',
    sounds: [],
    timing: { appear: 0, animals: 0, leave: 2500, gone: 3000 },
  },
  bailed: {
    label: 'Bailed.',
    countWord: '',
    sounds: [],
    timing: { appear: 0, animals: 0, leave: 2500, gone: 3000 },
  },
};

const TYPES = Object.keys(POPUPS);

export const SOUND_NAMES = [
  ...new Set([...COMBO.sounds, ...Object.values(POPUPS).flatMap((popup) => popup.sounds.map(([, name]) => name))].flat()),
];

export function createPopups(layer, sounds) {
  loadAllAnimals();
  let waiting = [];
  let busy = false;

  function take(type) {
    const results = waiting.filter((result) => result.type === type);
    waiting = waiting.filter((result) => result.type !== type);
    return results;
  }

  async function playWaiting() {
    const type = TYPES.find((t) => waiting.some((result) => result.type === t));
    if (!type) {
      busy = false;
      return;
    }
    const results = take(type);
    try {
      await animalsReady(results.slice(0, COMBO.maxAnimals));
      await showPopup(layer, sounds, type, results, () => take(type));
      await wait(GAP_MS);
    } finally {
      playWaiting(); // the next type, including anything that arrived meanwhile
    }
  }

  return {
    add(batch) {
      const results = (batch?.events ?? []).filter((event) => TYPES.includes(event.type));
      if (!results.length) return;
      waiting.push(...results.map((event) => ({ ...event, partyName: batch.partyName })));
      if (!busy) {
        busy = true;
        setTimeout(playWaiting, GATHER_MS);
      }
    },
  };
}

// takeLate() returns results of this type that arrived after the pop-up started.
async function showPopup(layer, sounds, type, results, takeLate) {
  const { art, drift, timing: planned, ...settings } = POPUPS[type];
  const start = performance.now();
  const until = (ms) => wait(start + ms - performance.now());
  const at = (ms, fn) => setTimeout(fn, start + ms - performance.now());
  const partyNames = () => [...new Set(results.map((result) => result.partyName).filter(Boolean))].map(esc).join(' &amp; ');
  const afterAnimals = (ms) => ms > planned.animals;

  for (const [ms, name] of settings.sounds) if (!afterAnimals(ms)) at(ms, () => sounds.play(name));
  const flag = settings.flag && playFlag();
  await until(planned.appear);

  const party = `<p class="popup-party">${partyNames()}</p>`;
  const label = `<p class="popup-label">${settings.label}</p>`;
  const animalsBox = '<div class="popup-animals"></div>';
  layer.innerHTML = art
    ? `<div class="flight ${type}">
        <img class="flight-art" src="${art}" alt="">
        <div class="flight-info">${label}${animalsBox}${party}</div>
      </div>`
    : `<div class="popup ${type}">${party}${label}${animalsBox}</div>`;
  const popup = layer.firstElementChild;
  const words = art ? popup.querySelector('.flight-info') : popup;
  const animals = popup.querySelector('.popup-animals');
  const bird = popup.querySelector('.flight-art');
  layer.hidden = false;
  if (art) {
    at(planned.arrive, () => words.classList.add('shown'));
    swoopIn(bird, planned, drift);
  }

  await until(planned.animals);
  results = [...results, ...takeLate()];
  popup.querySelector('.popup-party').innerHTML = partyNames();
  const shown = results.slice(0, COMBO.maxAnimals);
  const extra = results.length - shown.length;

  // Times are set for a full combo; a smaller one brings everything after `animals` earlier.
  const missing = COMBO.maxAnimals - shown.length;
  const cut = missing && !settings.keepLength ? COMBO.notFullCut + missing * COMBO.perMissingCut : 0;
  const shift = (ms) => Math.max(planned.animals, ms - cut);
  const timing = { ...planned, leave: shift(planned.leave), gone: shift(planned.gone) };
  for (const [ms, name] of settings.sounds) if (afterAnimals(ms)) at(shift(ms), () => sounds.play(name));
  if (art) swoopOut(bird, timing, drift);

  await stackAnimals(animals, sounds, shown, extra);
  if (results.length > 1) {
    const count = settings.countWord ? `×${results.length} ${settings.countWord}` : `×${results.length}`;
    animals.insertAdjacentHTML('afterend', `<p class="popup-combo">${count}</p>`);
  }

  await until(timing.leave);
  if (!art) popup.style.animationDuration = `${timing.gone - timing.leave}ms`; // overrides .popup.leaving in display.css
  words.classList.add('leaving');
  const flagDown = flag && flag.sink(timing.gone - timing.leave);
  await until(timing.gone);
  layer.hidden = true;
  layer.innerHTML = '';
  await flagDown;
}

// The leave time isn't known until `animals`, so the flight is planned twice. Called at
// `appear`: swoops in, then drifts towards the full-combo `leave`.
function swoopIn(art, timing, driftBy) {
  const arrive = timing.arrive - timing.appear;
  const total = Math.max(1, timing.leave - timing.appear);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // The easing on each keyframe shapes the segment after it.
  art.animate(
    [
      { offset: 0, transform: 'translate(92vmin, -28vmin) rotate(-20deg) scale(0.75)', easing: 'cubic-bezier(0.3, 1, 0.8, 1)' },
      { offset: arrive / total, transform: `translate(${driftBy}, 0) rotate(-3deg) scale(1)`, easing: 'linear' },
      { offset: 1, transform: `translate(-${driftBy}, 0) rotate(0deg) scale(1)` },
    ],
    { duration: total, fill: 'forwards' },
  );
}

// Called at `animals` with the real leave time: carries on from wherever it is, drifts
// until `leave`, then speeds off by `gone`.
function swoopOut(art, timing, driftBy) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const total = Math.max(1, timing.gone - timing.animals);
  art.animate(
    [
      { offset: 0, transform: getComputedStyle(art).transform, easing: 'linear' },
      { offset: (timing.leave - timing.animals) / total, transform: `translate(-${driftBy}, 0) rotate(0deg) scale(1)`, easing: 'cubic-bezier(0.3, 0, 0.6, 0)' }, // the swoop in, reversed
      { offset: 1, transform: 'translate(-115vmin, -40vmin) rotate(18deg) scale(0.7)' },
    ],
    { duration: total, fill: 'forwards' },
  );
}

// Each animal appears when its sound is actually heard, not when it starts (see heardAfter).
async function stackAnimals(animals, sounds, shown, extra) {
  let delay = 0;
  for (const [i, result] of shown.entries()) {
    const names = [COMBO.sounds[i] ?? []].flat();
    names.forEach((name) => sounds.play(name));
    const heard = names.map((name) => sounds.heardAfter(name)).filter((ms) => ms != null);
    delay = heard.length ? Math.min(...heard) : 0;
    const more = extra && i === shown.length - 1 ? `<span class="popup-more">+${extra}</span>` : '';
    setTimeout(() => animals.insertAdjacentHTML('beforeend', animalImg(result.animal) + more), delay);
    await wait(COMBO.step);
  }
  await wait(delay);
}

// Preloaded so an animal never shows up after its sound.
const ANIMAL_COUNT = 30;
const animalPictures = [];

function loadAllAnimals() {
  for (let i = 0; i < ANIMAL_COUNT; i++) {
    const picture = new Image();
    picture.src = `/animals/${i}.png`;
    animalPictures[i] = picture.decode().catch(() => {});
  }
}

function animalsReady(results) {
  return Promise.all(results.map((result) => animalPictures[result.animal]));
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
