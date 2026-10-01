import { sum } from '/scoring.js';

const app = document.getElementById('app');
let settings;

init();

async function init() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error('Couldn’t load the settings');
    settings = await res.json();
    show();
  } catch (err) {
    app.innerHTML = `<p class="message">${err.message}</p>`;
  }
}

function show() {
  const { pars, maxStrokes, popups, limits } = settings;
  app.innerHTML = `
    <h1>Settings</h1>
    <form id="settings">
      <h2>Holes</h2>
      <input type="number" name="holes" min="1" max="${limits.maxHoles}" value="${pars.length}" inputmode="numeric">
      <h2>Par for each hole</h2>
      <div class="pars" id="pars"></div>
      <p class="sub" id="total"></p>
      <h2>Most strokes on a hole</h2>
      <input type="number" name="maxStrokes" min="1" max="${limits.strokeLimit}" value="${maxStrokes}" inputmode="numeric">
      <h2>Big screen</h2>
      <label class="toggle">Pop-ups <input type="checkbox" name="popups" ${popups ? 'checked' : ''}></label>
      <h2>Admin password</h2>
      <input type="password" name="password" autocomplete="current-password" required>
      <p class="error" hidden></p>
      <p class="saved" hidden>Saved</p>
      <button class="primary">Save</button>
      <p class="note">Games already being played keep the course they started with. Changing the pars starts a fresh set of records; the old ones are kept.</p>
    </form>`;

  const form = app.querySelector('#settings');
  const parsBox = form.querySelector('#pars');
  const error = form.querySelector('.error');
  const saved = form.querySelector('.saved');

  const parInputs = () => [...parsBox.querySelectorAll('input')];
  const updateTotal = () => {
    const values = parInputs().map((input) => Number(input.value) || 0);
    form.querySelector('#total').textContent = `${values.length} holes · par ${sum(values)}`;
  };
  // New holes copy the last hole's par.
  const drawPars = (count) => {
    const current = parInputs().map((input) => input.value);
    const values = Array.from({ length: count }, (_, i) => current[i] ?? current.at(-1) ?? 3);
    parsBox.innerHTML = values
      .map((par, i) => `<label>Hole ${i + 1}<input type="number" min="1" value="${par}" inputmode="numeric"></label>`)
      .join('');
    updateTotal();
  };
  parsBox.innerHTML = pars.map((par) => `<input value="${par}">`).join('');
  drawPars(pars.length);

  form.elements.holes.addEventListener('input', () => {
    const count = Number(form.elements.holes.value);
    if (Number.isInteger(count) && count >= 1 && count <= limits.maxHoles) drawPars(count);
  });
  form.addEventListener('input', () => {
    updateTotal();
    saved.hidden = true;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = form.querySelector('.primary');
    button.disabled = true;
    error.hidden = true;
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: form.elements.password.value,
          pars: parInputs().map((input) => Number(input.value)),
          maxStrokes: Number(form.elements.maxStrokes.value),
          popups: form.elements.popups.checked,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Couldn’t save, try again');
      settings = data;
      saved.hidden = false;
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
}
