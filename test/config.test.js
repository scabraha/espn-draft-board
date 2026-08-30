import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig, loadPort } from '../src/config.js';

test('defaults to demo-capable configuration without an ESPN league', () => {
  const config = loadConfig({}, 2026);

  assert.equal(config.leagueId, '');
  assert.equal(config.season, 2026);
  assert.equal(config.demoPickIntervalMs, 5_000);
});

test('normalizes ESPN cookies and validates numeric settings', () => {
  const config = loadConfig({
    ESPN_LEAGUE_ID: '12345',
    ESPN_SEASON: '2027',
    ESPN_SWID: '"{abc}"',
    ESPN_S2: "'secret'",
    ESPN_POLL_INTERVAL_MS: '3000',
    ESPN_REQUEST_TIMEOUT_MS: '5000',
    DEMO_PICK_SECONDS: '8'
  }, 2026);

  assert.deepEqual(config, {
    leagueId: '12345',
    season: 2027,
    swid: '{abc}',
    espnS2: 'secret',
    pollIntervalMs: 3000,
    requestTimeoutMs: 5000,
    demoPickIntervalMs: 8_000
  });
  assert.equal(loadPort({ PORT: '8080' }), 8080);
});

test('rejects invalid environment values', () => {
  assert.throws(() => loadConfig({ ESPN_LEAGUE_ID: 'abc' }, 2026), /only digits/);
  assert.throws(() => loadConfig({ DEMO_PICK_SECONDS: '0' }, 2026), /between 1 and 60/);
  assert.throws(() => loadPort({ PORT: '70000' }), /between 1 and 65535/);
});
