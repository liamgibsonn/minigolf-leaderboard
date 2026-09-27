// Scoring helpers shared by the phone and the display.

// Ranked by over/under par. Ties share a rank.
export function standings(game) {
  const parSoFar = sum(game.submittedHoles.map((h) => game.pars[h]));
  const rows = game.players.map((p) => {
    const total = sum(game.submittedHoles.map((h) => p.scores[h]));
    return { ...p, total, toPar: total - parSoFar };
  });
  rows.sort((a, b) => a.toPar - b.toPar);
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1].toPar === r.toPar ? rows[i - 1].rank : i + 1));
  return rows;
}

export function formatToPar(n) {
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : `−${-n}`;
}

// CSS class for an over/under-par number: 'under', 'over' or 'even'.
export const toParClass = (n) => (n < 0 ? 'under' : n > 0 ? 'over' : 'even');

export const sum = (list) => list.reduce((a, b) => a + (b ?? 0), 0);

// Animal pictures are /animals/0.png to 29.png (Kenney's Animal Pack, CC0), in this order.
const ANIMALS = [
  'Bear', 'Buffalo', 'Chick', 'Chicken', 'Cow', 'Crocodile', 'Dog', 'Duck', 'Elephant', 'Frog',
  'Giraffe', 'Goat', 'Gorilla', 'Hippo', 'Horse', 'Monkey', 'Moose', 'Narwhal', 'Owl', 'Panda',
  'Parrot', 'Penguin', 'Pig', 'Rabbit', 'Rhino', 'Sloth', 'Snake', 'Walrus', 'Whale', 'Zebra',
];

// An <img> for a player's animal. Players from before animals existed have none, so they
// get an empty space the same size, which keeps names lined up.
export function animalImg(animal) {
  return ANIMALS[animal]
    ? `<img class="animal" src="/animals/${animal}.png" alt="${ANIMALS[animal]}">`
    : '<span class="animal"></span>';
}

export function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
