/**
 * Forge's four install eras, each turned into the one document shape.
 *
 * What a document is made of lives in `document.mjs` and is shared with
 * NeoForge; what is here is Forge's own — the eras, the coordinates it
 * publishes under, and the library entries of the pre-1.13 documents, which
 * name an artifact without saying where it lives.
 */
import CONFIG, { WRAPPER } from './config.mjs';
import { ERA } from './era.mjs';
import { MOJANG_LIBRARIES, resolveArtifact } from './artifacts.mjs';
import { LIB_DIR, clientLibrary, clientPath, library, loggingOf, processorDocument, wrapperLibrary } from './document.mjs';
import { artifactUrl } from './forge.mjs';
import { coordPath, coordUrl, parseCoord, withClassifier } from './maven.mjs';
import { vanillaVersion } from './mojang.mjs';
import { mapLimit } from './utils.mjs';

async function forgeFileLibrary(forgeId, classifier, extension) {
    const coord = parseCoord(`net.minecraftforge:forge:${forgeId}:${classifier}@${extension}`);
    const url = artifactUrl(forgeId, classifier, extension);
    const resolved = await resolveArtifact([url]);
    if (!resolved) return null;
    return library(`net.minecraftforge:forge:${forgeId}:${classifier}@${extension}`, {
        path: coordPath(coord),
        url: resolved.url,
        sha1: resolved.sha1,
        size: resolved.size,
    });
}

/**
 * A pre-1.13 library entry names a coordinate and leaves the repository
 * implicit. Turning it into a modern one means finding where the artifact
 * actually lives now, which is not always where the entry says.
 */
async function resolveLegacyLibrary(entry, forgeId) {
    const coord = parseCoord(entry.name);
    const bases = [entry.url, CONFIG.FORGE_MAVEN, MOJANG_LIBRARIES].filter(Boolean);
    const candidates = bases.map(base => coordUrl(base, coord));
    if (isForgeItself(coord)) {
        // Forge names its own jar by a coordinate that has never existed on
        // maven — `net.minecraftforge:minecraftforge:<version>` before 1.7,
        // `net.minecraftforge:forge:<id>` after. The file is published under
        // the build's `universal` classifier. Keep the declared path, since
        // that is where the rest of the document expects the file to land.
        candidates.push(artifactUrl(forgeId, 'universal', 'jar'), artifactUrl(forgeId, 'universal', 'zip'));
    }
    const artifact = await resolveArtifact(candidates);
    if (!artifact) return null;

    const converted = library(entry.name, { ...artifact, path: coordPath(coord) });
    if (entry.rules) converted.rules = entry.rules;
    if (entry.extract) converted.extract = entry.extract;

    if (entry.natives) {
        const classifiers = {};
        for (const [os, template] of Object.entries(entry.natives)) {
            // Mojang keeps `${arch}` literal in `natives` and lists both widths
            // under `classifiers`; the launcher picks one at launch.
            const names = template.includes('${arch}')
                ? ['32', '64'].map(arch => template.replace('${arch}', arch))
                : [template];
            for (const classifier of names) {
                const nativeCoord = withClassifier(coord, classifier);
                const native = await resolveArtifact(bases.map(base => coordUrl(base, nativeCoord)));
                if (native) classifiers[classifier] = { path: coordPath(nativeCoord), ...native };
            }
        }
        if (Object.keys(classifiers).length > 0) {
            converted.natives = entry.natives;
            converted.downloads.classifiers = classifiers;
        }
    }
    return converted;
}

const isForgeItself = ({ group, artifact }) =>
    group === 'net.minecraftforge' && (artifact === 'forge' || artifact === 'minecraftforge');

const coordKey = name => {
    const { group, artifact, version } = parseCoord(name);
    return `${group}:${artifact}:${version}`;
};

/**
 * Forge's pre-1.13 documents repeat the whole vanilla library set. Under
 * `inheritsFrom` those come back anyway, in Mojang's own modern spelling with
 * working natives — so an entry that only restates one is noise, while an entry
 * that pins a *different* version of it is the point and has to survive.
 */
export function withoutVanillaDuplicates(entries, vanillaLibraries) {
    // Keyed by the full coordinate, not by group:artifact. Vanilla lists two
    // LWJGL versions side by side and picks between them with rules, so a map
    // from group:artifact to one version silently forgets the other.
    const vanilla = new Set(vanillaLibraries.map(l => coordKey(l.name)));
    return entries.filter(entry => {
        try {
            return !vanilla.has(coordKey(entry.name));
        } catch {
            return true;
        }
    });
}

export function forgeVersionOf(forgeId, mc) {
    // `1.7.10-10.13.4.1614-1.7.10` — that era repeated the Minecraft version at
    // both ends.
    return forgeId.replace(new RegExp(`^${mc}-`), '').replace(new RegExp(`-${mc}$`), '');
}

const documentId = (forgeId, mc) => `${mc}-forge-${forgeVersionOf(forgeId, mc)}`;

async function buildProcessor({ forgeId, mc, documents, classifiers }) {
    const source = documents.versionJson;
    if (!source) throw new Error(`Processor build ${forgeId} has no version.json`);

    const installer = await forgeFileLibrary(forgeId, 'installer', classifiers.installer);
    if (!installer) throw new Error(`Processor build ${forgeId} has no reachable installer`);

    return processorDocument({ source, mc, installer, id: documentId(forgeId, mc) });
}

async function buildLegacy({ forgeId, mc, documents, vanillaLibraries }) {
    const source = documents.versionJson ?? documents.installProfile.versionInfo;

    let libraries;
    if (documents.versionJson) {
        // Already modern. The one broken entry is Forge's own jar, which the
        // document addresses without a classifier — a coordinate that has never
        // existed on maven, where the file is published as `-universal`.
        libraries = await mapLimit(source.libraries ?? [], 4, async entry => {
            const artifact = entry.downloads?.artifact;
            if (artifact?.url) return entry;
            const universal = await forgeFileLibrary(forgeId, 'universal', 'jar');
            if (!universal) return null;
            return library(entry.name, { ...universal.downloads.artifact, path: artifact?.path ?? universal.downloads.artifact.path });
        });
    } else {
        const usable = (source.libraries ?? []).filter(entry => entry.clientreq !== false);
        libraries = await mapLimit(withoutVanillaDuplicates(usable, vanillaLibraries), 4, entry => resolveLegacyLibrary(entry, forgeId));
    }

    const document = {
        id: source.id ?? documentId(forgeId, mc),
        inheritsFrom: mc,
        type: source.type ?? 'release',
        time: source.time,
        releaseTime: source.releaseTime,
        ...loggingOf(source.logging),
        mainClass: source.mainClass,
        libraries: libraries.filter(Boolean),
    };
    if (source.minecraftArguments) document.minecraftArguments = source.minecraftArguments;
    if (source.arguments) document.arguments = source.arguments;
    return document;
}

async function buildPatched({ forgeId, mc, era, documents, classifiers, vanillaLibraries }) {
    const versionInfo = documents.installProfile?.versionInfo ?? null;
    const vanilla = await vanillaVersion(mc);
    const handOff = versionInfo?.mainClass ?? vanilla?.mainClass;
    if (!handOff) throw new Error(`No main class for ${forgeId}`);

    const [client, wrapper] = await Promise.all([clientLibrary(mc), wrapperLibrary()]);
    if (!client) throw new Error(`No vanilla client jar for ${mc}`);

    const patched = `${LIB_DIR}/${coordPath(parseCoord(`net.minecraftforge:forge:${forgeId}:patched-client`))}`;
    const jvm = [
        `-Dforgewrapper.mainClass=${handOff}`,
        `-Dforgewrapper.minecraft=${clientPath(mc)}`,
        `-Dforgewrapper.patched=${patched}`,
    ];

    const libraries = [client];
    if (era === ERA.ANCIENT) {
        // No installer ever existed for these; the overlay zip is the release.
        const classifier = classifiers.universal ? 'universal' : 'client';
        const overlay = await forgeFileLibrary(forgeId, classifier, classifiers[classifier]);
        if (!overlay) throw new Error(`Ancient build ${forgeId} has no reachable ${classifier} archive`);
        jvm.push(`-Dforgewrapper.jarmod=${LIB_DIR}/${overlay.downloads.artifact.path}`);
        libraries.push(overlay);
    } else {
        const usable = (versionInfo.libraries ?? []).filter(entry => entry.clientreq !== false);
        const resolved = await mapLimit(withoutVanillaDuplicates(usable, vanillaLibraries), 4, entry => resolveLegacyLibrary(entry, forgeId));
        libraries.push(...resolved.filter(Boolean));
    }
    libraries.push(wrapper);

    const document = {
        id: versionInfo?.id ?? documentId(forgeId, mc),
        inheritsFrom: mc,
        type: versionInfo?.type ?? 'release',
        time: versionInfo?.time,
        releaseTime: versionInfo?.releaseTime,
        mainClass: WRAPPER.mainClass,
        arguments: { jvm },
        libraries,
    };
    if (versionInfo?.minecraftArguments) document.minecraftArguments = versionInfo.minecraftArguments;
    return document;
}

export async function buildVersionJson(build) {
    switch (build.era) {
        case ERA.PROCESSOR:
            return buildProcessor(build);
        case ERA.LEGACY:
            return buildLegacy(build);
        default:
            return buildPatched(build);
    }
}
