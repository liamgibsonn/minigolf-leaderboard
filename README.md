# minigolf-leaderboard

Digital scorecards for minigolf. Players scan a QR code on the course's big screen, keep score on their phones, and the screen shows the day's best rounds, updating live.

## How it works

- **The big screen** is today's leaderboard, ranked by over/under par. It shows finished rounds and players still out on the course (marked with a flashing LIVE tab), with a gold/silver/bronze podium that only finished rounds can reach. It also shows the course par, how many games are being played, and a QR code to start a new game. It isn't tied to any one group, so any number of groups can play at once.
- **Phones** are the scorecards. After scanning the QR code, one person enters a party name (or gets a random one, like "The Wobbly Putters") and the players' names, then fills in everyone's score for each hole and presses **Send**. Running totals are shown after every hole, and earlier holes can be corrected.
- **Animals**: every player is given a random animal, shown next to their name on the phone and in the big screen's pop-ups. Names containing swearing are refused.
- **Pop-ups**: holes in one, eagles, birdies and maxed-out holes from any game pop up on the big screen, Tony Hawk style. Each pop-up is one type of score with an animal for everyone who got it: results of the same type that arrive together (even from different parties) share a pop-up as a combo, and different types play one after another.
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

### Pop-up sounds

Sound files are in [`public/sounds/`](public/sounds/): `pinball.mp3` for each of the first four results in a combo, `pinball.mp3` plus `choir.mp3` as the jackpot on the fifth, and the eagle sounds around eagle pop-ups (see the README there; which file plays when is set at the top of `public/popups.js`). Missing files just stay silent. Browsers only play sound after the page has been clicked, so the big screen asks once. Add `/?popup-preview` to the big screen's address to loop a sample pop-up.

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
| `public/popups.js`, `sounds.js` | Pop-ups on the big screen and their sound effects |
| `public/eagle.svg` | Placeholder cartoon eagle that flies across the screen for eagle pop-ups; swap for your own animation |
| `public/vendor/qrcode.mjs` | QR code generator ([qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)); refresh it with `npm run vendor` |
| `course.json` | The course's pars and maximum strokes |

## Credits

Animal pictures from [Animal Pack Remastered](https://kenney.nl/assets/animal-pack-remastered) by [Kenney](https://kenney.nl) (CC0).

Sound effects (in [`public/sounds/`](public/sounds/)):

- `pinball.mp3`: from ["Classic Pinball Gameplay"](https://freesound.org/s/404144/) by [theshaggyfreak](https://freesound.org/people/theshaggyfreak/), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Trimmed and edited.
- `eagle.mp3`, `eaglein.mp3`, `eagleout.mp3`: from ["RAM_Mouth Hawk_rev_v1.wav"](https://freesound.org/s/344445/) by [reidedo](https://freesound.org/people/reidedo/), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Trimmed and edited; `eaglein` and `eagleout` are the two halves.
- `choir.mp3`: from Freesound (CC0). Trimmed and edited.

## Still to come

- A cartoony grass background with see-through bars
- A cinematic hole-in-one pop-up style (ball flying across the grass into the hole) for quieter venues, picked in settings
- Records for the week, month, year and all time on the big screen (the backend already calculates them)
- A settings page and admin login for managing the course
