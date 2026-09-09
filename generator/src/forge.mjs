import fs from 'node:fs';
import path from 'node:path';
import CONFIG from './config.mjs';
import { createCache } from './cache.mjs';
import { fetchJson, readJson, writeJson } from './utils.mjs';
import { readEntries } from './remote-zip.mjs';

const metaCache = createCache(CONFIG.META_CACHE);

export function loadForgeCache() {
    metaCache.load();
}

export function saveForgeCache() {
    metaCache.save();
}

export function artifactUrl(forgeId, classifier, extension) {
    return `${CONFIG.FORGE_MAVEN}/net/minecraftforge/forge/${forgeId}/forge-${forgeId}-${classifier}.${extension}`;
}

/** `{ minecraftVersion: [forgeId, ...] }`, oldest build first, as Forge publishes it. */
export async function fetchBuilds() {
    return fetchJson(`${CONFIG.FORGE_API}/maven-metadata.json`);
}

/** `{ "1.20.1-latest": "47.4.10", ... }` */
export async function fetchPromotions() {
    const { promos } = await fetchJson(`${CONFIG.FORGE_API}/promotions_slim.json`);
    return promos;
}

/**
 * Which files a build published, as `{ classifier: extension }`.
 *
 * This is the only thing that separates the eras cheaply: a build with an
 * installer has documents to read, one with only a `universal` or `client` zip
 * has none and has to be described from the outside.
 */
export async function fetchClassifiers(forgeId) {
    const cached = metaCache.get(forgeId);
    if (cached) return cached;
    try {
        const meta = await fetchJson(`${CONFIG.FORGE_API}/${forgeId}/meta.json`);
        const classifiers = {};
        for (const [classifier, formats] of Object.entries(meta.classifiers ?? {})) {
            classifiers[classifier] = Object.keys(formats)[0];
        }
        return metaCache.set(forgeId, classifiers);
    } catch {
        // A miss here may be a rate limit; leaving it uncached costs one
        // request next run, caching it would drop the build from every run.
        return null;
    }
}

const DOCUMENTS = ['install_profile.json', 'version.json'];

/**
 * The installer's own documents, read over HTTP range requests rather than by
 * downloading the installer — see `remote-zip.mjs` for why that matters at
 * five thousand builds.
 */
export async function fetchDocuments(forgeId, classifiers) {
    const file = path.join(CONFIG.DOCUMENT_CACHE, `${forgeId}.json`);
    if (fs.existsSync(file)) return readJson(file);

    if (!classifiers?.installer) return { installProfile: null, versionJson: null };

    const entries = await readEntries(artifactUrl(forgeId, 'installer', classifiers.installer), DOCUMENTS);
    const parse = name => (entries.has(name) ? JSON.parse(entries.get(name).toString('utf8')) : null);
    const documents = {
        installProfile: parse('install_profile.json'),
        versionJson: parse('version.json'),
    };
    writeJson(file, documents);
    return documents;
}
