// Big-screen leaderboard: today's finished rounds on the course plus everyone still
// playing, updated live. It isn't tied to any one game; each group follows their own
// game on their phone.

import qrcode from '/vendor/qrcode.mjs';
import { formatToPar, toParClass, sum, esc } from '/scoring.js';

const board = document.getElementById('board');
const status = document.getElementById('status');
let latest = null;

drawQr(document.getElementById('qr'), `${location.origin}/play`);
connect();
// The live socket covers games starting and finishing. This also catches midnight
// (a new day's board) and abandoned games dropping out of the "being played" count.
setInterval(refresh, 60_000);
addEventListener('resize', () => latest && render(latest));

function connect(retryDelay = 1000) {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${location.host}/api/ws`);
  ws.onopen = () => {
    document.body.classList.remove('offline');
    retryDelay = 1000;
  };
  ws.onmessage = (e) => {
    const message = JSON.parse(e.data);
    if (message.type === 'board') render(message.board);
    // message.type === 'events': pop-ups from any game on the course (not built yet).
  };
  // Keep trying forever (backing off up to 15s) so the screen recovers by itself.
  ws.onclose = () => {
    document.body.classList.add('offline');
    setTimeout(() => connect(Math.min(retryDelay * 2, 15000)), retryDelay);
  };
}

async function refresh() {
  try {
    const res = await fetch('/api/board');
    if (res.ok) render(await res.json());
  } catch {
    // Offline: the socket's reconnect note is already showing.
  }
}

function render(data) {
  latest = data;
  const { leaderboard, liveGames, layout } = data;
  const parts = ['Today', `Par ${sum(layout)}`];
  if (liveGames) parts.push(`${liveGames} ${liveGames === 1 ? 'game' : 'games'} being played`);
  status.textContent = parts.join(' · ');

  if (!leaderboard.length) {
    board.innerHTML = '<li class="empty">No rounds yet today,<br>be the first!</li>';
    return;
  }

  // The podium is finished rounds only: everyone in 1st to 3rd place. Ties share a place
  // and the next place is skipped, so it can hold more than three (e.g. two tied for
  // bronze). Everyone else follows after a gap, finished and live together, in the
  // server's order (by over/under par).
  const finished = leaderboard.filter((round) => !round.live);
  finished.forEach((round, i) => {
    round.place = i > 0 && finished[i - 1].toPar === round.toPar ? finished[i - 1].place : i + 1;
  });
  const podium = finished.filter((round) => round.place <= 3);
  const rest = leaderboard.filter((round) => !podium.includes(round));

  // The number on each bar's tab is its place in the order shown. Bars next to each other
  // with the same over/under par share a number.
  [...podium, ...rest].forEach((round, i, all) => {
    round.position = i > 0 && all[i - 1].toPar === round.toPar ? all[i - 1].position : i + 1;
  });

  board.innerHTML =
    '<li class="labels" aria-hidden="true"><span></span><span>Holes</span><span>+/−</span></li>' +
    podium.map((round) => row(round, layout.length)).join('') +
    (podium.length && rest.length ? '<li class="podium-gap" aria-hidden="true"></li>' : '') +
    rest.map((round) => row(round, layout.length)).join('');
  dropRowsThatDontFit();

}

// One bar: name, holes played (all of them for finished rounds), then over/under par so
// far (green under, red over). Animals aren't shown here; they're kept for pop-ups.
function row(round, holes) {
  const place = round.place <= 3 ? ` place-${round.place}` : '';
  return `
    <li class="row${place}${round.live ? ' live' : ''}">
      <span class="tab">
        <span class="position">${round.position}</span>
        ${round.live ? '<span class="live" aria-label="Live">L<br>I<br>V<br>E</span>' : ''}
      </span>
      <span class="name">${esc(round.name)}</span>
      <span class="holes">${round.live ? round.thru : holes}</span>
      <span class="score ${toParClass(round.toPar)}">${formatToPar(round.toPar)}</span>
    </li>`;
}

// Show as many whole lines as the screen has room for.
function dropRowsThatDontFit() {
  const bottom = board.getBoundingClientRect().bottom;
  for (const row of [...board.children]) {
    if (row.getBoundingClientRect().bottom > bottom + 0.5) row.remove();
  }
}

function drawQr(container, url) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  // Set on the page root: the white corner's padding (the quiet zone) is sized from it.
  document.documentElement.style.setProperty('--qr-modules', qr.getModuleCount());
  // No built-in margin: the white corner's padding is the quiet zone.
  container.innerHTML = qr.createSvgTag({ cellSize: 1, margin: 0, scalable: true });
}
