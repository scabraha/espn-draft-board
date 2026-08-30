import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DemoDraftService } from '../src/services/demo-draft-service.js';

test('advances and loops through a demo snake draft', () => {
  let now = 0;
  const service = new DemoDraftService(
    { season: 2026, demoPickIntervalMs: 5_000, pollIntervalMs: 1_000 },
    { now: () => now }
  );

  const opening = service.snapshot();
  assert.equal(opening.status, 'in_progress');
  assert.equal(opening.league.type, 'SNAKE');
  assert.equal(opening.league.rounds, 16);
  assert.equal(opening.league.teamCount, 12);
  assert.equal(opening.teams.length, 12);
  assert.equal(opening.picks.length, 0);
  assert.equal(opening.upcoming[0].team.id, 1);

  now = 60_000;
  const snakeTurn = service.snapshot();
  assert.equal(snakeTurn.picks.length, 12);
  assert.equal(snakeTurn.upcoming[0].team.id, 12);
  assert.equal(snakeTurn.upcoming[1].team.id, 11);

  now = 960_000;
  assert.equal(service.snapshot().status, 'complete');

  now = 970_000;
  const restarted = service.snapshot();
  assert.equal(restarted.status, 'in_progress');
  assert.equal(restarted.picks.length, 0);
  assert.equal(restarted.upcoming[0].team.id, 1);
});
