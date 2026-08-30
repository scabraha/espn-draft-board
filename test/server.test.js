import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../src/server.js';

let server;
let baseUrl;

before(async () => {
  const service = { snapshot: async () => ({ league: { name: 'Test' }, picks: [] }) };
  server = createApp({ demo: service, live: null });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('serves the app and health endpoint', async () => {
  const [page, health, config] = await Promise.all([
    fetch(`${baseUrl}/`),
    fetch(`${baseUrl}/healthz`),
    fetch(`${baseUrl}/api/config`)
  ]);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Live Draft Board/);
  assert.match(page.headers.get('content-security-policy'), /img-src 'self' https:/);
  assert.deepEqual(await health.json(), { status: 'ok' });
  assert.deepEqual(await config.json(), { defaultMode: 'demo', liveAvailable: false });
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
