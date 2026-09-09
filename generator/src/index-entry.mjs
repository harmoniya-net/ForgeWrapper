import { forgeVersionOf } from './version.mjs';

export const documentUrl = (site, mc, forgeId) => `${site}/versions/${mc}/${forgeId}.json`;

/**
 * One Minecraft version's entry in the index.
 *
 * The era a build belongs to is deliberately absent. Nothing downstream is
 * meant to branch on it — that is the entire point of publishing one document
 * shape for all four — and a field in the index is an invitation to.
 */
export function buildIndexEntry({ site, mc, forgeIds, promos }) {
    // Forge promotes by its own version, which is not the build id: 1.7.10
    // repeats the Minecraft version at both ends. Comparing the extracted
    // version rather than searching the id keeps `1.0` from matching `1.0.1`.
    const pick = kind => {
        const tag = promos[`${mc}-${kind}`];
        if (!tag) return null;
        return forgeIds.find(forgeId => forgeVersionOf(forgeId, mc) === tag) ?? null;
    };

    const latest = pick('latest') ?? forgeIds.at(-1) ?? null;
    const recommended = pick('recommended');
    const best = recommended ?? latest;
    const url = forgeId => (forgeId ? documentUrl(site, mc, forgeId) : null);

    return {
        latest,
        latestUrl: url(latest),
        recommended,
        recommendedUrl: url(recommended),
        best,
        bestUrl: url(best),
        builds: forgeIds.map(forgeId => ({ forge: forgeId, url: documentUrl(site, mc, forgeId) })),
    };
}
