import assert from 'node:assert/strict';
import test from 'node:test';
import { argumentLocations, functionAbis } from '../public/abi-explorer.mjs';

test('scalar stack arguments start after the x86-64 return address and applicable shadow space', () => {
  assert.deepEqual(argumentLocations(functionAbis.sysv, 8),
    ['rdi', 'rsi', 'rdx', 'rcx', 'r8', 'r9', '[rsp + 8]', '[rsp + 16]']);
  assert.deepEqual(argumentLocations(functionAbis.windows, 6),
    ['rcx', 'rdx', 'r8', 'r9', '[rsp + 40]', '[rsp + 48]']);
  assert.deepEqual(argumentLocations(functionAbis.windows, 0), []);
});

test('AAPCS64 uses eight integer registers before the first entry stack slot', () => {
  assert.deepEqual(argumentLocations(functionAbis.aapcs64, 10),
    ['x0', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', '[sp]', '[sp + 8]']);
});
