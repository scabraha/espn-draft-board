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
    { id: 1, location: 'Alpha', nickname: 'Team', abbrev: 'ALP' },
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
  assert.equal(result.clock.remainingSeconds, 55);
  assert.equal(result.status, 'in_progress');
  assert.equal('settings' in result, false);
});

test('draft service caches upstream requests and resets the clock on a pick', async () => {
  let now = 1_000;
  let calls = 0;
  const currentLeague = structuredClone(league);
  const service = new DraftService(
    { pollIntervalMs: 2_000 },
    {
      now: () => now,
      fetchLeague: async () => { calls += 1; return currentLeague; },
      fetchPlayers: async () => new Map()
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
});

test('generates snake slots when ESPN only returns settings', () => {
  const withoutSlots = structuredClone(league);
  withoutSlots.draftDetail.picks = [];
  withoutSlots.draftDetail.inProgress = false;
  const result = normalizeLeague(withoutSlots, new Map(), { startedAt: 0 }, 0);

  assert.deepEqual(result.upcoming.map((pick) => pick.team.id), [1, 2, 2]);
  assert.equal(result.status, 'waiting');
});
