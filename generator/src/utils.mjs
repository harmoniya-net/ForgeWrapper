import fs from 'node:fs';
import path from 'node:path';

export function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

export function writeJson(file, value) {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

export function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Forge's API and maven are behind Cloudflare and rate-limit under the fan-out
 * this generator produces. A 429 or a 5xx is a "later", not an answer.
 */
export async function fetchWithRetry(url, init = {}, attempts = 4) {
    let last;
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            const response = await fetch(url, init);
            if (response.status !== 429 && response.status < 500) return response;
            last = new Error(`GET ${url} -> ${response.status} ${response.statusText}`);
        } catch (error) {
            last = error;
        }
        await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
    }
    throw last;
}

export async function fetchJson(url) {
    const response = await fetchWithRetry(url);
    if (!response.ok) throw new Error(`GET ${url} -> ${response.status} ${response.statusText}`);
    return response.json();
}

/** Runs `task` over `items` with a fixed number of workers, preserving order. */
export async function mapLimit(items, limit, task) {
    const results = new Array(items.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const index = cursor++;
            results[index] = await task(items[index], index);
        }
    });
    await Promise.all(workers);
    return results;
}
