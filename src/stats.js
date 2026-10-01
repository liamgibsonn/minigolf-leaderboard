// No Cloudflare imports, so this can be tested with plain Node.

const DAY = 24 * 60 * 60 * 1000;

// All UTC (so no BST/GMT jumps); weeks start on Monday.
export function periodStarts(now = Date.now()) {
  const d = new Date(now);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const today = Date.UTC(year, month, d.getUTCDate());
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  return {
    today,
    week: today - daysSinceMonday * DAY,
    month: Date.UTC(year, month, 1),
    year: Date.UTC(year, 0, 1),
    all: 0,
  };
}

// e.g. 3 holes at par 3 is "3-3-3"
export const layoutKey = (pars) => pars.join('-');

export function parseLayoutKey(key) {
  if (!/^\d{1,2}(-\d{1,2}){0,17}$/.test(key)) return null;
  return key.split('-').map(Number);
}
