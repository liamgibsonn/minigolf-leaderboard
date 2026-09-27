import { DurableObject } from 'cloudflare:workers';
import courseJson from '../course.json';
import { periodStarts, layoutKey, parseLayoutKey } from './stats.js';
import { isRude, pickAnimals, randomPartyName } from './names.js';

const MAX_HOLES = 18;
const MAX_PLAYERS = 8;
const MAX_NAME_LENGTH = 20;
const MAX_PARTY_NAME_LENGTH = 30;
const STROKE_LIMIT = 20; // the highest course.json can set maxStrokes to
const BOARD_LIMIT = 50; // most rounds sent to the display; it shows as many as fit
// A game still 'playing' with nothing sent for this long counts as abandoned: it drops
// off the big screen (its data is kept, so it comes back if they carry on).
const LIVE_WINDOW = 30 * 60 * 1000;

// The course (par for each hole, which also sets the number of holes, and the most
// strokes allowed on a hole) comes from course.json. Restart the server after editing it.
const COURSE = checkCourse(courseJson);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Holds every game, player and score. There's one instance ("main") for the whole app.
//
// API (all JSON, all under /api):
//   POST /games                 -> { id, key }         create a game in 'setup'
//   GET  /games/:id             -> { game }            read a game (no key needed)
//   POST /games/:id/start       { key, partyName?, players: [name] } -> { game }
//   POST /games/:id/hole        { key, hole, scores: [{ playerId, strokes }] } -> { game, submitted }
//   POST /games/:id/finish      { key } -> { game }
//   GET  /ws                    WebSocket for the display (the course records board)
//   GET  /ws?game=:id           WebSocket for one game (phones)
//   GET  /board                 -> { layout, today, liveGames, leaderboard }   what the display shows
//   GET  /stats?layout=3-3-3&limit=5  -> { layout, periods }   records and averages
//
// Each game copies the course (see COURSE) when it's created, so changing course.json
// never affects a game that's already underway.
//
// Starting a game: names containing swearing are refused (see isRude). A blank party
// name gets a random one, and each player is given a different random animal, a number
// from 0 to 29 matching public/animals/<number>.png.
//
// Phone sockets receive { type: 'game', game, submitted } whenever their game changes.
// `submitted` is { hole, partyName, events } after a hole is sent, otherwise null.
// `events` are the pop-ups to play, one per notable score (see scoreEvent), each with
// the player's name and animal. They only happen the first time a hole is sent;
// resending it later (a correction) updates the scores quietly, and resending identical
// scores does nothing at all.
//
// The display is the course's leaderboard, not a view of any one game: today's finished
// rounds plus everyone still playing. Its socket receives { type: 'board', board } on
// connect and after every start, hole and finish, and { type: 'events', gameId, hole,
// partyName, events } when a hole in any game earns pop-ups.
//
// Records: when a game is finished with every hole sent, each player's round is saved to
// `rounds`. Stats are per course layout (the list of pars) for today, this week (from
// Monday), this month, this year and all time, all starting at 00:00 UTC.
export class Course extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS games (
        id          TEXT PRIMARY KEY,
        edit_key    TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'setup',
        pars        TEXT NOT NULL,
        max_strokes INTEGER NOT NULL,
        created_at  INTEGER NOT NULL,
        started_at  INTEGER,
        finished_at INTEGER,
        party_name  TEXT
      );
      CREATE TABLE IF NOT EXISTS players (
        id       INTEGER PRIMARY KEY,
        game_id  TEXT NOT NULL,
        name     TEXT NOT NULL,
        position INTEGER NOT NULL,
        animal   INTEGER
      );
      CREATE TABLE IF NOT EXISTS scores (
        game_id   TEXT NOT NULL,
        player_id INTEGER NOT NULL,
        hole      INTEGER NOT NULL,
        strokes   INTEGER NOT NULL,
        PRIMARY KEY (player_id, hole)
      );
      CREATE TABLE IF NOT EXISTS holes_submitted (
        game_id      TEXT NOT NULL,
        hole         INTEGER NOT NULL,
        submitted_at INTEGER NOT NULL,
        PRIMARY KEY (game_id, hole)
      );
      CREATE TABLE IF NOT EXISTS rounds (
        game_id     TEXT NOT NULL,
        player_id   INTEGER NOT NULL PRIMARY KEY,
        name        TEXT NOT NULL,
        layout      TEXT NOT NULL,
        total       INTEGER NOT NULL,
        to_par      INTEGER NOT NULL,
        finished_at INTEGER NOT NULL,
        animal      INTEGER,
        party_name  TEXT
      );
      CREATE INDEX IF NOT EXISTS players_by_game ON players (game_id);
      CREATE INDEX IF NOT EXISTS scores_by_game ON scores (game_id);
      CREATE INDEX IF NOT EXISTS rounds_by_layout_time ON rounds (layout, finished_at);
      CREATE INDEX IF NOT EXISTS rounds_by_layout_total ON rounds (layout, total);
    `);
    // Databases made before parties and animals existed don't have these columns yet.
    // Games and rounds from then just have no party name or animal (null).
    this.addColumnIfMissing('games', 'party_name', 'TEXT');
    this.addColumnIfMissing('players', 'animal', 'INTEGER');
    this.addColumnIfMissing('rounds', 'animal', 'INTEGER');
    this.addColumnIfMissing('rounds', 'party_name', 'TEXT');
    // Rounds from before animals existed were test games; keep them off the board.
    this.sql.exec('DELETE FROM rounds WHERE animal IS NULL');
  }

  addColumnIfMissing(table, column, type) {
    const exists = this.sql.exec(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`, column).toArray().length;
    if (!exists) this.sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }

  async fetch(request) {
    try {
      return await this.route(request);
    } catch (err) {
      if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
      throw err;
    }
  }

  async route(request) {
    const url = new URL(request.url);
    const [, , resource, id, action] = url.pathname.split('/'); // '', 'api', resource, ...
    // Always read the body first, even when we won't need it: replying while it's still
    // unread makes the runtime throw ("Can't read from request stream after response
    // has been sent").
    const body = await readJson(request);

    if (resource === 'ws') return this.connect(request, url.searchParams.get('game'));
    if (resource === 'stats' || resource === 'board') {
      if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed');
      return Response.json(resource === 'board' ? this.board() : this.stats(url.searchParams));
    }
    if (resource !== 'games') throw new HttpError(404, 'Not found');

    if (!id) {
      if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
      return Response.json(this.createGame(), { status: 201 });
    }

    const game = this.requireGame(id);
    if (!action) {
      if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed');
      return Response.json({ game: publicGame(game) });
    }

    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    if (body?.key !== game.key) throw new HttpError(403, 'This link can’t edit this game');

    let submitted = null;
    switch (action) {
      case 'start':
        this.startGame(game, body);
        break;
      case 'hole':
        submitted = this.submitHole(game, body);
        // Identical resend (e.g. a retry after losing signal): nothing to tell anyone.
        if (!submitted) return Response.json({ game: publicGame(game), submitted: null });
        break;
      case 'finish':
        this.finishGame(game);
        break;
      default:
        throw new HttpError(404, 'Not found');
    }
    const updated = this.broadcast(id, submitted);

    // The display: a hole with pop-ups gets played on the big screen whichever game it
    // came from, and every change moves the leaderboard (live scores, new rounds, the
    // games-being-played count).
    if (submitted?.events.length) this.sendToDisplays({ type: 'events', gameId: id, ...submitted });
    this.sendToDisplays({ type: 'board', board: this.board() });
    return Response.json({ game: updated, submitted });
  }

  // ---- Games ---------------------------------------------------------------

  createGame() {
    const id = randomId(6);
    const key = randomId(20);
    const { pars, maxStrokes } = COURSE;
    this.sql.exec(
      'INSERT INTO games (id, edit_key, pars, max_strokes, created_at) VALUES (?, ?, ?, ?, ?)',
      id, key, JSON.stringify(pars), maxStrokes, Date.now(),
    );
    return { id, key };
  }

  startGame(game, { partyName, players }) {
    if (game.status !== 'setup') throw new HttpError(409, 'This game has already started');

    const party = cleanName(partyName, MAX_PARTY_NAME_LENGTH);
    if (party && isRude(party)) throw new HttpError(400, 'Please choose a different party name');

    // Blank names are dropped (empty rows on the phone), but numbering for error
    // messages follows what the player typed into.
    const entered = (Array.isArray(players) ? players : []).map((name) => cleanName(name, MAX_NAME_LENGTH));
    const rude = entered.findIndex((name) => name && isRude(name));
    if (rude !== -1) throw new HttpError(400, `Please choose a different name for player ${rude + 1}`);
    const names = entered.filter(Boolean);
    if (names.length < 1 || names.length > MAX_PLAYERS) {
      throw new HttpError(400, `Add between 1 and ${MAX_PLAYERS} players`);
    }

    const animals = pickAnimals(names.length);
    this.ctx.storage.transactionSync(() => {
      names.forEach((name, position) => {
        this.sql.exec(
          'INSERT INTO players (game_id, name, position, animal) VALUES (?, ?, ?, ?)',
          game.id, name, position, animals[position],
        );
      });
      this.sql.exec(
        "UPDATE games SET status = 'playing', started_at = ?, party_name = ? WHERE id = ?",
        Date.now(), party || randomPartyName(), game.id,
      );
    });
  }

  // Saves every player's strokes for one hole. Every player needs a score.
  // Returns { hole, partyName, events }, or null if exactly these scores were already saved.
  submitHole(game, { hole, scores }) {
    if (game.status !== 'playing') throw new HttpError(409, 'This game isn’t in play');
    if (!Number.isInteger(hole) || hole < 0 || hole >= game.pars.length) throw new HttpError(400, 'Unknown hole');
    if (!Array.isArray(scores)) throw new HttpError(400, 'Scores are missing');

    const strokesByPlayer = new Map();
    for (const entry of scores) {
      const player = game.players.find((p) => p.id === entry?.playerId);
      if (!player) throw new HttpError(400, 'Unknown player');
      if (strokesByPlayer.has(player.id)) throw new HttpError(400, `${player.name} has two scores`);
      const { strokes } = entry;
      if (!Number.isInteger(strokes) || strokes < 1 || strokes > game.maxStrokes) {
        throw new HttpError(400, `${player.name}’s score must be between 1 and ${game.maxStrokes}`);
      }
      strokesByPlayer.set(player.id, strokes);
    }
    const missing = game.players.filter((p) => !strokesByPlayer.has(p.id));
    if (missing.length) throw new HttpError(400, `Missing a score for ${missing.map((p) => p.name).join(', ')}`);

    const firstTime = !game.submittedHoles.includes(hole);
    const unchanged = game.players.every((p) => p.scores[hole] === strokesByPlayer.get(p.id));
    if (!firstTime && unchanged) return null;

    this.ctx.storage.transactionSync(() => {
      for (const [playerId, strokes] of strokesByPlayer) {
        this.sql.exec(
          'INSERT OR REPLACE INTO scores (game_id, player_id, hole, strokes) VALUES (?, ?, ?, ?)',
          game.id, playerId, hole, strokes,
        );
      }
      if (firstTime) {
        this.sql.exec('INSERT INTO holes_submitted (game_id, hole, submitted_at) VALUES (?, ?, ?)', game.id, hole, Date.now());
      }
    });

    // Order follows the players' order; the display decides how to stack them.
    const par = game.pars[hole];
    const events = firstTime
      ? game.players.flatMap((p) => {
          const strokes = strokesByPlayer.get(p.id);
          const type = scoreEvent(strokes, par, game.maxStrokes);
          return type ? [{ playerId: p.id, name: p.name, animal: p.animal, type, strokes, par }] : [];
        })
      : [];
    return { hole, partyName: game.partyName, events };
  }

  // Only complete games (every hole sent) count towards the records.
  finishGame(game) {
    if (game.status !== 'playing') throw new HttpError(409, 'This game isn’t in play');
    const finishedAt = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.sql.exec("UPDATE games SET status = 'finished', finished_at = ? WHERE id = ?", finishedAt, game.id);
      if (game.submittedHoles.length === game.pars.length) this.saveRounds({ ...game, finishedAt });
    });
  }

  // ---- Records -------------------------------------------------------------

  // One row per player in `rounds`, which is what every record and average reads from.
  saveRounds(game) {
    const coursePar = game.pars.reduce((a, b) => a + b, 0);
    for (const p of game.players) {
      const total = p.scores.reduce((a, b) => a + b, 0);
      this.sql.exec(
        `INSERT INTO rounds (game_id, player_id, name, animal, party_name, layout, total, to_par, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        game.id, p.id, p.name, p.animal, game.partyName, layoutKey(game.pars), total, total - coursePar, game.finishedAt,
      );
    }
  }

  // What the display shows: the leaderboard (today's finished rounds plus everyone still
  // playing on the current course), and how many games are being played right now.
  board() {
    const { layout, periods } = this.stats(new URLSearchParams({ limit: String(BOARD_LIMIT) }));
    const liveIds = this.liveGameIds();

    // Players part-way through, once their party has sent at least one hole.
    const live = liveIds
      .map((id) => this.loadGame(id))
      .filter((game) => game.submittedHoles.length && layoutKey(game.pars) === layoutKey(layout))
      .flatMap((game) => {
        const parSoFar = sumOf(game.submittedHoles.map((h) => game.pars[h]));
        return game.players.map((p) => {
          const total = sumOf(game.submittedHoles.map((h) => p.scores[h]));
          return {
            name: p.name, animal: p.animal, partyName: game.partyName,
            total, toPar: total - parSoFar, thru: game.submittedHoles.length, live: true,
          };
        });
      });
    const finished = periods.today.best.map((round) => ({ ...round, live: false }));

    // Everyone is ranked by over/under par, which also compares fairly with a round
    // that's still going. On a tie, finished rounds come first (the sort keeps their
    // existing order).
    const leaderboard = [...finished, ...live]
      .sort((a, b) => a.toPar - b.toPar || a.live - b.live)
      .slice(0, BOARD_LIMIT);

    return { layout, today: periods.today, liveGames: liveIds.length, leaderboard };
  }

  // Games in play that have had a hole sent (or started) recently.
  liveGameIds() {
    return this.sql
      .exec(
        `SELECT id FROM games g
         WHERE status = 'playing'
           AND MAX(started_at, COALESCE((SELECT MAX(submitted_at) FROM holes_submitted h WHERE h.game_id = g.id), 0)) >= ?`,
        Date.now() - LIVE_WINDOW,
      )
      .toArray()
      .map((row) => row.id);
  }

  // Best rounds, averages and holes in one for each period, for one course layout
  // (the current course unless ?layout= says otherwise).
  stats(params) {
    const layoutParam = params.get('layout');
    const pars = layoutParam ? parseLayoutKey(layoutParam) : COURSE.pars;
    if (!pars) throw new HttpError(400, 'layout should look like 3-3-3');
    const layout = layoutKey(pars);
    const limit = Math.min(Math.max(Number.parseInt(params.get('limit') ?? '5', 10) || 5, 1), 50);

    const periods = {};
    for (const [period, since] of Object.entries(periodStarts())) {
      const { rounds, average } = this.sql
        .exec('SELECT COUNT(*) AS rounds, AVG(total) AS average FROM rounds WHERE layout = ? AND finished_at >= ?', layout, since)
        .one();
      // Best over/under par wins; on a tie, whoever got there first keeps the spot.
      const best = this.sql
        .exec(
          `SELECT name, animal, party_name AS partyName, total, to_par AS toPar, finished_at AS finishedAt
           FROM rounds WHERE layout = ? AND finished_at >= ? ORDER BY to_par, finished_at LIMIT ?`,
          layout, since, limit,
        )
        .toArray();
      const holeRows = this.sql
        .exec(
          `SELECT hole, AVG(strokes) AS average, SUM(strokes = 1) AS aces FROM scores
           WHERE player_id IN (SELECT player_id FROM rounds WHERE layout = ? AND finished_at >= ?)
           GROUP BY hole`,
          layout, since,
        )
        .toArray();

      const holeAverages = pars.map(() => null);
      let holesInOne = 0;
      for (const row of holeRows) {
        holeAverages[row.hole] = roundTo1(row.average);
        holesInOne += row.aces;
      }
      periods[period] = { since, rounds, average: roundTo1(average), best, holeAverages, holesInOne };
    }
    return { layout: pars, periods };
  }

  // ---- Live updates --------------------------------------------------------

  connect(request, gameId) {
    if (request.headers.get('Upgrade') !== 'websocket') throw new HttpError(426, 'Expected a WebSocket');

    // Phones watch one game; without ?game= it's the display, which gets the board.
    const first = gameId
      ? { type: 'game', game: publicGame(this.requireGame(gameId)), submitted: null }
      : { type: 'board', board: this.board() };
    const [client, server] = Object.values(new WebSocketPair());
    // Hibernatable sockets: tagged so broadcast() can find them after the object wakes up.
    this.ctx.acceptWebSocket(server, [gameId ? `game:${gameId}` : 'display']);
    server.send(JSON.stringify(first));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketClose(ws, code) {
    try {
      ws.close(code, 'Closing');
    } catch {
      // Already closed, or a reserved code (1005/1006) that can't be echoed back.
    }
  }

  // Sends the latest state to the phones watching this game, and returns it.
  broadcast(gameId, submitted) {
    const game = publicGame(this.loadGame(gameId));
    send(this.ctx.getWebSockets(`game:${gameId}`), { type: 'game', game, submitted });
    return game;
  }

  sendToDisplays(message) {
    send(this.ctx.getWebSockets('display'), message);
  }

  // ---- Storage -------------------------------------------------------------

  requireGame(id) {
    const game = this.loadGame(id);
    if (!game) throw new HttpError(404, 'Game not found');
    return game;
  }

  loadGame(id) {
    if (!id) return null;
    const row = this.sql.exec('SELECT * FROM games WHERE id = ?', id).toArray()[0];
    if (!row) return null;

    const pars = JSON.parse(row.pars);
    const players = this.sql
      .exec('SELECT id, name, animal FROM players WHERE game_id = ? ORDER BY position', id)
      .toArray()
      .map((p) => ({ id: p.id, name: p.name, animal: p.animal, scores: pars.map(() => null) }));
    const byId = new Map(players.map((p) => [p.id, p]));
    for (const s of this.sql.exec('SELECT player_id, hole, strokes FROM scores WHERE game_id = ?', id)) {
      byId.get(s.player_id).scores[s.hole] = s.strokes;
    }
    const submittedHoles = this.sql
      .exec('SELECT hole FROM holes_submitted WHERE game_id = ? ORDER BY hole', id)
      .toArray()
      .map((h) => h.hole);

    return {
      id: row.id,
      key: row.edit_key,
      status: row.status,
      partyName: row.party_name,
      pars,
      maxStrokes: row.max_strokes,
      createdAt: row.created_at,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      submittedHoles,
      players,
    };
  }
}

// Stops the server starting (with a clear message in the terminal) if course.json is wrong.
function checkCourse({ pars, maxStrokes }) {
  if (!Number.isInteger(maxStrokes) || maxStrokes < 1 || maxStrokes > STROKE_LIMIT) {
    throw new Error(`course.json: maxStrokes must be a whole number from 1 to ${STROKE_LIMIT}`);
  }
  if (!Array.isArray(pars) || pars.length < 1 || pars.length > MAX_HOLES) {
    throw new Error(`course.json: pars must list between 1 and ${MAX_HOLES} holes`);
  }
  const bad = pars.findIndex((par) => !Number.isInteger(par) || par < 1 || par > maxStrokes);
  if (bad !== -1) throw new Error(`course.json: hole ${bad + 1}'s par must be a whole number from 1 to ${maxStrokes}`);
  return { pars, maxStrokes };
}

// Which pop-up (if any) a score earns. A hole in one beats everything else.
function scoreEvent(strokes, par, maxStrokes) {
  if (strokes === 1) return 'hole-in-one';
  if (strokes <= par - 2) return 'eagle';
  if (strokes === par - 1) return 'birdie';
  if (strokes >= maxStrokes || strokes >= par + 3) return 'bailed';
  return null;
}

// Trims, squashes repeated spaces and cuts to length. Anything that isn't text becomes ''.
function cleanName(value, maxLength) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength).trim() : '';
}

function send(sockets, message) {
  const text = JSON.stringify(message);
  for (const ws of sockets) {
    try {
      ws.send(text);
    } catch {
      // Socket is closing; it'll be cleaned up by webSocketClose.
    }
  }
}

const roundTo1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
const sumOf = (list) => list.reduce((a, b) => a + b, 0);

// Reads the whole body. Returns null if there isn't one.
async function readJson(request) {
  const text = request.body ? await request.text() : '';
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

// The edit key must never be sent to viewers.
function publicGame({ key, ...game }) {
  return game;
}

// No look-alike characters (0/o, 1/l/i) so IDs are easy to read off a screen.
const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function randomId(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}
