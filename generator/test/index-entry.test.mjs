import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildIndexEntry, forgePromotions } from '../src/index-entry.mjs';

const SITE = 'https://example.test/ForgeWrapper';

const forgeEntry = ({ mc, forgeIds, promos }) =>
    buildIndexEntry({ site: SITE, mc, ids: forgeIds, ...forgePromotions({ mc, forgeIds, promos }) });

test('resolves both promotions and gives every build a url', () => {
    const entry = forgeEntry({
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
    const entry = forgeEntry({
        mc: '1.7.10',
        forgeIds: ['1.7.10-10.13.4.1558-1.7.10', '1.7.10-10.13.4.1614-1.7.10'],
        promos: { '1.7.10-recommended': '10.13.4.1614' },
    });
    assert.equal(entry.recommended, '1.7.10-10.13.4.1614-1.7.10');
});

test('does not let a promotion tag match a longer version', () => {
    // A substring search for `-1.0` finds `1.1-1.0.1` first; Forge promoted 1.0.
    const entry = forgeEntry({ mc: '1.1', forgeIds: ['1.1-1.0.1', '1.1-1.0'], promos: { '1.1-recommended': '1.0' } });
    assert.equal(entry.recommended, '1.1-1.0');
});

test('falls back to the newest build when nothing is promoted latest', () => {
    const entry = forgeEntry({ mc: '1.5.2', forgeIds: ['a-1', 'a-2'], promos: {} });
    assert.equal(entry.latest, 'a-2');
    assert.equal(entry.recommended, null);
    assert.equal(entry.recommendedUrl, null);
    assert.equal(entry.best, 'a-2');
});

test('publishes no era, so nothing downstream can branch on one', () => {
    const entry = forgeEntry({ mc: '1.1', forgeIds: ['1.1-1.0'], promos: {} });
    assert.deepEqual(Object.keys(entry.builds[0]), ['forge', 'url']);
});

test('takes latest and recommended from the caller, whatever decided them', () => {
    // NeoForge has no promotions endpoint, so its entrypoint passes the picks
    // in directly. Same file either way.
    const entry = buildIndexEntry({
        site: `${SITE}/neoforge`,
        mc: '1.21.1',
        ids: ['21.1.170', '21.1.172', '21.1.173-beta'],
        key: 'neoforge',
        recommended: '21.1.172',
    });
    assert.deepEqual(entry.builds.at(0), {
        neoforge: '21.1.170',
        url: `${SITE}/neoforge/versions/1.21.1/21.1.170.json`,
    });
    assert.equal(entry.latest, '21.1.173-beta');
    assert.equal(entry.recommended, '21.1.172');
    assert.equal(entry.best, '21.1.172');
    assert.equal(entry.bestUrl, `${SITE}/neoforge/versions/1.21.1/21.1.172.json`);
});
