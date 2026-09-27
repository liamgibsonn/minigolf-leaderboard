// Scoring helpers shared by the phone and the display.

// Everyone plays every sent hole, so total strokes decide the order. Ties share a rank.
export function standings(game) {
  const parSoFar = sum(game.submittedHoles.map((h) => game.pars[h]));
  const rows = game.players.map((p) => {
    const total = sum(game.submittedHoles.map((h) => p.scores[h]));
    return { ...p, total, toPar: total - parSoFar };
  });
  rows.sort((a, b) => a.total - b.total);
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1].total === r.total ? rows[i - 1].rank : i + 1));
  return rows;
}

export function formatToPar(n) {
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : `−${-n}`;
}

// CSS class for an over/under-par number: 'under', 'over' or 'even'.
export const toParClass = (n) => (n < 0 ? 'under' : n > 0 ? 'over' : 'even');

export const sum = (list) => list.reduce((a, b) => a + (b ?? 0), 0);

export function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
