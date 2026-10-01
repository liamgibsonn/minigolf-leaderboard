# Self-hosting

Everything you need to run minigolf-leaderboard yourself, locally or on Cloudflare.

## Running it locally

You'll need [Node.js](https://nodejs.org/) 20 or newer.

```sh
npm install
npm run dev
```

Then open:

- **http://localhost:8787**: the big screen
- **http://localhost:8787/play**: a phone scorecard (use your browser's device toolbar to make it phone-sized)

Local data is kept in `.wrangler/`, which git ignores, so test games never end up in a commit.

### Using your real phone

To scan the QR code with a phone on the same Wi-Fi:

```sh
npm run dev:lan
```

Open the big screen at `http://<your computer's IP>:8787` rather than `localhost`, because the QR code uses the address the screen was opened with. On Windows, `ipconfig` shows your IP under "IPv4 Address". If a firewall prompt appears, allow access on private networks.

## Setting up the course

Open `/admin` (e.g. http://localhost:8787/admin) to set the number of holes, each hole's par, the most strokes on a hole, and whether the big screen shows pop-ups. Saved settings are kept in the database, so they last through restarts and apply to every screen and phone straight away.

The page asks for an admin password, which the server reads from `ADMIN_PASSWORD`. Without one, nothing can be saved.

- **Locally:** create a file called `.dev.vars` in the project folder (git ignores it) containing `ADMIN_PASSWORD=your-password`, then restart the server.
- **On Cloudflare:** run `npx wrangler secret put ADMIN_PASSWORD`, or add it under the Worker's **Settings → Variables and Secrets** as a secret.

Games already in progress keep the course they started with. Changing the pars starts a fresh set of records, and the old layout's records are kept.

### Starting defaults

Until settings are first saved from `/admin`, the course comes from [`course.json`](course.json):

```json
{
  "pars": [3, 3, 3],
  "maxStrokes": 10
}
```

- `pars` is the par for each hole, in order. The number of entries is the number of holes (up to 18).
- `maxStrokes` is the most strokes a player can take on one hole (up to 20).

Once settings have been saved from `/admin`, `course.json` is no longer used.

## Pop-ups and sounds

Each type of pop-up (hole in one, eagle, birdie, maxed-out) has its own label, look, sounds and timings, set at the top of [`public/popups.js`](public/popups.js). [CODE_GUIDE.md](CODE_GUIDE.md) explains every setting.

Sound files are in [`public/sounds/`](public/sounds/) (its README lists which file plays when). Missing files just stay silent. Browsers only play sound after the page has been clicked, so the big screen asks once. Add `/?popup-preview` to the big screen's address to loop sample pop-ups.

## Deploying

The app runs on Cloudflare's free plan. To deploy by hand:

```sh
npx wrangler login
npm run deploy
```

To deploy automatically instead, connect your GitHub repo to the Worker in the Cloudflare dashboard: every push to `main` then runs `npx wrangler deploy`, with build logs under the Worker's **Deployments** tab.

Open the live address (`https://minigolf-leaderboard.<your-subdomain>.workers.dev`) on the big screen, and the QR code will point phones to it. The live site has its own database, separate from the local one in `.wrangler/`.

## Load testing

[`loadtest/parties.js`](loadtest/parties.js) is a [k6](https://k6.io/) script. It ramps up to 50 parties playing at once, with two big screens watching, over 5 minutes. Install k6 first (`winget install k6 --source winget` on Windows).

```sh
npm run dev:loadtest   # a dev server on its own database, so test rounds stay out of your real data
npm run loadtest       # in a second terminal
```

Every player and party in the test is called "test". To run fewer parties, e.g. to watch the pop-ups, use `k6 run -e PARTIES=5 loadtest/parties.js`.

To test a deployed copy instead, pass its address: `k6 run -e BASE=https://... loadtest/parties.js`. Don't point it at the live site, or the test rounds will fill the real records board.

## Project layout

For how each part works and what the settings mean, see [CODE_GUIDE.md](CODE_GUIDE.md).

| Path | What it is |
|---|---|
| `src/index.js` | Worker entry point: sends `/api/*` requests to the Durable Object |
| `src/course.js` | The backend: games, scores, records and live updates (API in [CODE_GUIDE.md](CODE_GUIDE.md)) |
| `src/stats.js` | Date and layout helpers for the records |
| `src/names.js` | Swear filter ([obscenity](https://github.com/jo3-l/obscenity)), random animals and party names |
| `public/animals/` | Animal pictures `0.png` to `29.png` |
| `public/index.html`, `display.*` | The big screen |
| `public/play.*` | The phone scorecard |
| `public/admin.*` | The settings page at `/admin` |
| `public/scoring.js` | Rankings and score formatting shared by both pages |
| `public/popups.js`, `sounds.js` | Pop-ups on the big screen and their sound effects |
| `public/eagle.svg` | Placeholder cartoon eagle that flies across the screen for eagle pop-ups; swap for your own animation |
| `public/vendor/qrcode.mjs` | QR code generator ([qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)); refresh it with `npm run vendor` |
| `course.json` | The course's starting pars and maximum strokes, until settings are saved from `/admin` |
