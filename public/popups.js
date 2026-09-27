// Pop-ups on the big screen for good holes (and maxed-out ones), from any game on the course.
//
// Each pop-up is one type of score: e.g. "HOLE IN ONE!" with an animal for everyone who
// got one, from any party. Results arriving close together, or while a pop-up is already
// playing, are collected and grouped by type, so three holes in one from three parties
// make one "×3 combo" pop-up. Different types play as separate pop-ups, best first, and
// a busy course never builds a long queue (or a racket).
//
// Each style is a function (layer, sounds, type, results) that plays one pop-up and
// resolves when it's done. Only the Tony Hawk-style "skate" one exists so far.

import { animalImg, esc } from '/scoring.js';

const GATHER_MS = 600; // wait this long after a result so ones arriving together share a pop-up
const MAX_ANIMALS = 8; // any more become "+3"
const STEP_MS = 300; // time between animals popping in (one sound each)
const HOLD_MS = 2200; // how long the finished pop-up stays up
const LEAVE_MS = 400; // fade-out (matches .popup.leaving in display.css)

// Pop-ups play in this order when several types are waiting.
const TYPES = ['hole-in-one', 'eagle', 'birdie', 'bailed'];
const LABELS = { 'hole-in-one': 'Hole in one!', eagle: 'Eagle!', birdie: 'Birdie!', bailed: 'Bailed' };

// The sound for each animal as a combo stacks up in a pop-up, one file per step (a file
// can repeat). The 5th is the jackpot; anything after that is silent, so it only plays
// once. Maxed-out scores have no sounds yet.
const GOOD_STEPS = ['pinball0', 'pinball0', 'pinball0', 'pinball0', 'scratch4'];
const BAILED_STEPS = [];
export const SOUND_NAMES = [...new Set([...GOOD_STEPS, ...BAILED_STEPS])];

const STYLES = { skate };

// `add` takes what the server sends: { partyName, events: [{ name, animal, type, ... }] }.
export function createPopups(layer, sounds, style = 'skate') {
  const play = STYLES[style] ?? skate;
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
  const parties = [...new Set(results.map((result) => result.partyName).filter(Boolean))];
  const shown = results.slice(0, MAX_ANIMALS);
  const extra = results.length - shown.length;
  const files = type === 'bailed' ? BAILED_STEPS : GOOD_STEPS;

  layer.innerHTML = `
    <div class="popup ${type}">
      <p class="popup-party">${parties.map(esc).join(' &amp; ')}</p>
      <p class="popup-label">${LABELS[type]}</p>
      <div class="popup-animals"></div>
    </div>`;
  const popup = layer.firstElementChild;
  const animals = popup.querySelector('.popup-animals');
  layer.hidden = false;

  for (const [i, result] of shown.entries()) {
    animals.insertAdjacentHTML('beforeend', animalImg(result.animal));
    sounds.play(files[i]); // nothing past the last step
    await wait(STEP_MS);
  }
  if (extra) animals.insertAdjacentHTML('beforeend', `<span class="popup-more">+${extra}</span>`);
  if (results.length > 1) {
    const count = type === 'bailed' ? `×${results.length}` : `×${results.length} combo`;
    popup.insertAdjacentHTML('beforeend', `<p class="popup-combo">${count}</p>`);
  }

  await wait(HOLD_MS);
  popup.classList.add('leaving');
  await wait(LEAVE_MS);
  layer.hidden = true;
  layer.innerHTML = '';
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
