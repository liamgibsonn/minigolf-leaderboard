// Pop-ups on the big screen for good holes (and maxed-out ones), from any game on the course.
//
// Each pop-up is one type of score: e.g. "HOLE IN ONE!" with an animal for everyone who
// got one, from any party. Results arriving close together, or while a pop-up is already
// playing, are collected and grouped by type, so three holes in one from three parties
// make one "×3 combo" pop-up. Different types play as separate pop-ups, best first, and
// a busy course never builds a long queue (or a racket).
//
// Each style is a function (layer, sounds, type, results) that plays one pop-up and
// resolves when it's done. Only the Tony Hawk-style "skate" one exists so far; in it,
// eagles fly across the screen (see FLIGHTS) and everything else gets a card.

import { animalImg, esc } from '/scoring.js';

const GATHER_MS = 600; // wait this long after a result so ones arriving together share a pop-up
const MAX_ANIMALS = 8; // any more become "+3"
const STEP_MS = 220; // time between animals popping in (one sound each)
const INTRO_OVERLAP_MS = 200; // the card (and its sound) start this long before an intro sound ends
const ANIMALS_AFTER_MS = 1250; // after a card with its own sound appears, before the animals start
const HOLD_MS = 2000; // how long the finished pop-up stays up
const LEAVE_SOUND_EARLY_MS = 650; // a `leave` sound starts this long before the card goes (cards only)
const LEAVE_MS = 400; // fade-out (matches .popup.leaving in display.css)
// Flying pop-ups (see FLIGHTS): the fast swoop in from the top right, braking hard to an
// almost-standstill in the middle, and the swoop out to the top left, which starts from
// nearly still and quickly speeds up.
const SWOOP_IN_MS = 700;
const SWOOP_OUT_MS = 1000;
const HOVER_DRIFT = '1.5vw'; // how far it drifts either side of the middle while almost still
const FLIGHT_HOLD_MS = 1600; // like HOLD_MS, but for flights: how long it stays after the last animal

// Pop-ups play in this order when several types are waiting.
const TYPES = ['hole-in-one', 'eagle', 'birdie', 'bailed'];
const LABELS = { 'hole-in-one': 'Hole in one!', eagle: 'Eagle!', birdie: 'Birdie!', bailed: 'Bailed' };

// The sound for each animal as a combo stacks up in a pop-up, one entry per step (a file
// can repeat, and a list plays several at once). The 5th is the jackpot: a pinball plus
// the choir. Anything after that is silent, so it only plays once. Maxed-out scores have
// no sounds yet.
const GOOD_STEPS = ['pinball', 'pinball', 'pinball', 'pinball', ['pinball', 'choir']];
const BAILED_STEPS = [];

// Extra sounds for a type of pop-up, on top of the steps above: `intro` plays first with
// nothing on screen yet, `appear` as the card appears (the animals and their steps start
// shortly after), and `leave` as it goes.
const TYPE_SOUNDS = {
  eagle: { intro: 'eaglein', appear: 'eagle', leave: 'eagleout' },
};

// Types that fly across the screen instead of showing a card, with their artwork. Swap the
// file for your own animation (an animated WebP or SVG works in its place).
const FLIGHTS = {
  eagle: '/eagle.svg',
};

export const SOUND_NAMES = [
  ...new Set([...GOOD_STEPS, ...BAILED_STEPS, ...Object.values(TYPE_SOUNDS).flatMap(Object.values)].flat()),
];

const STYLES = { skate };

// `add` takes what the server sends: { partyName, events: [{ name, animal, type, ... }] }.
export function createPopups(layer, sounds, style = 'skate') {
  const play = STYLES[style] ?? skate;
  loadAllAnimals();
  let waiting = [];
  let busy = false;

  async function playWaiting() {
    const type = TYPES.find((t) => waiting.some((result) => result.type === t));
    if (!type) {
      busy = false;
      return;
    }
    const results = waiting.filter((result) => result.type === type);
    waiting = waiting.filter((result) => result.type !== type);
    try {
      await animalsReady(results.slice(0, MAX_ANIMALS));
      await play(layer, sounds, type, results);
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

// ---- Tony Hawk style ---------------------------------------------------------

async function skate(layer, sounds, type, results) {
  if (FLIGHTS[type]) return flight(layer, sounds, type, results);
  const parties = [...new Set(results.map((result) => result.partyName).filter(Boolean))];
  const shown = results.slice(0, MAX_ANIMALS);
  const extra = results.length - shown.length;
  const files = type === 'bailed' ? BAILED_STEPS : GOOD_STEPS;
  const extras = TYPE_SOUNDS[type] ?? {};

  if (extras.intro) {
    sounds.play(extras.intro);
    await wait(Math.max(0, sounds.duration(extras.intro) - INTRO_OVERLAP_MS));
  }

  layer.innerHTML = `
    <div class="popup ${type}">
      <p class="popup-party">${parties.map(esc).join(' &amp; ')}</p>
      <p class="popup-label">${LABELS[type]}</p>
      <div class="popup-animals"></div>
    </div>`;
  const popup = layer.firstElementChild;
  const animals = popup.querySelector('.popup-animals');
  layer.hidden = false;
  if (extras.appear) {
    sounds.play(extras.appear);
    await wait(ANIMALS_AFTER_MS);
  }

  await stackAnimals(animals, sounds, shown, files);
  if (extra) animals.insertAdjacentHTML('beforeend', `<span class="popup-more">+${extra}</span>`);
  if (results.length > 1) {
    const count = type === 'bailed' ? `×${results.length}` : `×${results.length} combo`;
    popup.insertAdjacentHTML('beforeend', `<p class="popup-combo">${count}</p>`);
  }

  await wait(HOLD_MS - LEAVE_SOUND_EARLY_MS);
  sounds.play(extras.leave);
  await wait(LEAVE_SOUND_EARLY_MS);
  popup.classList.add('leaving');
  await wait(LEAVE_MS);
  layer.hidden = true;
  layer.innerHTML = '';
}

// A flying pop-up: the artwork swoops in fast from the top right as its `appear` sound
// starts, brakes to an almost-standstill in the middle, then speeds back up and swoops out
// to the top left with its `leave` sound. The label, animals and party name stay still in
// the middle underneath: they appear as it arrives and fade as it leaves. The sounds and
// timings are the same settings the card uses.
async function flight(layer, sounds, type, results) {
  const parties = [...new Set(results.map((result) => result.partyName).filter(Boolean))];
  const shown = results.slice(0, MAX_ANIMALS);
  const extra = results.length - shown.length;
  const extras = TYPE_SOUNDS[type] ?? {};

  if (extras.intro) {
    sounds.play(extras.intro);
    await wait(Math.max(0, sounds.duration(extras.intro) - INTRO_OVERLAP_MS));
  }

  layer.innerHTML = `
    <div class="flight ${type}">
      <img class="flight-art" src="${FLIGHTS[type]}" alt="">
      <div class="flight-info">
        <p class="popup-label">${LABELS[type]}</p>
        <div class="popup-animals"></div>
        <p class="popup-party">${parties.map(esc).join(' &amp; ')}</p>
      </div>
    </div>`;
  const bird = layer.querySelector('.flight-art');
  const info = layer.querySelector('.flight-info');
  const animals = info.querySelector('.popup-animals');
  layer.hidden = false;
  sounds.play(extras.appear);

  // One path for the whole flight, timed so the swoop out starts exactly when the card
  // would normally leave. The easing on each keyframe shapes the segment after it:
  // in, braking hard; a slow drift; out, starting from almost still and speeding up.
  const leaveAt = ANIMALS_AFTER_MS + shown.length * STEP_MS + FLIGHT_HOLD_MS;
  const swoopInEnd = Math.min(SWOOP_IN_MS, leaveAt);
  const total = leaveAt + SWOOP_OUT_MS;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    bird.animate(
      [
        { offset: 0, transform: 'translate(52vw, -28vh) rotate(-20deg) scale(0.75)', easing: 'cubic-bezier(0.2, 0.55, 0.25, 1)' },
        { offset: swoopInEnd / total, transform: `translate(${HOVER_DRIFT}, 0) rotate(-3deg) scale(1)`, easing: 'linear' },
        { offset: leaveAt / total, transform: `translate(-${HOVER_DRIFT}, 0) rotate(0deg) scale(1)`, easing: 'cubic-bezier(0.45, 0, 0.85, 0.35)' },
        { offset: 1, transform: 'translate(-65vw, -40vh) rotate(18deg) scale(0.7)' },
      ],
      { duration: total, fill: 'forwards' },
    );
  }
  setTimeout(() => info.classList.add('shown'), swoopInEnd);

  await wait(ANIMALS_AFTER_MS);
  await stackAnimals(animals, sounds, shown, GOOD_STEPS);
  if (extra) animals.insertAdjacentHTML('beforeend', `<span class="popup-more">+${extra}</span>`);
  if (results.length > 1) {
    animals.insertAdjacentHTML('afterend', `<p class="popup-combo">×${results.length} combo</p>`);
  }

  // The leave sound plays right as it takes off (not early, like the card's).
  await wait(FLIGHT_HOLD_MS);
  sounds.play(extras.leave);
  info.classList.add('leaving');
  await wait(SWOOP_OUT_MS);
  layer.hidden = true;
  layer.innerHTML = '';
}

// Pops each animal in with its sound, STEP_MS apart. The sounds keep that exact rhythm;
// each animal appears when its sound is actually heard (see heardAfter), not when it
// starts, since a sound file often builds up to its hit and speakers add a little delay.
// Steps without a sound (past the last one) keep the previous animal's timing.
async function stackAnimals(animals, sounds, shown, steps) {
  let delay = 0;
  for (const [i, result] of shown.entries()) {
    const names = [steps[i] ?? []].flat();
    names.forEach((name) => sounds.play(name));
    // With several sounds at once, the animal lands on whichever is heard first.
    const heard = names.map((name) => sounds.heardAfter(name)).filter((ms) => ms != null);
    if (heard.length) delay = Math.min(...heard);
    setTimeout(() => animals.insertAdjacentHTML('beforeend', animalImg(result.animal)), delay);
    await wait(STEP_MS);
  }
  await wait(delay); // the last animal is in before anything else happens
}

// An animal whose picture hasn't loaded yet shows up late, after its sound. So all 30
// (small) pictures load when the big screen opens, and each pop-up waits until its own
// animals are ready before it starts (instant once they've loaded).
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
