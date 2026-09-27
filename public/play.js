// Phone scorecard: set up players, then enter each hole and press Send.
// Views: (welcome back ->) setup -> hole -> summary -> hole -> ... -> summary -> finished.

import { standings, formatToPar, toParClass, sum, animalImg, esc } from '/scoring.js';

const MAX_PLAYERS = 8;
// Games in progress are offered back for this long after they started.
const RESUME_WINDOW = 12 * 60 * 60 * 1000;
const SAVED_GAME = 'minigolf-current-game';
const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
let gameId = params.get('g');
let key = params.get('k');
let game = null;

init();

async function init() {
  try {
    if (!gameId) {
      // Scanning the QR code again (e.g. after closing the tab) offers the game this
      // phone was playing, if it's still going.
      const saved = await unfinishedGame();
      if (saved) return showWelcomeBack(saved);
      await createGame();
    }
    await openGame();
  } catch (err) {
    showMessage(err.message);
  }
}

async function createGame() {
  ({ id: gameId, key } = await api('/api/games', {}));
  // Keep the key in the URL so a refresh (or a friend's copy of the link) can still score.
  history.replaceState(null, '', `/play?g=${gameId}&k=${key}`);
}

async function openGame() {
  if (!key) return showMessage('This link can’t enter scores. Ask whoever is scoring for their link.');

  ({ game } = await api(`/api/games/${gameId}`));
  if (game.status === 'setup') showSetup();
  else if (game.status === 'finished') {
    forgetGame();
    showFinished();
  } else {
    rememberGame();
    if (nextHole() === null) showSummary(game.submittedHoles.at(-1));
    else showHole(nextHole());
  }
}

// ---- Welcome back --------------------------------------------------------

// The game this phone was last playing, remembered in the browser only (nothing is sent
// anywhere). It can be missing, e.g. in private browsing, which just means no offer.
function rememberGame() {
  try {
    localStorage.setItem(SAVED_GAME, JSON.stringify({ g: gameId, k: key }));
  } catch {}
}

function forgetGame() {
  try {
    localStorage.removeItem(SAVED_GAME);
  } catch {}
}

// The remembered game, if it's still being played. Otherwise forgets it.
async function unfinishedGame() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(SAVED_GAME));
  } catch {}
  if (!saved?.g || !saved?.k) return null;
  try {
    const { game: savedGame } = await api(`/api/games/${saved.g}`);
    if (savedGame.status === 'playing' && savedGame.startedAt > Date.now() - RESUME_WINDOW) {
      return { ...saved, game: savedGame };
    }
  } catch {
    // Gone, or no signal: just start a new game.
  }
  forgetGame();
  return null;
}

function showWelcomeBack(saved) {
  const done = saved.game.submittedHoles.length;
  app.innerHTML = `
    <h1>Welcome back</h1>
    <p class="sub">This phone has a game in progress.</p>
    <div class="resume">
      <p class="resume-party">${esc(saved.game.partyName ?? '')}</p>
      <p>${saved.game.players.map((p) => esc(p.name)).join(', ')}</p>
      <p class="sub">${done} of ${saved.game.pars.length} holes done</p>
    </div>
    <p class="error" hidden></p>
    <div class="actions">
      <button type="button" class="secondary" id="new">New game</button>
      <button type="button" class="primary" id="continue">Continue</button>
    </div>`;

  const continueButton = app.querySelector('#continue');
  continueButton.addEventListener('click', () =>
    withBusy(continueButton, async () => {
      ({ g: gameId, k: key } = saved);
      history.replaceState(null, '', `/play?g=${gameId}&k=${key}`);
      await openGame();
    }),
  );
  const newButton = app.querySelector('#new');
  newButton.addEventListener('click', () =>
    withBusy(newButton, async () => {
      forgetGame();
      await createGame();
      await openGame();
    }),
  );
}

// ---- Setup ---------------------------------------------------------------

function showSetup() {
  app.innerHTML = `
    <h1>New game</h1>
    <form id="setup">
      <h2>Party name</h2>
      <input name="party" placeholder="Leave blank for a random one" maxlength="30" autocomplete="off" enterkeyhint="next">
      <h2>Players</h2>
      <div class="stack" id="names">${nameInput()}${nameInput()}</div>
      <button type="button" class="link" id="add-player">+ Add player</button>
      <p class="sub">${game.pars.length} holes · par ${sum(game.pars)}</p>
      <p class="error" hidden></p>
      <button class="primary">Tee off</button>
    </form>`;

  const names = app.querySelector('#names');
  const addPlayer = app.querySelector('#add-player');
  addPlayer.addEventListener('click', () => {
    names.insertAdjacentHTML('beforeend', nameInput());
    names.lastElementChild.focus();
    addPlayer.hidden = names.children.length >= MAX_PLAYERS;
  });

  onSubmit(app.querySelector('#setup'), async (form) => {
    // Blank boxes are sent too, so "player 2" in an error message matches the second box.
    const players = [...names.querySelectorAll('input')].map((i) => i.value);
    if (!players.some((name) => name.trim())) throw new Error('Add at least one player');
    ({ game } = await api(`/api/games/${gameId}/start`, { key, partyName: form.elements.party.value, players }));
    rememberGame();
    showHole(0);
  });
}

function nameInput() {
  return `<input placeholder="Name" maxlength="20" autocomplete="off" enterkeyhint="next">`;
}

// ---- Hole entry ----------------------------------------------------------

function showHole(hole) {
  const sent = game.submittedHoles.includes(hole);
  const value = (v) => (sent && v != null ? v : '');

  app.innerHTML = `
    <header class="hole-head">
      <h1>Hole ${hole + 1} · Par ${game.pars[hole]}</h1>
      <p class="sub">of ${game.pars.length}${sent ? ' · already sent' : ''}</p>
      <p class="party">${esc(game.partyName ?? '')}</p>
    </header>
    <form id="hole">
      ${game.players
        .map(
          (p) => `
      <label class="row">
        <span class="name">${animalImg(p.animal)}${esc(p.name)}</span>
        ${numberInput(`p${p.id}`, 'Score', value(p.scores[hole]))}
      </label>`,
        )
        .join('')}
      <p class="error" hidden></p>
      <div class="actions">
        <button type="button" class="secondary" id="back" ${hole === 0 ? 'disabled' : ''}>‹ Back</button>
        <button class="primary">${sent ? 'Next' : 'Send'}</button>
      </div>
    </form>`;

  const form = app.querySelector('#hole');
  const primary = form.querySelector('.primary');
  // On a hole that's already been sent: "Next" moves on without sending anything, and
  // turns into "Update" as soon as a score is changed.
  const changed = () => game.players.some((p) => form.elements[`p${p.id}`].value !== String(p.scores[hole] ?? ''));
  if (sent) form.addEventListener('input', () => (primary.textContent = changed() ? 'Update' : 'Next'));

  app.querySelector('#back').addEventListener('click', () => showHole(hole - 1));

  onSubmit(form, async () => {
    if (sent && !changed()) return moveOnFrom(hole);
    const scores = game.players.map((p) => ({
      playerId: p.id,
      strokes: readNumber(form.elements[`p${p.id}`], `${p.name}’s score`),
    }));
    ({ game } = await api(`/api/games/${gameId}/hole`, { key, hole, scores }));
    showSummary(hole);
  });

  if (!sent) app.querySelector('input').focus();
}

// "Next" on a hole that's already been sent: the following hole, up to the one the
// group is on. Past that (every hole sent) it's the totals, ready to finish.
function moveOnFrom(hole) {
  const next = nextHole();
  if (hole + 1 < game.pars.length && (next === null || hole + 1 <= next)) showHole(hole + 1);
  else showSummary(hole);
}

function numberInput(name, placeholder, value) {
  return `<input name="${name}" type="number" inputmode="numeric" min="1" max="${game.maxStrokes}"
    placeholder="${placeholder}" value="${value}" enterkeyhint="next" autocomplete="off">`;
}

function readNumber(input, label) {
  const n = Number(input.value);
  if (input.value === '' || !Number.isInteger(n) || n < 1 || n > game.maxStrokes) {
    input.focus();
    throw new Error(`Enter ${label} (1–${game.maxStrokes})`);
  }
  return n;
}

// ---- Totals after each hole ----------------------------------------------

function showSummary(hole) {
  const next = nextHole();
  app.innerHTML = `
    <h1>Hole ${hole + 1} · Par ${game.pars[hole]}</h1>
    ${standingsTable(hole)}
    <p class="error" hidden></p>
    <div class="actions">
      <button type="button" class="secondary" id="back">‹ Back</button>
      <button class="primary" id="continue">${next === null ? 'Finish game' : `Hole ${next + 1} ›`}</button>
    </div>
    <p class="note">Live scores can’t take a podium spot on the big screen. Finish the game to take someone’s place!</p>`;

  app.querySelector('#back').addEventListener('click', () => showHole(hole));
  const button = app.querySelector('#continue');
  button.addEventListener('click', async () => {
    if (next !== null) return showHole(next);
    await withBusy(button, async () => {
      ({ game } = await api(`/api/games/${gameId}/finish`, { key }));
      forgetGame();
      showFinished();
    });
  });
}

function showFinished() {
  app.innerHTML = `
    <h1>Final scores</h1>
    <p class="sub">${esc(game.partyName ?? '')} · ${game.pars.length} holes · par ${sum(game.pars)}</p>
    ${standingsTable()}
    <a class="primary" href="/play" style="display:block;text-align:center;text-decoration:none">New game</a>`;
}

// With `hole`, also shows each player's score on that hole.
function standingsTable(hole) {
  const rows = standings(game);
  const holeCol = hole !== undefined;
  return `
    <table class="standings">
      <tr><th></th><th></th>${holeCol ? '<th>Hole</th>' : ''}<th>Total</th><th>+/−</th></tr>
      ${rows
        .map(
          (r) => `
      <tr class="${r.rank <= 3 ? `place-${r.rank}` : ''}">
        <td class="pos">${r.rank}</td>
        <td class="name">${animalImg(r.animal)}${esc(r.name)}</td>
        ${holeCol ? `<td class="num">${r.scores[hole]}</td>` : ''}
        <td class="num total">${r.total}</td>
        <td class="num ${toParClass(r.toPar)}">${formatToPar(r.toPar)}</td>
      </tr>`,
        )
        .join('')}
    </table>`;
}

// ---- Game helpers --------------------------------------------------------

// First hole that hasn't been sent yet, or null if they all have.
function nextHole() {
  for (let h = 0; h < game.pars.length; h++) if (!game.submittedHoles.includes(h)) return h;
  return null;
}

// ---- Plumbing ------------------------------------------------------------

// GET without a body, POST (JSON) with one. Throws with the server's message on failure.
async function api(path, body) {
  let res;
  try {
    res = await fetch(path, body && {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('No connection. Check your signal and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Something went wrong (${res.status})`);
  return data;
}

// Runs a form's submit handler, showing any error under the form and blocking double taps.
function onSubmit(form, handler) {
  const inputs = [...form.querySelectorAll('input')];
  // "Next" on the phone keyboard moves between boxes; on the last box it submits.
  inputs.slice(0, -1).forEach((input, i) => {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      inputs[i + 1].focus();
    });
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    withBusy(form.querySelector('.primary'), () => handler(form));
  });
}

async function withBusy(button, task) {
  const error = app.querySelector('.error');
  error.hidden = true;
  button.disabled = true;
  try {
    await task();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
    button.disabled = false;
  }
}

function showMessage(text) {
  app.innerHTML = `<p class="message">${esc(text)}</p>`;
}
