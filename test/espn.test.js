import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DraftService, normalizeLeague } from '../src/espn.js';

const league = {
  id: 42,
  seasonId: 2026,
  settings: {
    name: 'Test League',
    draftSettings: {
      type: 'SNAKE',
      timePerSelection: 60,
      pickOrder: [1, 2],
      rounds: 2
    }
  },
  teams: [
    { id: 1, location: 'Alpha', nickname: 'Team', abbrev: 'ALP', logo: 'https://example.com/alpha.png' },
    { id: 2, location: 'Beta', nickname: 'Team', abbrev: 'BET' }
  ],
  draftDetail: {
    inProgress: true,
    drafted: false,
    picks: [
      { overallPickNumber: 1, roundId: 1, roundPickNumber: 1, teamId: 1, playerId: 100 },
      { overallPickNumber: 2, roundId: 1, roundPickNumber: 2, teamId: 2, playerId: -1 },
      { overallPickNumber: 3, roundId: 2, roundPickNumber: 1, teamId: 2, playerId: -1 },
      { overallPickNumber: 4, roundId: 2, roundPickNumber: 2, teamId: 1, playerId: -1 }
    ]
  }
};

test('normalizes completed and upcoming picks without exposing ESPN data', () => {
  const players = new Map([[100, { id: 100, name: 'Ada Runner', position: 'RB', proTeam: 'BUF' }]]);
  const result = normalizeLeague(league, players, { startedAt: 1_000 }, 6_000);

  assert.equal(result.picks[0].player.name, 'Ada Runner');
  assert.equal(result.upcoming[0].team.name, 'Beta Team');
  assert.equal(result.upcoming[1].team.name, 'Beta Team');
  assert.equal(result.draftSlots.length, 4);
  assert.equal(result.draftSlots[3].team.name, 'Alpha Team');
  assert.equal(result.draftSlots[3].team.logo, 'https://example.com/alpha.png');
  assert.equal(result.upcoming[0].team.logo, null);
  assert.equal(result.clock.remainingSeconds, 55);
  assert.equal(result.status, 'in_progress');
  assert.equal(result.league.rounds, 2);
  assert.equal(result.league.teamCount, 2);
  assert.equal('settings' in result, false);
});

test('draft service caches upstream requests and resets the clock on a pick', async () => {
  let now = 1_000;
  let calls = 0;
  const playerRequests = [];
  const currentLeague = structuredClone(league);
  const service = new DraftService(
    { pollIntervalMs: 2_000 },
    {
      now: () => now,
      fetchLeague: async () => { calls += 1; return currentLeague; },
      fetchPlayers: async (_config, ids) => {
        playerRequests.push(ids);
        return new Map(ids.map((id) => [id, { id, name: `Player ${id}` }]));
      }
    }
  );

  await service.snapshot();
  now = 2_000;
  await service.snapshot();
  assert.equal(calls, 1);

  currentLeague.draftDetail.picks[1].playerId = 101;
  now = 4_000;
  const result = await service.snapshot();
  assert.equal(calls, 2);
  assert.equal(result.clock.expiresAt, 64_000);
  assert.deepEqual(playerRequests, [[100], [101]]);
});

test('resets the clock when a waiting draft starts', async () => {
  let now = 1_000;
  const currentLeague = structuredClone(league);
  currentLeague.draftDetail.inProgress = false;
  currentLeague.draftDetail.picks[0].playerId = -1;
  const service = new DraftService(
    { pollIntervalMs: 1_000 },
    {
      now: () => now,
      fetchLeague: async () => currentLeague,
      fetchPlayers: async () => new Map()
    }
  );

  await service.snapshot();
  currentLeague.draftDetail.inProgress = true;
  now = 121_000;
  const result = await service.snapshot();
  assert.equal(result.clock.remainingSeconds, 60);
});

test('freezes and resumes the estimated clock when a draft pauses', async () => {
  let now = 1_000;
  const currentLeague = structuredClone(league);
  const service = new DraftService(
    { pollIntervalMs: 1_000 },
    {
      now: () => now,
      fetchLeague: async () => currentLeague,
      fetchPlayers: async () => new Map()
    }
  );

  await service.snapshot();
  now = 21_000;
  currentLeague.draftDetail.inProgress = false;
  const paused = await service.snapshot();
  assert.equal(paused.status, 'paused');
  assert.equal(paused.clock.state, 'paused');
  assert.equal(paused.clock.remainingSeconds, 40);

  now = 51_000;
  currentLeague.draftDetail.inProgress = true;
  const resumed = await service.snapshot();
  assert.equal(resumed.status, 'in_progress');
  assert.equal(resumed.clock.remainingSeconds, 40);
});

test('treats negative defense IDs as completed picks', () => {
  const withDefense = structuredClone(league);
  withDefense.draftDetail.picks[0].playerId = -16033;
  const result = normalizeLeague(
    withDefense,
    new Map([[-16033, { id: -16033, name: 'Baltimore D/ST', position: 'D/ST', proTeam: 'BAL' }]]),
    { startedAt: 0 },
    0
  );

  assert.equal(result.picks[0].player.name, 'Baltimore D/ST');
  assert.equal(result.upcoming[0].overall, 2);
});

test('generates snake slots when ESPN only returns settings', () => {
  const withoutSlots = structuredClone(league);
  withoutSlots.draftDetail.picks = [];
  withoutSlots.draftDetail.inProgress = false;
  const result = normalizeLeague(withoutSlots, new Map(), { startedAt: 0 }, 0);

  assert.deepEqual(result.upcoming.map((pick) => pick.team.id), [1, 2, 2]);
  assert.equal(result.status, 'waiting');
});

test('backend polling publishes refreshed snapshots', async () => {
  let refreshes = 0;
  let published;
  const service = new DraftService(
    { pollIntervalMs: 10_000 },
    {
      now: () => 1_000,
      fetchLeague: async () => {
        refreshes += 1;
        return league;
      },
      fetchPlayers: async () => new Map()
    }
  );
  const update = new Promise((resolve) => {
    service.subscribe((snapshot) => {
      published = snapshot;
      resolve();
    });
  });

  service.start();
  await update;
  service.stop();

  assert.equal(refreshes, 1);
  assert.equal(published.league.name, 'Test League');
});

test('backend polling publishes ESPN refresh errors', async () => {
  const service = new DraftService(
    { pollIntervalMs: 10_000 },
    { fetchLeague: async () => { throw new Error('ESPN unavailable'); } }
  );
  const failure = new Promise((resolve) => service.subscribeError(resolve));

  service.start();
  assert.equal(await failure, 'ESPN unavailable');
  service.stop();
});
