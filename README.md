# minigolf-leaderboard

Digital scorecards for minigolf. Players scan a QR code on the course's big screen, keep score on their phones, and the screen shows the day's best rounds, updating live.

## Features

- **Live leaderboard** on the big screen, ranked by over/under par, with a podium for finished rounds and a QR code to start a new game. Any number of groups can play at once.
- **Phone scorecards**: enter a party name and players, then fill in scores hole by hole, with running totals and corrections.
- **Animals** for every player, shown on their scorecard and on the big screen.
- **Pop-ups** for holes in one, eagles, birdies and maxed-out holes, Tony Hawk style, with combos when several land together.
- **Records** saved for every finished round, kept separately for each course layout.

Built with plain HTML, CSS and JavaScript on [Cloudflare Workers](https://developers.cloudflare.com/workers/), with a [Durable Object](https://developers.cloudflare.com/durable-objects/) storing everything in SQLite.

## Quick start

```sh
npm install
npm run dev
```

Open http://localhost:8787 for the big screen and http://localhost:8787/play for a scorecard.

For playing on real phones, setting up your course, deploying and the project layout, see **[SELF_HOST.md](SELF_HOST.md)**. How the code works is in [CODE_GUIDE.md](CODE_GUIDE.md).

## Still to come

- A cartoony grass background with see-through bars
- A cinematic hole-in-one pop-up style for quieter venues, picked in settings
- Records for the week, month, year and all time on the big screen

## Credits

Animal pictures from [Animal Pack Remastered](https://kenney.nl/assets/animal-pack-remastered) by [Kenney](https://kenney.nl) (CC0).

Sound effects (in [`public/sounds/`](public/sounds/)):

- `pinball.mp3`: from ["Classic Pinball Gameplay"](https://freesound.org/s/404144/) by [theshaggyfreak](https://freesound.org/people/theshaggyfreak/), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Trimmed and edited.
- `eagle.mp3`, `eaglein.mp3`, `eagleout.mp3`: from ["RAM_Mouth Hawk_rev_v1.wav"](https://freesound.org/s/344445/) by [reidedo](https://freesound.org/people/reidedo/), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Trimmed and edited.
- `choir.mp3`: from Freesound (CC0). Trimmed and edited.
