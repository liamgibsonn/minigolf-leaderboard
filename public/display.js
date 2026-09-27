// Big-screen records board: today's best rounds on the course, updated live. It isn't
// tied to any one game; each group follows their own game on their phone.

import qrcode from '/vendor/qrcode.mjs';
import { formatToPar, toParClass, esc } from '/scoring.js';

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
  const { today, liveGames } = data;
  status.textContent = liveGames
    ? `Today · ${liveGames} ${liveGames === 1 ? 'game' : 'games'} being played`
    : 'Today';

  if (!today.best.length) {
    board.innerHTML = '<li class="empty">No rounds yet today,<br>be the first!</li>';
    return;
  }

  let rank = 0;
  board.innerHTML = today.best
    .map((round, i, all) => {
      // Ties share a place (and a medal colour); the next place is skipped.
      if (i === 0 || all[i - 1].total !== round.total) rank = i + 1;
      const place = rank <= 3 ? ` place-${rank}` : '';
      return `
        <li class="row${place}">
          <span class="rank">${rank}</span>
          <span class="name">${esc(round.name)}</span>
          <span class="total">${round.total}</span>
          <span class="to-par ${toParClass(round.toPar)}">${formatToPar(round.toPar)}</span>
        </li>`;
    })
    .join('');
  dropRowsThatDontFit();
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
