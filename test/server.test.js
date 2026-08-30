import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { connect } from 'node:net';
import { createApp } from '../src/server.js';

let server;
let baseUrl;

before(async () => {
  const service = {
    snapshot: async () => ({
      league: { name: 'Test', rounds: 2 },
      status: 'in_progress',
      picks: [{
        overall: 1,
        round: 1,
        roundPick: 1,
        team: { id: 1, name: 'Alpha', abbreviation: 'ALP', logo: null },
        player: { id: 100, name: 'Ada Runner', position: 'RB', proTeam: 'BUF' }
      }],
      updatedAt: '2026-08-30T00:00:00.000Z'
    })
  };
  server = createApp({ demo: service, live: null });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('serves the app and health endpoint', async () => {
  const [page, health, config, api] = await Promise.all([
    fetch(`${baseUrl}/`),
    fetch(`${baseUrl}/healthz`),
    fetch(`${baseUrl}/api/config`),
    fetch(`${baseUrl}/api`)
  ]);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Live Draft Board/);
  assert.match(page.headers.get('content-security-policy'), /img-src 'self' https:/);
  assert.deepEqual(await health.json(), { status: 'ok' });
  assert.deepEqual(await config.json(), { defaultMode: 'demo', liveAvailable: false });
  assert.equal((await api.json()).authentication, 'none');
});

test('serves drafted players grouped by round', async () => {
  const [allResponse, firstResponse, missingResponse, invalidResponse] = await Promise.all([
    fetch(`${baseUrl}/api/rounds`),
    fetch(`${baseUrl}/api/rounds/1`),
    fetch(`${baseUrl}/api/rounds/3`),
    fetch(`${baseUrl}/api/rounds/all`)
  ]);

  assert.equal(allResponse.status, 200);
  const all = await allResponse.json();
  assert.equal(all.league.name, 'Test');
  assert.equal(all.rounds.length, 2);
  assert.equal(all.rounds[0].picks[0].player.position, 'RB');
  assert.equal(all.rounds[0].picks[0].team.name, 'Alpha');
  assert.deepEqual(all.rounds[1], { number: 2, picks: [] });

  assert.equal(firstResponse.status, 200);
  assert.equal((await firstResponse.json()).round.number, 1);
  assert.equal(missingResponse.status, 404);
  assert.deepEqual(await missingResponse.json(), { error: 'Round not found.' });
  assert.equal(invalidResponse.status, 400);
  assert.deepEqual(await invalidResponse.json(), {
    error: 'Round must be a positive integer.'
  });
});

test('rejects unknown files and methods', async () => {
  const [missing, post] = await Promise.all([
    fetch(`${baseUrl}/secret.txt`),
    fetch(`${baseUrl}/api/draft`, { method: 'POST' })
  ]);
  assert.equal(missing.status, 404);
  assert.equal(post.status, 405);
});

test('streams backend snapshots as server-sent events', async () => {
  let publish;
  let publishError;
  const service = {
    snapshot: async () => ({}),
    subscribe(listener) {
      publish = listener;
      return () => {};
    },
    subscribeErrors(listener) {
      publishError = listener;
      return () => {};
    }
  };
  const streamingServer = createApp({ demo: service, live: null });
  await new Promise((resolve) => streamingServer.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${streamingServer.address().port}/api/events`;
  const response = await fetch(url);
  const reader = response.body.getReader();

  assert.match(response.headers.get('content-type'), /^text\/event-stream/);
  publish({ updatedAt: '2026-08-29T00:00:00.000Z', picks: [] });
  const first = new TextDecoder().decode((await reader.read()).value);
  const second = new TextDecoder().decode((await reader.read()).value);
  assert.match(first + second, /event: draft/);
  assert.match(first + second, /"picks":\[\]/);

  publishError({ message: 'ESPN unavailable' });
  const third = new TextDecoder().decode((await reader.read()).value);
  assert.match(third, /event: draft-error/);
  assert.match(third, /ESPN unavailable/);

  await reader.cancel();
  await new Promise((resolve) => streamingServer.close(resolve));
});

test('rejects live mode when ESPN is not configured', async () => {
  const response = await fetch(`${baseUrl}/api/draft?mode=live`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'Live mode requires ESPN league configuration.'
  });
});

test('selects demo and live data sources independently', async () => {
  const modeServer = createApp({
    demo: { snapshot: async () => ({ league: { name: 'Demo' } }) },
    live: { snapshot: async () => ({ league: { name: 'Live' } }) }
  }, { defaultMode: 'live' });
  await new Promise((resolve) => modeServer.listen(0, '127.0.0.1', resolve));
  const modeUrl = `http://127.0.0.1:${modeServer.address().port}`;

  const [config, defaultDraft, demoDraft] = await Promise.all([
    fetch(`${modeUrl}/api/config`),
    fetch(`${modeUrl}/api/draft`),
    fetch(`${modeUrl}/api/draft?mode=demo`)
  ]);

  assert.deepEqual(await config.json(), { defaultMode: 'live', liveAvailable: true });
  assert.equal((await defaultDraft.json()).league.name, 'Live');
  assert.equal((await demoDraft.json()).league.name, 'Demo');
  await new Promise((resolve) => modeServer.close(resolve));
});

test('answers a malformed request target without crashing', async () => {
  const raw = await new Promise((resolve, reject) => {
    const socket = connect(server.address().port, '127.0.0.1', () => {
      socket.write('GET http://[ HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n');
    });
    socket.setTimeout(2_000, () => reject(new Error('timed out')));
    socket.on('data', (chunk) => { socket.destroy(); resolve(chunk.toString()); });
    socket.on('error', reject);
  });

  assert.match(raw, /^HTTP\/1\.1 400 /);
  assert.equal((await fetch(`${baseUrl}/healthz`)).status, 200);
});
