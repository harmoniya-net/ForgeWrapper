import CONFIG from './config.mjs';
import { createCache } from './cache.mjs';
import { fetchJson } from './utils.mjs';

const cache = createCache(CONFIG.MOJANG_CACHE);
let index = null;

/**
 * The vanilla side of the wall. Only two things are ever needed from it: the
 * main class a pre-1.13 build hands off to, and the client jar's download —
 * both of which the Forge documents of that era simply assume you already know.
 */
export async function loadMojang() {
    cache.load();
    const manifest = await fetchJson(CONFIG.MOJANG_MANIFEST);
    index = new Map(manifest.versions.map(v => [v.id, v.url]));
}

export function saveMojang() {
    cache.save();
}

export function knowsVersion(id) {
    return index.has(id);
}

export async function vanillaVersion(id) {
    const cached = cache.get(id);
    if (cached) return cached;

    const url = index.get(id);
    if (!url) return null;

    const version = await fetchJson(url);
    return cache.set(id, {
        id: version.id,
        mainClass: version.mainClass,
        client: version.downloads?.client ?? null,
        // Names only: all that is ever asked of them is whether a Forge entry
        // restates one or overrides it.
        libraries: (version.libraries ?? []).map(l => ({ name: l.name })),
    });
}
