import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EspnApi } from '../src/data/espn-api.js';

const config = {
  leagueId: '42',
  season: 2026,
  swid: '{user}',
  espnS2: 'session',
  requestTimeoutMs: 1_000
};

test('fetches league data with ESPN authentication', async () => {
  let request;
  const api = new EspnApi(config, {
    fetch: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ id: 42 }) };
    }
  });

  assert.deepEqual(await api.fetchLeague(), { id: 42 });
  assert.match(request.url, /seasons\/2026\/segments\/0\/leagues\/42/);
  assert.match(request.url, /view=mDraftDetail/);
  assert.equal(request.options.headers.cookie, 'SWID={user}; espn_s2=session');
});

test('fetches and normalizes only requested players', async () => {
  let filter;
  const api = new EspnApi(config, {
    fetch: async (_url, options) => {
      filter = JSON.parse(options.headers['x-fantasy-filter']);
      return {
        ok: true,
        json: async () => [{
          player: {
            id: 100,
            fullName: 'Ada Runner',
            defaultPositionId: 2,
            proTeamId: 2
          }
        }]
      };
    }
  });

  const players = await api.fetchPlayers([100]);
  assert.deepEqual(filter, { players: { filterIds: { value: [100] } } });
  assert.deepEqual(players.get(100), {
    id: 100,
    name: 'Ada Runner',
    position: 'RB',
    proTeam: 'BUF'
  });
  assert.deepEqual(await api.fetchPlayers([]), new Map());
});

test('adds an authentication hint to authorization failures', async () => {
  const api = new EspnApi(config, {
    fetch: async () => ({ ok: false, status: 403 })
  });

  await assert.rejects(
    api.fetchLeague(),
    /ESPN returned HTTP 403\. Check ESPN_SWID and ESPN_S2/
  );
});

test('ignores an unexpected player response shape', async () => {
  const api = new EspnApi(config, {
    fetch: async () => ({ ok: true, json: async () => ({ messages: ['no players'] }) })
  });

  assert.deepEqual(await api.fetchPlayers([100]), new Map());
});
