// Phone scorecard: set up players, then enter each hole and press Send.
// Views: setup -> hole -> summary -> hole -> ... -> summary -> finished.

import { standings, formatToPar, toParClass, sum, esc } from '/scoring.js';

const MAX_PLAYERS = 8;
const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
let gameId = params.get('g');
let key = params.get('k');
let game = null;

init();

async function init() {
  try {
    if (!gameId) {
      ({ id: gameId, key } = await api('/api/games', {}));
      // Keep the key in the URL so a refresh (or a friend's copy of the link) can still score.
      history.replaceState(null, '', `/play?g=${gameId}&k=${key}`);
    }
    if (!key) return showMessage('This link can’t enter scores. Ask whoever is scoring for their link.');

    ({ game } = await api(`/api/games/${gameId}`));
    if (game.status === 'setup') showSetup();
    else if (game.status === 'finished') showFinished();
    else if (nextHole() === null) showSummary(game.submittedHoles.at(-1));
    else showHole(nextHole());
  } catch (err) {
    showMessage(err.message);
  }
}

// ---- Setup ---------------------------------------------------------------

function showSetup() {
  app.innerHTML = `
    <h1>New game</h1>
    <form id="setup">
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

  onSubmit(app.querySelector('#setup'), async () => {
    const players = [...names.querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean);
    if (!players.length) throw new Error('Add at least one player');
    ({ game } = await api(`/api/games/${gameId}/start`, { key, players }));
    showHole(0);
  });
}

function nameInput() {
  return `<input placeholder="Name" maxlength="20" autocomplete="off" enterkeyhint="next">`;
}

// ---- Hole entry ----------------------------------------------------------

function showHole(hole) {
  const sent = game.submittedHoles.includes(hole);
  const next = nextHole();
  const canGoForward = hole + 1 < game.pars.length && (next === null || hole < next);
  const value = (v) => (sent && v != null ? v : '');

  app.innerHTML = `
    <header class="hole-head">
      <button class="nav" id="prev" aria-label="Previous hole" ${hole === 0 ? 'disabled' : ''}>‹</button>
      <div>
        <h1>Hole ${hole + 1} · Par ${game.pars[hole]}</h1>
        <p class="sub">of ${game.pars.length}${sent ? ' · already sent' : ''}</p>
      </div>
      <button class="nav" id="next" aria-label="Next hole" ${canGoForward ? '' : 'disabled'}>›</button>
    </header>
    <form id="hole">
      ${game.players
        .map(
          (p) => `
      <label class="row">
        <span class="name">${esc(p.name)}</span>
        ${numberInput(`p${p.id}`, 'Score', value(p.scores[hole]))}
      </label>`,
        )
        .join('')}
      <p class="error" hidden></p>
      <button class="primary">${sent ? 'Update hole' : 'Send'}</button>
    </form>`;

  app.querySelector('#prev').addEventListener('click', () => showHole(hole - 1));
  app.querySelector('#next').addEventListener('click', () => showHole(hole + 1));

  onSubmit(app.querySelector('#hole'), async (form) => {
    const scores = game.players.map((p) => ({
      playerId: p.id,
      strokes: readNumber(form.elements[`p${p.id}`], `${p.name}’s score`),
    }));
    ({ game } = await api(`/api/games/${gameId}/hole`, { key, hole, scores }));
    showSummary(hole);
  });

  if (!sent) app.querySelector('input').focus();
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
    <p class="sub">Hole done</p>
    ${standingsTable(hole)}
    <p class="error" hidden></p>
    <button class="primary" id="continue">${next === null ? 'Finish game' : `Hole ${next + 1} ›`}</button>
    ${next === null ? `<button class="link" id="back">‹ Back to hole ${hole + 1}</button>` : ''}`;

  app.querySelector('#back')?.addEventListener('click', () => showHole(hole));
  const button = app.querySelector('#continue');
  button.addEventListener('click', async () => {
    if (next !== null) return showHole(next);
    if (!confirm('Finish the game? Scores can’t be changed after this.')) return;
    await withBusy(button, async () => {
      ({ game } = await api(`/api/games/${gameId}/finish`, { key }));
      showFinished();
    });
  });
}

function showFinished() {
  app.innerHTML = `
    <h1>Final scores</h1>
    <p class="sub">${game.pars.length} holes · par ${sum(game.pars)}</p>
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
        <td class="name">${esc(r.name)}</td>
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
