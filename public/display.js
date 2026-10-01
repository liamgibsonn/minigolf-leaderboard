import qrcode from '/vendor/qrcode.mjs';
import { formatToPar, toParClass, sum, esc } from '/scoring.js';
import { createPopups, SOUND_NAMES } from '/popups.js';
import { createSounds } from '/sounds.js';

const board = document.getElementById('board');
const status = document.getElementById('status');
let latest = null;
const sounds = createSounds(SOUND_NAMES);
const popups = createPopups(document.getElementById('popups'), sounds);

drawQr(document.getElementById('qr'), `${location.origin}/play`);
connect();
showSoundHint();
if (new URLSearchParams(location.search).has('popup-preview')) previewPopups();
// Catches midnight and abandoned games, which the socket doesn't announce.
setInterval(refresh, 60_000);
addEventListener('resize', () => {
  fitStrip();
  if (latest) render(latest);
});
fitStrip();
document.fonts.ready.then(fitStrip);

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
    if (message.type === 'events') popups.add(message);
  };
  // Keep retrying (backing off to 15s) so the screen recovers by itself.
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
    // Offline: the reconnect note is already showing.
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

  // Podium: finished rounds placed 1st to 3rd. Ties share a place, so it can hold more than three.
  const finished = leaderboard.filter((round) => !round.live);
  finished.forEach((round, i) => {
    round.place = i > 0 && finished[i - 1].toPar === round.toPar ? finished[i - 1].place : i + 1;
  });
  const podium = finished.filter((round) => round.place <= 3);
  const rest = leaderboard.filter((round) => !podium.includes(round));

  // Neighbouring bars with the same score share a tab number.
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

function dropRowsThatDontFit() {
  const bottom = board.getBoundingClientRect().bottom;
  for (const row of [...board.children]) {
    if (row.getBoundingClientRect().bottom > bottom + 0.5) row.remove();
  }
}

// Browsers stay silent until the page is clicked, so ask once.
async function showSoundHint() {
  const hint = document.getElementById('sound-hint');
  if (!(await sounds.ready) || !sounds.locked) return;
  hint.hidden = false;
  const unlock = async () => {
    await sounds.unlock();
    if (sounds.locked) return;
    hint.hidden = true;
    removeEventListener('pointerdown', unlock);
    removeEventListener('keydown', unlock);
  };
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);
}

function previewPopups() {
  const results = (party, type, animals) => ({
    partyName: party,
    events: animals.map((animal, i) => ({ name: `Player ${i + 1}`, animal, type })),
  });
  const animals = (count) => [4, 11, 17, 22, 2, 25, 8, 14, 29].slice(0, count);
  // [ms after the loop starts, type, combo size], spaced so each finishes before the next.
  const sequence = [
    [0, 'birdie', 1],
    [3000, 'birdie', 7],
    [8000, 'eagle', 1],
    [16500, 'eagle', 7],
    [25000, 'hole-in-one', 1],
    [31500, 'hole-in-one', 7],
  ];
  const play = () => {
    for (const [ms, type, count] of sequence) {
      setTimeout(() => popups.add(results('Test 1', type, animals(count))), ms);
    }
  };
  play();
  setInterval(play, 41000);
}

// Wrapped text keeps its box at full width, leaving a gap before the QR code, so the
// strip is sized to its longest line.
function fitStrip() {
  const strip = document.querySelector('.cta-text');
  strip.style.width = '';
  const range = document.createRange();
  range.selectNodeContents(strip);
  const longest = Math.max(...[...range.getClientRects()].map((line) => line.width));
  const style = getComputedStyle(strip);
  strip.style.width = `${Math.ceil(longest + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)) + 1}px`;
}

function drawQr(container, url) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  document.documentElement.style.setProperty('--qr-modules', qr.getModuleCount());
  // No margin: the white padding around it is the scanners' quiet zone.
  container.innerHTML = qr.createSvgTag({ cellSize: 1, margin: 0, scalable: true });
}
