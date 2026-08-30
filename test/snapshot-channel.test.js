import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SnapshotChannel } from '../src/utils/snapshot-channel.js';

test('does not deliver a queued snapshot after unsubscribe', async () => {
  let deliveries = 0;
  const channel = new SnapshotChannel(() => ({ status: 'current' }));
  const unsubscribe = channel.subscribe(() => { deliveries += 1; });

  unsubscribe();
  await Promise.resolve();

  assert.equal(deliveries, 0);
});

test('delivers a snapshot to every listener when one throws', () => {
  const delivered = [];
  const channel = new SnapshotChannel(() => null);
  channel.subscribe(() => { throw new Error('socket closed'); });
  channel.subscribe((snapshot) => delivered.push(snapshot));

  channel.publish({ status: 'in_progress' });

  assert.deepEqual(delivered, [{ status: 'in_progress' }]);
});
