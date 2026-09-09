import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectEra, ERA } from '../src/era.mjs';

test('no install profile at all is the ancient era', () => {
    assert.equal(detectEra(null), ERA.ANCIENT);
});

test('a versionInfo profile asking for stripMeta is the jarmod era', () => {
    assert.equal(detectEra({ versionInfo: {}, install: { stripMeta: true } }), ERA.JARMOD);
});

test('a versionInfo profile without it is the legacy era', () => {
    assert.equal(detectEra({ versionInfo: {}, install: {} }), ERA.LEGACY);
});

test('a spec profile with processors is the processor era', () => {
    assert.equal(detectEra({ spec: 1, processors: [{ jar: 'x' }] }), ERA.PROCESSOR);
});

test("a spec profile with no processors is legacy, not processor", () => {
    // 1.12.2's last builds were backported onto the new installer format and
    // carry an empty processor list. Reading `spec` as the era gets them wrong.
    assert.equal(detectEra({ spec: 0, processors: [] }), ERA.LEGACY);
});
