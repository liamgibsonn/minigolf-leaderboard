import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:8787';
const WS_BASE = BASE.replace(/^http/, 'ws');
const json = { headers: { 'content-type': 'application/json' } };
const post = (path, body) => http.post(`${BASE}/api${path}`, JSON.stringify(body), json);
const boardUpdates = new Counter('board_updates');
const PARTIES = Number(__ENV.PARTIES || 50);

export const options = {
  scenarios: {
    parties: {
      executor: 'ramping-vus',
      exec: 'party',
      stages: [
        { duration: '1m', target: Math.ceil(PARTIES * 0.4) },
        { duration: '3m', target: PARTIES },
        { duration: '1m', target: 0 },
      ],
    },
    screens: { executor: 'constant-vus', exec: 'screen', vus: 2, duration: '5m' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

export function party() {
  const { id, key } = post('/games', {}).json();
  const players = Array(1 + Math.floor(Math.random() * 4)).fill('test');
  const { game } = post(`/games/${id}/start`, { key, partyName: 'test', players }).json();

  game.pars.forEach((par, hole) => {
    sleep(2 + Math.random() * 3); // walking to the next hole, sped up
    const scores = game.players.map((p) => ({ playerId: p.id, strokes: randomScore(par, game.maxStrokes) }));
    const res = post(`/games/${id}/hole`, { key, hole, scores });
    check(res, { 'hole sent': (r) => r.status === 200 });
  });

  const res = post(`/games/${id}/finish`, { key });
  check(res, { 'game finished': (r) => r.status === 200 });
}

// 10% holes in one, 10% maxed out, otherwise two under par to two over.
function randomScore(par, maxStrokes) {
  const roll = Math.random();
  if (roll < 0.1) return 1;
  if (roll < 0.2) return maxStrokes;
  return Math.min(maxStrokes, Math.max(2, par - 2 + Math.floor(Math.random() * 5)));
}

export function screen() {
  const res = ws.connect(`${WS_BASE}/api/ws`, {}, (socket) => {
    socket.on('message', (data) => {
      if (JSON.parse(data).type === 'board') boardUpdates.add(1);
    });
    socket.setTimeout(() => socket.close(), 60000);
  });
  check(res, { 'screen connected': (r) => r && r.status === 101 });
}
