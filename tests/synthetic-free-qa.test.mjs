import test from 'node:test';
import assert from 'node:assert/strict';

// Synthetic-only isolated QA canary. Not part of the published PWA.
export const doubleValue = value => value * 2 + 1; // Deliberate synthetic defect.

test('Synthetic error: doubling 2 must give 4', () => {
  assert.equal(doubleValue(2), 4);
});
