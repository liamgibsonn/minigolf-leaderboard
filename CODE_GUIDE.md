# Code guide

How the pieces work and what the settings mean. The code keeps comments short; the explanations live here.

## Pop-ups (`public/popups.js`)

Pop-ups show on the big screen for holes in one, eagles, birdies and maxed-out holes ("bailed") from any game on the course.

**How they're grouped.** When a result arrives, the screen waits `GATHER_MS` (1000ms) so results arriving together share a pop-up. Results are grouped by type: three holes in one from three parties make one "×3 combo" pop-up. Different types play one after another, in the order they're listed in `POPUPS`, with a `GAP_MS` (200ms) pause between them. Results of the same type that arrive after a pop-up starts still join it, right up until its `animals` time. That's when the combo size is settled and the leave time worked out. Anything arriving later goes into the next round of grouping, so a busy course never builds a long queue.

**Every pop-up runs on a timeline.** Every time is in ms from the moment the pop-up starts, not from the previous step. `appear: 200, animals: 400` means it appears at 0.2s and the animals start at 0.4s.

1. `appear`: the pop-up shows up. It's either a card, or `art` flying in from the top right.
2. `animals`: the combo starts, with one animal per player, `COMBO.step` apart, each with its sound.
3. `leave`: it starts to go (a card fades out, flying art swoops off).
4. `gone`: it's removed, and the next pop-up can start.

Sounds are listed separately with their own start times, so they can play before anything is on screen.

**Set the times for a full combo** (`COMBO.maxAnimals` animals or more). A smaller combo finishes early by itself. `leave`, `gone` and any sound after `animals` move earlier by `notFullCut`, plus `perMissingCut` for each missing animal. With 1000 and 200, a birdie with `leave: 2500` leaves at:

| Combo | Leaves at |
|---|---|
| ×5 or more | 2500 |
| ×4 | 1300 |
| ×3 | 1100 |
| ×2 | 900 |
| ×1 | 700 |

### `COMBO` (shared by every pop-up)

| Setting | Meaning |
|---|---|
| `step` | ms between animals popping in. Also the gap between their sounds. |
| `maxAnimals` | The most animals shown. Any more show as "+3". This is also a "full" combo. |
| `notFullCut` | How much sooner a combo smaller than `maxAnimals` leaves. |
| `perMissingCut` | How much sooner again for each animal short of `maxAnimals`. |
| `sounds` | The sound for each animal, in order. A list plays several at once. The 5th is the jackpot (pinball + choir). |

Each animal appears when its sound is actually heard, not when it starts. MP3s open with a little silence and speakers add a delay, so `heardAfter` in `sounds.js` works out that offset (about 0.1s).

### `POPUPS` (one entry per type)

| Setting | Meaning |
|---|---|
| `label` | The big words, e.g. "Birdie!" |
| `countWord` | The word after the count when several got it: "×3 combo". Empty gives just "×3". |
| `art` | Optional. Artwork that flies across the top, with the words underneath instead of a card. An animated WebP or SVG works; later it can be a silent video. |
| `flag` | Optional. `true` also plays the flag-and-ball scene (see below) from the pop-up's start. The hole in one uses this. |
| `keepLength` | Optional. `true` keeps the full timings whatever the combo size (the eagle uses this). |
| `drift` | How far the artwork drifts either side of the middle while it hovers. |
| `sounds` | Extra sounds as `[time, name]` pairs, e.g. `[[0, 'eaglein'], [1450, 'eagle']]`. Names are files in `public/sounds/`, without `.mp3`. |

**`timing`** (all in ms from the start):

| Setting | Meaning |
|---|---|
| `appear` | When it shows up. |
| `arrive` | Flying art only: when the swoop in finishes and the words underneath appear. |
| `animals` | When the first animal pops in. |
| `leave` | When it starts to go: a card starts fading, flying art starts its swoop out. |
| `gone` | When it's removed. For a card, `gone − leave` is the fade length. |

Its path is measured in vmin, so the flight is the same shape on every screen, portrait or landscape. The flying art swoops in fast from `appear` to `arrive`, drifts slowly until `leave`, then speeds off to the top left by `gone`, mirroring the swoop in. The leave time isn't known until `animals`, so the flight is planned twice. At `appear` it drifts towards the full-combo `leave`; at `animals` it carries on from wherever it is towards the real one. Keep `arrive` at or before `animals`.

Animal pictures are all preloaded when the big screen opens. Each pop-up waits for its own animals, so an animal never shows up after its sound.

### Flag and ball (`public/flag.js`)

Plays with the hole in one's pop-up (`flag: true`), starting at the very beginning of the pop-up. The words, animals and party name are a normal card, in the same place as the birdie's, from the pop-up's `appear`.

A flag rises from the bottom of the screen, just past the left end of the white "scan to play" strip, just left of where the ball will fall. A golf ball comes in from the top right and lands on the strip. It bounces, braking gently as it goes, and slows to a creep where the strip's corner curves down. It teeters there, tips over the curve gathering speed, then drops off under gravity, falling more and more steeply into the flag and out through the bottom of the screen. The flag stays up until the pop-up's `leave`, then sinks back down while the words fade (over `gone − leave`). Positions are measured from the strip on screen, so it lines up at any size or orientation.

**`TIMES`** (ms from the pop-up's start):

| Setting | Meaning |
|---|---|
| `drop` | The ball starts falling. |
| `flagUp` | The flag is fully up. |
| `land` | The ball first hits the strip. |
| `settle` | The bounces are over; it keeps rolling. |
| `edge` | It reaches the top of the strip's curved corner, having braked evenly from `land` down to a creep (`CREEP`). |
| `tip` | It leaves the curve, having sped up evenly over the corner since `edge`. It then falls under the same gravity as its bounces, keeping the speed it left with, into the flag. This takes about 200ms, so set the pop-up's `appear` to about `tip` + 200. |

`BOUNCES` is the height of each bounce in vmin (1 vmin is 1% of the screen's shorter side). Add or remove entries for more or fewer bounces; they share the time between `land` and `settle`. `BALL` and `POLE` are the ball's size and the flag's height, both in vmin. The flag goes where the ball falls (which `ROLL_OFF`, `CREEP` and the `edge`/`tip` times decide), shifted `FLAG_LEFT` vmin to the left. `CLEAR` is how far (in vmin) the ball eases to the left over the first half of its drop, so it clears the strip's rounded corner instead of clipping it. `LAND` is how far (in vmin) along the strip from its curved corner the ball first lands. Smaller means it comes in slower. `ROLL_OFF` is how many degrees round the curved corner it rolls before leaving it. `CREEP` is its speed at the top of the curve, in vmin per second; 1.6 is about the eagle's hover drift. Everything is measured in vmin, so the animation looks the same on every screen, just bigger or smaller.

## Sounds (`public/sounds.js`)

Sounds are MP3 files in `public/sounds/`. A missing file just stays silent. Browsers keep a page silent until it's been clicked, so the big screen shows "Click anywhere to turn on sound" once.

- `play(name)`: plays a sound.
- `heardAfter(name)`: ms from `play()` until the sound is actually heard. This is its "hit" point plus the speaker delay.

The hit is where the sound first reaches half its peak volume within 0.4s, which suits a pinball. If it never does, the hit is where the sound first becomes audible, which suits a swelling choir.

## Big screen (`public/display.js`, `display.css`)

The big screen is the course's leaderboard, not a view of one game. It shows today's finished rounds plus everyone still playing, ranked by over/under par.

- **Podium:** finished rounds placed 1st to 3rd. Ties share a place and the next place is skipped, so the podium can hold more than three (e.g. two tied for bronze). Live rounds can't reach it.
- **Tab numbers:** the number on each bar is its place in the order shown. Neighbouring bars with the same score share a number.
- **LIVE tab:** on players still playing, a red L-I-V-E panel fades in and out over the place number.
- Bars that don't fully fit are removed, so the screen always shows whole lines. Bars grow with the screen only up to a readable size, so a bigger screen fits more rounds.
- The screen refreshes every minute. This catches midnight (a new day's board) and abandoned games, which the live socket doesn't announce.
- If the connection drops, the screen retries forever, backing off to every 15s.
- **QR corner:** the white padding around the QR code is exactly 4 QR squares. That's the "quiet zone" scanners need.
- **The "scan to play" strip** is sized to its longest line of text by `fitStrip` in `display.js`. When the text wraps (e.g. in portrait), a plain CSS box would stay full width and leave a gap before the QR code.
- `/?popup-preview` loops sample pop-ups (a 5 combo, an 8 combo, then 2 eagles) for trying out the look and sounds.
- The colours are greyscale on purpose, as a blank canvas to style later. The only colours are the scores, the medal places and the LIVE tabs.

## Phone scorecard (`public/play.js`)

The screens go in this order: (welcome back →) setup → hole → totals → hole → … → totals → final scores.

- The game's edit key stays in the URL, so a refresh or a copy of the link can still enter scores. Without the key, a link is view-only.
- **Welcome back:** the phone remembers its current game in the browser only. If the QR code is scanned again within `RESUME_WINDOW` (12 hours) of the game starting and it's still going, the phone offers to continue it.
- On a hole that's already been sent, "Next" moves on without sending. It turns into "Update" once a score changes.

## Settings page (`public/admin.js`)

`/admin` edits the course-wide settings: the pars (their count is the number of holes), `maxStrokes`, and `popups`. Saving needs the admin password (`ADMIN_PASSWORD`, see SELF_HOST.md). Adding holes copies the last hole's par into the new ones.

## Backend (`src/course.js`)

One Durable Object instance ("main") holds every game, player and score in SQLite.

### Settings

| Setting | Meaning |
|---|---|
| `MAX_HOLES`, `MAX_PLAYERS` | Limits for a course and a party. |
| `STROKE_LIMIT` | The highest `course.json` can set `maxStrokes` to. |
| `BOARD_LIMIT` | The most rounds sent to the big screen, which shows as many as fit. |
| `LIVE_WINDOW` | A game with nothing sent for 30 minutes drops off the big screen. Its data is kept, so it comes back if they carry on. |
| `DEFAULT_SETTINGS` | Used until settings are first saved from `/admin`: `course.json`'s pars and maxStrokes, with pop-ups on. |

Saved settings live in the `settings` table, in the row named `admin`, as JSON: `{ pars, maxStrokes, popups }`. Older databases also have a stale `course` row there, which is ignored.

### API (all JSON, under `/api`)

| Request | Returns |
|---|---|
| `POST /games` | `{ id, key }`: creates a game in `setup` |
| `GET /games/:id` | `{ game }`: no key needed |
| `POST /games/:id/start` `{ key, partyName?, players: [name] }` | `{ game }` |
| `POST /games/:id/hole` `{ key, hole, scores: [{ playerId, strokes }] }` | `{ game, submitted }` |
| `POST /games/:id/finish` `{ key }` | `{ game }` |
| `GET /ws` | WebSocket for the big screen |
| `GET /ws?game=:id` | WebSocket for one game (phones) |
| `GET /board` | `{ layout, today, liveGames, leaderboard }`: what the big screen shows |
| `GET /stats?layout=3-3-3&limit=5` | `{ layout, periods }`: records and averages |
| `GET /settings` | `{ pars, maxStrokes, popups, limits }`: no password needed |
| `POST /settings` `{ password, pars, maxStrokes, popups }` | The saved settings. 401 for a wrong password, 503 if `ADMIN_PASSWORD` isn't set |

### Rules

- **Course:** each game copies the current settings' pars and maxStrokes when it's created, so changing them never affects a game already underway. The big screen shows the current layout's records, so games still on an old layout drop off it.
- **Pop-ups off:** the `events` message isn't sent to the big screen at all. Phones are unaffected.
- **Starting:** names with swearing are refused. The check also runs with spaces, dots and dashes removed, which catches "f u c k" and occasionally an innocent name. A blank party name gets a random one like "The Wobbly Putters". Each player gets a different random animal, a number from 0 to 29 matching `public/animals/<number>.png`.
- **Pop-up events:** each score is checked in this order. A hole in one (1 stroke) wins over everything, then eagle (2+ under par), then birdie (1 under), then bailed (hit `maxStrokes`). Events only fire the first time a hole is sent. Correcting it later updates quietly, and resending identical scores does nothing.
- **Records:** only games finished with every hole sent count. Each player's round goes into `rounds`, which every record and average reads from. Records are kept per course layout (the pars joined, e.g. `3-3-3`), for today, this week (from Monday), this month, this year and all time. All periods start at 00:00 UTC.
- **Ranking:** by over/under par, which compares fairly with rounds still going. On a tie, finished rounds come first, and among records whoever got there first keeps the spot.

### Live messages

- **Phones** get `{ type: 'game', game, submitted }` whenever their game changes. `submitted` is `{ hole, partyName, events }` after a hole is sent, otherwise null.
- **The big screen** gets `{ type: 'board', board }` on connect and after every start, hole and finish. It gets `{ type: 'events', gameId, hole, partyName, events }` when a hole in any game earns pop-ups (unless pop-ups are off), and a fresh board whenever settings are saved.
