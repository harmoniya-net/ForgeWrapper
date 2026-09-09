import fs from 'node:fs';
import path from 'node:path';
import CONFIG, { WRAPPER } from './config.mjs';
import { detectEra, ERA } from './era.mjs';
import { loadArtifactCache, saveArtifactCache } from './artifacts.mjs';
import { fetchBuilds, fetchClassifiers, fetchDocuments, fetchPromotions, loadForgeCache, saveForgeCache } from './forge.mjs';
import { knowsVersion, loadMojang, saveMojang, vanillaVersion } from './mojang.mjs';
import { buildVersionJson } from './version.mjs';
import { ensureDir, mapLimit, writeJson } from './utils.mjs';

function parseArgs(argv) {
    const options = { mc: null, only: null };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--mc') options.mc = argv[++i];
        else if (argv[i] === '--only') options.only = argv[++i];
        else throw new Error(`Unknown argument: ${argv[i]}`);
    }
    return options;
}

const options = parseArgs(process.argv.slice(2));

loadForgeCache();
loadArtifactCache();
await loadMojang();

const [builds, promos] = await Promise.all([fetchBuilds(), fetchPromotions()]);

const minecraftVersions = Object.keys(builds).filter(mc => {
    if (options.mc && mc !== options.mc) return false;
    if (options.only && !builds[mc].includes(options.only)) return false;
    // A Forge build for a Minecraft version Mojang no longer publishes cannot
    // inherit from anything, so there is nothing honest to write for it.
    return knowsVersion(mc);
});

const skipped = [];
const index = {};

for (const mc of minecraftVersions) {
    const forgeIds = options.only ? [options.only] : builds[mc];
    const vanilla = await vanillaVersion(mc);
    const vanillaLibraries = vanilla?.libraries ?? [];

    const written = await mapLimit(forgeIds, CONFIG.CONCURRENCY, async forgeId => {
        try {
            const classifiers = await fetchClassifiers(forgeId);
            if (!classifiers) throw new Error('no metadata');

            const documents = await fetchDocuments(forgeId, classifiers);
            const era = detectEra(documents.installProfile);
            if (era === ERA.ANCIENT && !classifiers.universal && !classifiers.client) {
                throw new Error('no installer and no overlay archive');
            }

            const document = await buildVersionJson({ forgeId, mc, era, documents, classifiers, vanillaLibraries });
            writeJson(path.join(CONFIG.PUBLIC_DIR, 'versions', mc, `${forgeId}.json`), document);
            return { forgeId, era };
        } catch (error) {
            skipped.push({ forgeId, reason: error.message });
            return null;
        }
    });

    const list = written.filter(Boolean);
    if (list.length === 0) continue;

    const pick = kind => {
        const tag = promos[`${mc}-${kind}`];
        return tag ? (list.find(b => b.forgeId.endsWith(tag) || b.forgeId.includes(`-${tag}`))?.forgeId ?? null) : null;
    };
    const latest = pick('latest') ?? list.at(-1).forgeId;
    const recommended = pick('recommended');

    index[mc] = {
        latest,
        recommended,
        best: recommended ?? latest,
        builds: list.map(b => ({ forge: b.forgeId, era: b.era })),
    };

    // GitHub Pages serves files, not redirects, so an alias has to be a file.
    for (const [kind, forgeId] of Object.entries({ latest, recommended, best: recommended ?? latest })) {
        if (!forgeId) continue;
        const from = path.join(CONFIG.PUBLIC_DIR, 'versions', mc, `${forgeId}.json`);
        fs.copyFileSync(from, path.join(CONFIG.PUBLIC_DIR, 'versions', mc, `${kind}.json`));
    }

    console.error(`[${mc}] ${list.length}/${forgeIds.length} builds`);
}

ensureDir(CONFIG.PUBLIC_DIR);
// A sliced run knows about one Minecraft version, so writing the index from it
// would replace a complete one with a nearly empty one.
if (options.mc || options.only) {
    console.error('[Slice] Wrote documents only; index.json left as it was');
} else {
    writeJson(path.join(CONFIG.PUBLIC_DIR, 'index.json'), {
        wrapper: { tag: WRAPPER.tag, mainClass: WRAPPER.mainClass },
        generated: new Date().toISOString(),
        versions: index,
    });
    writeJson(path.join(CONFIG.PUBLIC_DIR, 'skipped.json'), skipped);
}

saveForgeCache();
saveArtifactCache();
saveMojang();

const total = Object.values(index).reduce((sum, v) => sum + v.builds.length, 0);
console.error(`[Done] ${total} builds across ${Object.keys(index).length} Minecraft versions, ${skipped.length} skipped`);
