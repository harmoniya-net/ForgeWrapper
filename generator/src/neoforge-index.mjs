/**
 * Publishes a document for every NeoForge build, under `public/neoforge`.
 *
 * NeoForge is one era, not four: every build it has ever published is a
 * processor install. So this is the Forge generator with the era machinery
 * gone — the same document, from the same installer, through the same
 * `processorDocument`.
 *
 * The one structural difference is that the Minecraft version is not known
 * until the installer is read. Forge's maven publishes `{ mc: [builds] }`;
 * NeoForge publishes a flat list, and the build id encodes the Minecraft
 * version only for the families that happened to. So the grouping falls out of
 * the sweep rather than framing it, and a cold run reads every installer.
 */
import fs from 'node:fs';
import path from 'node:path';
import CONFIG, { WRAPPER } from './config.mjs';
import { detectEra, ERA } from './era.mjs';
import { loadArtifactCache, saveArtifactCache } from './artifacts.mjs';
import { processorDocument } from './document.mjs';
import { buildIndexEntry } from './index-entry.mjs';
import { knowsVersion, loadMojang, saveMojang } from './mojang.mjs';
import { fetchDocuments, fetchVersions, installerLibrary, isPrerelease, minecraftVersionOf } from './neoforge.mjs';
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
const site = `${CONFIG.SITE}/neoforge`;

loadArtifactCache();
await loadMojang();

const versions = options.only ? [options.only] : await fetchVersions();
const skipped = [];

/** Reads a build far enough to know what it targets, or why it cannot be published. */
async function resolve(version) {
    try {
        const documents = await fetchDocuments(version);
        if (!documents.installProfile || !documents.versionJson) throw new Error('installer carries no documents');

        const era = detectEra(documents.installProfile);
        // Nothing here handles another era, and silently writing a document
        // that skips the processors would be worse than not writing one.
        if (era !== ERA.PROCESSOR) throw new Error(`unexpected era: ${era}`);

        const mc = minecraftVersionOf(documents);
        if (!mc) throw new Error('installer names no Minecraft version');
        // A build for a Minecraft version Mojang no longer publishes cannot
        // inherit from anything, so there is nothing honest to write for it.
        if (!knowsVersion(mc)) throw new Error(`Mojang does not publish ${mc}`);

        return { version, mc, documents };
    } catch (error) {
        skipped.push({ version, reason: error.message });
        return null;
    }
}

const resolved = (await mapLimit(versions, CONFIG.CONCURRENCY, resolve)).filter(Boolean);

const byMinecraft = new Map();
for (const build of resolved) {
    if (options.mc && build.mc !== options.mc) continue;
    if (!byMinecraft.has(build.mc)) byMinecraft.set(build.mc, []);
    byMinecraft.get(build.mc).push(build);
}

const index = {};

for (const [mc, builds] of byMinecraft) {
    const written = await mapLimit(builds, CONFIG.CONCURRENCY, async build => {
        try {
            const installer = await installerLibrary(build.version);
            if (!installer) throw new Error('installer is not reachable');

            const document = await processorDocument({
                source: build.documents.versionJson,
                mc,
                installer,
                id: `neoforge-${build.version}`,
            });
            writeJson(path.join(CONFIG.NEOFORGE_DIR, 'versions', mc, `${build.version}.json`), document);
            return build.version;
        } catch (error) {
            skipped.push({ version: build.version, reason: error.message });
            return null;
        }
    });

    const ids = written.filter(Boolean);
    if (ids.length === 0) continue;

    // No promotions endpoint: the newest build is `latest`, and the newest one
    // NeoForge did not mark a prerelease is `recommended`.
    const entry = buildIndexEntry({
        site,
        mc,
        ids,
        key: 'neoforge',
        recommended: ids.filter(id => !isPrerelease(id)).at(-1) ?? null,
    });
    index[mc] = entry;

    // GitHub Pages serves files, not redirects, so an alias has to be a file.
    // Not on an `--only` run: one build is not evidence about which is newest,
    // and writing the aliases from it would promote whatever was asked for.
    for (const kind of ['latest', 'recommended', 'best']) {
        if (options.only) break;
        const id = entry[kind];
        if (!id) continue;
        const from = path.join(CONFIG.NEOFORGE_DIR, 'versions', mc, `${id}.json`);
        fs.copyFileSync(from, path.join(CONFIG.NEOFORGE_DIR, 'versions', mc, `${kind}.json`));
    }

    console.error(`[${mc}] ${ids.length}/${builds.length} builds`);
}

ensureDir(CONFIG.NEOFORGE_DIR);
// A sliced run knows about one Minecraft version, so writing the index from it
// would replace a complete one with a nearly empty one.
if (options.mc || options.only) {
    console.error('[Slice] Wrote documents only; index.json left as it was');
} else {
    writeJson(path.join(CONFIG.NEOFORGE_DIR, 'index.json'), {
        wrapper: { tag: WRAPPER.tag, mainClass: WRAPPER.mainClass },
        generated: new Date().toISOString(),
        versions: index,
    });
    writeJson(path.join(CONFIG.NEOFORGE_DIR, 'skipped.json'), skipped);
}

saveArtifactCache();
saveMojang();

const total = Object.values(index).reduce((sum, v) => sum + v.builds.length, 0);
console.error(`[Done] ${total} builds across ${Object.keys(index).length} Minecraft versions, ${skipped.length} skipped`);
