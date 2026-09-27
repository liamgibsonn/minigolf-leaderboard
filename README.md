# minigolf-leaderboard

Digital scorecards for minigolf. Players scan a QR code on the course's big screen, keep score on their phones, and the screen shows the day's best rounds, updating live.

## How it works

- **The big screen** is today's leaderboard, ranked by over/under par. It shows finished rounds and players still out on the course (marked with a flashing LIVE tab), with a gold/silver/bronze podium that only finished rounds can reach. It also shows the course par, how many games are being played, and a QR code to start a new game. It isn't tied to any one group, so any number of groups can play at once.
- **Phones** are the scorecards. After scanning the QR code, one person enters a party name (or gets a random one, like "The Wobbly Putters") and the players' names, then fills in everyone's score for each hole and presses **Send**. Running totals are shown after every hole, and earlier holes can be corrected.
- **Animals**: every player is given a random animal, shown next to their name on the phone (and, later, in the big screen's pop-ups). Names containing swearing are refused.
- **Records**: when a game is finished with every hole played, each player's round is saved. Records are kept separately for each course layout, and days start at 00:00 UTC.

Built with plain HTML, CSS and JavaScript, running on [Cloudflare Workers](https://developers.cloudflare.com/workers/) with a [Durable Object](https://developers.cloudflare.com/durable-objects/) storing everything in SQLite.

## Running it locally

You'll need [Node.js](https://nodejs.org/) 20 or newer.

```sh
npm install
npm run dev
```

Then open:

- **http://localhost:8787**: the big screen
- **http://localhost:8787/play**: a phone scorecard (use your browser's device toolbar to make it phone-sized)

### Using your real phone

To scan the QR code with a phone on the same Wi-Fi:

```sh
npm run dev:lan
```

Open the big screen at `http://<your computer's IP>:8787` rather than `localhost`, because the QR code uses the address the screen was opened with. On Windows, `ipconfig` shows your IP under "IPv4 Address". If a firewall prompt appears, allow access on private networks.

Local data is kept in `.wrangler/`, which git ignores, so test games never end up in a commit.

## Setting up the course

The course is set in [`course.json`](course.json):

```json
{
  "pars": [3, 3, 3],
  "maxStrokes": 10
}
```

- `pars` is the par for each hole, in order. The number of entries is the number of holes (up to 18).
- `maxStrokes` is the most strokes a player can take on one hole (up to 20).

Restart the server after editing it. Games already in progress keep the course they started with. Changing the pars starts a fresh set of records, and the old layout's records are kept.

## Deploying

The app runs on Cloudflare's free plan, and the GitHub repo is connected to the Worker, so **every push to `main` deploys automatically** (Cloudflare runs `npx wrangler deploy`). Build logs are under the Worker's **Deployments** tab in the Cloudflare dashboard.

To deploy by hand instead:

```sh
npx wrangler login
npm run deploy
```

Open the live address (`https://minigolf-leaderboard.<your-subdomain>.workers.dev`) on the big screen, and the QR code will point phones to it. The live site has its own database, separate from the local one in `.wrangler/`.

## Project layout

| Path | What it is |
|---|---|
| `src/index.js` | Worker entry point: sends `/api/*` requests to the Durable Object |
| `src/course.js` | The backend: games, scores, records and live updates (the API is described at the top) |
| `src/stats.js` | Date and layout helpers for the records |
| `src/names.js` | Swear filter ([obscenity](https://github.com/jo3-l/obscenity)), random animals and party names |
| `public/animals/` | Animal pictures `0.png` to `29.png` |
| `public/index.html`, `display.*` | The big screen |
| `public/play.*` | The phone scorecard |
| `public/scoring.js` | Rankings and score formatting shared by both pages |
| `public/vendor/qrcode.mjs` | QR code generator ([qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)); refresh it with `npm run vendor` |
| `course.json` | The course's pars and maximum strokes |

## Credits

Animal pictures from [Animal Pack Remastered](https://kenney.nl/assets/animal-pack-remastered) by [Kenney](https://kenney.nl) (CC0).

## Still to come

- Tony Hawk–style pop-ups and sounds on the big screen for holes in one, birdies and bad holes (the backend already sends these events)
- Records for the week, month, year and all time on the big screen (the backend already calculates them)
- A settings page and admin login for managing the course
