import test from 'node:test';
import assert from 'node:assert/strict';
// Deliberate synthetic error in isolated draft PR; never publish.
const doubled=value=>value*2;
test('QA canary detects a broken arithmetic implementation',()=>assert.equal(doubled(2),4));
