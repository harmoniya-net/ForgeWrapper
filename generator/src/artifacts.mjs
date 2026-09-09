import crypto from 'node:crypto';
import CONFIG from './config.mjs';
import { createCache } from './cache.mjs';
import { fetchWithRetry } from './utils.mjs';

const cache = createCache(CONFIG.ARTIFACT_CACHE);

export const MOJANG_LIBRARIES = 'https://libraries.minecraft.net';

export function loadArtifactCache() {
    cache.load();
}

export function saveArtifactCache() {
    cache.save();
}

async function sidecarSha1(url) {
    const response = await fetchWithRetry(`${url}.sha1`);
    if (!response.ok) return null;
    const body = (await response.text()).trim();
    // Reposilite answers a miss with an HTML page, not a 404 body worth trusting.
    return /^[0-9a-f]{40}$/i.test(body) ? body.toLowerCase() : null;
}

async function resolveOne(url) {
    const head = await fetchWithRetry(url, { method: 'HEAD' });
    if (!head.ok) return null;

    const size = Number(head.headers.get('content-length'));
    const sha1 = await sidecarSha1(url);
    if (sha1 && Number.isFinite(size) && size > 0) return { url, sha1, size };

    // No usable sidecar. These are small — a jar, not a game — so hashing it is
    // cheaper than shipping a library entry a strict parser will reject.
    const response = await fetchWithRetry(url);
    if (!response.ok) return null;
    const body = Buffer.from(await response.arrayBuffer());
    return { url, sha1: crypto.createHash('sha1').update(body).digest('hex'), size: body.length };
}

/**
 * Resolves the first candidate URL that exists, to `{ url, sha1, size }`.
 *
 * Pre-1.13 Forge names its libraries by coordinate and leaves the repository
 * implicit, and the artifacts have since moved between Mojang's and Forge's
 * mavens, so a coordinate is a question with several possible answers rather
 * than an address. Only an answer is cached — a miss may be a rate limit, and
 * caching one would bake a hole into every later run.
 */
export async function resolveArtifact(candidates) {
    const key = candidates.join('|');
    const cached = cache.get(key);
    if (cached) return cached;

    for (const url of candidates) {
        const resolved = await resolveOne(url);
        if (resolved) return cache.set(key, resolved);
    }
    return null;
}
