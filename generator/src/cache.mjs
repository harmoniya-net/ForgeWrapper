import fs from 'node:fs';
import { ensureDir, readJson, writeJson } from './utils.mjs';
import path from 'node:path';

/**
 * A flat JSON file keyed by string. Loaded once, saved once — the point is that
 * a cold run costs thousands of requests and every run after it costs almost
 * none, which is what makes a full sweep a routine job rather than an event.
 */
export function createCache(file) {
    let entries = {};
    let dirty = false;
    return {
        load() {
            if (fs.existsSync(file)) entries = readJson(file);
            return this;
        },
        get(key) {
            return entries[key];
        },
        set(key, value) {
            entries[key] = value;
            dirty = true;
            return value;
        },
        has(key) {
            return Object.hasOwn(entries, key);
        },
        save() {
            if (!dirty) return;
            ensureDir(path.dirname(file));
            // Sorted, so a cache commit is a readable diff rather than a churn
            // of reordered keys.
            writeJson(file, Object.fromEntries(Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : 1))));
            dirty = false;
        },
    };
}
