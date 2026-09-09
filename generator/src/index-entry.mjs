import { forgeVersionOf } from './version.mjs';

export const documentUrl = (site, mc, id) => `${site}/versions/${mc}/${id}.json`;

/**
 * One Minecraft version's entry in an index.
 *
 * The era a build belongs to is deliberately absent. Nothing downstream is
 * meant to branch on it — that is the entire point of publishing one document
 * shape for all four — and a field in the index is an invitation to.
 *
 * `latest` and `recommended` are decided by the caller, because the two
 * families decide them differently: Forge publishes promotions, NeoForge marks
 * a prerelease in the version string. Everything after that is the same file.
 *
 * `key` names the build id in each entry — `forge` in Forge's index, which
 * `@opys/forge` has read since 0.1.x and which therefore cannot change, and
 * `neoforge` in NeoForge's, which nothing has read yet and so gets the right
 * word from the start.
 */
export function buildIndexEntry({ site, mc, ids, key = 'forge', latest = null, recommended = null }) {
    const newest = latest ?? ids.at(-1) ?? null;
    const best = recommended ?? newest;
    const url = id => (id ? documentUrl(site, mc, id) : null);

    return {
        latest: newest,
        latestUrl: url(newest),
        recommended,
        recommendedUrl: url(recommended),
        best,
        bestUrl: url(best),
        builds: ids.map(id => ({ [key]: id, url: documentUrl(site, mc, id) })),
    };
}

/**
 * Forge promotes by its own version, which is not the build id: 1.7.10 repeats
 * the Minecraft version at both ends. Comparing the extracted version rather
 * than searching the id keeps `1.0` from matching `1.0.1`.
 */
export function forgePromotions({ mc, forgeIds, promos }) {
    const pick = kind => {
        const tag = promos[`${mc}-${kind}`];
        if (!tag) return null;
        return forgeIds.find(forgeId => forgeVersionOf(forgeId, mc) === tag) ?? null;
    };
    return { latest: pick('latest'), recommended: pick('recommended') };
}
