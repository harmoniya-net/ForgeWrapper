import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildIndexEntry } from '../src/index-entry.mjs';

const SITE = 'https://example.test/ForgeWrapper';

test('resolves both promotions and gives every build a url', () => {
    const entry = buildIndexEntry({
        site: SITE,
        mc: '1.20.1',
        forgeIds: ['1.20.1-47.1.0', '1.20.1-47.4.10', '1.20.1-47.4.23'],
        promos: { '1.20.1-recommended': '47.4.10', '1.20.1-latest': '47.4.23' },
    });
    assert.equal(entry.recommended, '1.20.1-47.4.10');
    assert.equal(entry.recommendedUrl, `${SITE}/versions/1.20.1/1.20.1-47.4.10.json`);
    assert.equal(entry.latest, '1.20.1-47.4.23');
    assert.equal(entry.best, '1.20.1-47.4.10');
    assert.equal(entry.bestUrl, entry.recommendedUrl);
    assert.deepEqual(entry.builds.at(0), {
        forge: '1.20.1-47.1.0',
        url: `${SITE}/versions/1.20.1/1.20.1-47.1.0.json`,
    });
});

test('matches a promotion through the doubled version suffix of the 1.7.10 era', () => {
    const entry = buildIndexEntry({
        site: SITE,
        mc: '1.7.10',
        forgeIds: ['1.7.10-10.13.4.1558-1.7.10', '1.7.10-10.13.4.1614-1.7.10'],
        promos: { '1.7.10-recommended': '10.13.4.1614' },
    });
    assert.equal(entry.recommended, '1.7.10-10.13.4.1614-1.7.10');
});

test('does not let a promotion tag match a longer version', () => {
    // A substring search for `-1.0` finds `1.1-1.0.1` first; Forge promoted 1.0.
    const entry = buildIndexEntry({
        site: SITE,
        mc: '1.1',
        forgeIds: ['1.1-1.0.1', '1.1-1.0'],
        promos: { '1.1-recommended': '1.0' },
    });
    assert.equal(entry.recommended, '1.1-1.0');
});

test('falls back to the newest build when nothing is promoted latest', () => {
    const entry = buildIndexEntry({ site: SITE, mc: '1.5.2', forgeIds: ['a-1', 'a-2'], promos: {} });
    assert.equal(entry.latest, 'a-2');
    assert.equal(entry.recommended, null);
    assert.equal(entry.recommendedUrl, null);
    assert.equal(entry.best, 'a-2');
});

test('publishes no era, so nothing downstream can branch on one', () => {
    const entry = buildIndexEntry({ site: SITE, mc: '1.1', forgeIds: ['1.1-1.0'], promos: {} });
    assert.deepEqual(Object.keys(entry.builds[0]), ['forge', 'url']);
});
