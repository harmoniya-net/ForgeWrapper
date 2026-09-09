/**
 * NeoForge's side of the world: a flat list of versions on its own maven, and
 * an installer per version built exactly like Forge's.
 *
 * Two things differ from `forge.mjs`, and both are why the Minecraft version
 * is read out of the installer rather than derived from the build id:
 *
 *  - NeoForge's versions encode the Minecraft version — `21.1.172` is 1.21.1 —
 *    but only for the families that did. `26.2.0.84` carries four components
 *    and targets Minecraft `26.2`, which has no leading `1.` at all. Any regex
 *    over the build id is a guess with an expiry date.
 *  - There is no promotions endpoint. A build is a prerelease exactly when its
 *    version carries a qualifier (`20.4.80-beta`), which is NeoForge's own
 *    published rule.
 */
import fs from 'node:fs';
import path from 'node:path';
import CONFIG from './config.mjs';
import { resolveArtifact } from './artifacts.mjs';
import { library } from './document.mjs';
import { coordPath, parseCoord } from './maven.mjs';
import { readEntries } from './remote-zip.mjs';
import { fetchJson, readJson, writeJson } from './utils.mjs';

export const installerUrl = version =>
    `${CONFIG.NEOFORGE_MAVEN}/net/neoforged/neoforge/${version}/neoforge-${version}-installer.jar`;

export const installerCoord = version => `net.neoforged:neoforge:${version}:installer@jar`;

/** Every published version, oldest first, as the maven lists them. */
export async function fetchVersions() {
    const { versions } = await fetchJson(CONFIG.NEOFORGE_VERSIONS);
    return versions;
}

/** `20.4.80-beta` is a prerelease; `21.1.172` and `26.2.0.84` are not. */
export const isPrerelease = version => version.includes('-');

const DOCUMENTS = ['install_profile.json', 'version.json'];

/**
 * The installer's own documents, read over HTTP range requests rather than by
 * downloading the installer — see `remote-zip.mjs`. NeoForge's maven answers
 * `accept-ranges: bytes` the same way Forge's does.
 */
export async function fetchDocuments(version) {
    const file = path.join(CONFIG.NEOFORGE_DOCUMENT_CACHE, `${version}.json`);
    if (fs.existsSync(file)) return readJson(file);

    const entries = await readEntries(installerUrl(version), DOCUMENTS);
    const parse = name => (entries.has(name) ? JSON.parse(entries.get(name).toString('utf8')) : null);
    const documents = {
        installProfile: parse('install_profile.json'),
        versionJson: parse('version.json'),
    };
    writeJson(file, documents);
    return documents;
}

/**
 * The Minecraft version a build targets, as the build itself states it.
 *
 * `version.json`'s `inheritsFrom` is the authority — it is the field the
 * document will be published with. `install_profile.json`'s `minecraft` says
 * the same thing and stands in if the version document is missing one.
 */
export function minecraftVersionOf(documents) {
    return documents.versionJson?.inheritsFrom ?? documents.installProfile?.minecraft ?? null;
}

/**
 * The installer, as a library entry — the one artifact a processor-era
 * document has to carry that the loader's own version JSON does not list.
 */
export async function installerLibrary(version) {
    const coord = parseCoord(installerCoord(version));
    const resolved = await resolveArtifact([installerUrl(version)]);
    if (!resolved) return null;
    return library(installerCoord(version), {
        path: coordPath(coord),
        url: resolved.url,
        sha1: resolved.sha1,
        size: resolved.size,
    });
}
