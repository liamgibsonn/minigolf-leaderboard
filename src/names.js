// Player and party names, and the animals players are given. Kept free of Cloudflare
// imports so it can be tested with plain Node.

import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

// Animal pictures are public/animals/0.png to 29.png.
export const ANIMAL_COUNT = 30;

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

// True for swearing and slurs, including disguised spellings like "sh1t". Also checks the
// text with spaces, dots and dashes removed, to catch "f u c k". That catches a few
// innocent names too (e.g. "Shi Tzu"), which is fine: the player just picks another.
export function isRude(text) {
  return matcher.hasMatch(text) || matcher.hasMatch(text.replace(/[\s._\-*]+/g, ''));
}

// `count` different animal numbers, in random order.
export function pickAnimals(count) {
  const animals = Array.from({ length: ANIMAL_COUNT }, (_, i) => i);
  for (let i = animals.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [animals[i], animals[j]] = [animals[j], animals[i]];
  }
  return animals.slice(0, count);
}

const ADJECTIVES = [
  'Wobbly', 'Mighty', 'Sneaky', 'Fuzzy', 'Speedy', 'Lucky', 'Jolly', 'Cheeky',
  'Dizzy', 'Bouncy', 'Clumsy', 'Fearless', 'Sleepy', 'Groovy', 'Zippy', 'Plucky',
];
const NOUNS = [
  'Putters', 'Birdies', 'Bogeys', 'Windmills', 'Flamingos', 'Caddies',
  'Tees', 'Aces', 'Loopers', 'Duffers', 'Chippers', 'Hole Hoppers',
];

// For parties that don't pick a name, e.g. "The Wobbly Putters".
export function randomPartyName() {
  return `The ${ADJECTIVES[randomInt(ADJECTIVES.length)]} ${NOUNS[randomInt(NOUNS.length)]}`;
}

function randomInt(below) {
  return crypto.getRandomValues(new Uint32Array(1))[0] % below;
}
