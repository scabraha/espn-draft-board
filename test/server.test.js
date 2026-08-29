import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../src/server.js';

let server;
let baseUrl;

before(async () => {
  server = createApp({ snapshot: async () => ({ league: { name: 'Test' }, picks: [] }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('serves the app and health endpoint', async () => {
  const [page, health] = await Promise.all([
    fetch(`${baseUrl}/`),
    fetch(`${baseUrl}/healthz`)
  ]);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Live Draft Board/);
  assert.deepEqual(await health.json(), { status: 'ok' });
});

test('rejects unknown files and methods', async () => {
  const [missing, post] = await Promise.all([
    fetch(`${baseUrl}/secret.txt`),
    fetch(`${baseUrl}/api/draft`, { method: 'POST' })
  ]);
  assert.equal(missing.status, 404);
  assert.equal(post.status, 405);
});
