import crypto from 'node:crypto';
import fs from 'node:fs';
import CONFIG, { WRAPPER } from './config.mjs';
import { ERA } from './era.mjs';
import { MOJANG_LIBRARIES, resolveArtifact } from './artifacts.mjs';
import { artifactUrl } from './forge.mjs';
import { coordPath, coordUrl, parseCoord, withClassifier } from './maven.mjs';
import { vanillaVersion } from './mojang.mjs';
import { mapLimit } from './utils.mjs';

const LIB_DIR = '${library_directory}';

const sha1OfFile = file => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');

/**
 * Arguments that put jars on the module path. Forge's own version document
 * lists them, and for the processor era the wrapper reads that document out of
 * the installer and applies them itself — so leaving them on the command line
 * applies them twice.
 */
const MODULE_ARGS = ['-p', '--module-path', '--add-modules', '--add-reads', '--add-opens', '--add-exports'];

export function stripModuleArgs(jvm) {
    const kept = [];
    for (let i = 0; i < jvm.length; i++) {
        const arg = jvm[i];
        if (typeof arg !== 'string') {
            kept.push(arg);
            continue;
        }
        if (MODULE_ARGS.includes(arg)) {
            i++;
            continue;
        }
        if (MODULE_ARGS.some(name => arg.startsWith(`${name}=`)) || arg.startsWith('-DignoreList=')) {
            continue;
        }
        kept.push(arg);
    }
    return kept;
}

/**
 * Forge's own documents carry `"logging": {}` — the key with nothing under it.
 * An empty object is not a smaller `logging`, it is a different shape, and a
 * consumer that reads the field as optional-but-whole chokes on it. Under
 * `inheritsFrom` the vanilla document supplies the real one anyway.
 */
const loggingOf = logging => (logging?.client ? { logging } : {});

function library(name, artifact) {
    return { name, downloads: { artifact } };
}

const clientCoord = mc => ({ group: 'com.mojang', artifact: 'minecraft', version: mc, classifier: 'client', extension: 'jar' });

/**
 * The vanilla client jar, declared as a library.
 *
 * The wrapper has to be told where that jar is, and the Mojang format has no
 * placeholder for it — `${version_name}` names the Forge version, not the
 * Minecraft one, and every launcher lays out `versions/` differently. Declaring
 * it as a library puts it at a path `${library_directory}` can address, which
 * is also where ForgeWrapper's own detector looks for it. The cost is that a
 * launcher honouring `inheritsFrom` fetches the jar twice; the alternative is a
 * document that only works in launchers told about it out of band.
 */
async function clientLibrary(mc) {
    const vanilla = await vanillaVersion(mc);
    if (!vanilla?.client) return null;
    return library(`com.mojang:minecraft:${mc}:client`, {
        path: coordPath(clientCoord(mc)),
        url: vanilla.client.url,
        sha1: vanilla.client.sha1,
        size: vanilla.client.size,
    });
}

const clientPath = mc => `${LIB_DIR}/${coordPath(clientCoord(mc))}`;

let wrapperLibraryPromise = null;

function wrapperLibrary() {
    wrapperLibraryPromise ??= (async () => {
        const coord = { group: WRAPPER.group, artifact: WRAPPER.artifact, version: WRAPPER.tag, extension: 'jar' };
        const url = `https://github.com/${WRAPPER.repo}/releases/download/${WRAPPER.tag}/${WRAPPER.artifact}-${WRAPPER.tag}.jar`;
        // In CI the jar is built in the same job that publishes it, so it exists
        // on disk before it exists at that URL. Hashing the local file is how
        // the release and the documents naming it ship in one go, rather than
        // needing a release to already be there before they can be generated.
        const resolved = WRAPPER.jar
            ? { url, sha1: sha1OfFile(WRAPPER.jar), size: fs.statSync(WRAPPER.jar).size }
            : await resolveArtifact([url]);
        if (!resolved) throw new Error(`ForgeWrapper release asset not found: ${url}`);
        return library(`${WRAPPER.group}:${WRAPPER.artifact}:${WRAPPER.tag}`, {
            path: coordPath(coord),
            url: resolved.url,
            sha1: resolved.sha1,
            size: resolved.size,
        });
    })();
    return wrapperLibraryPromise;
}

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

function wrapperJvmArgs(forgeId, mc, installerExtension) {
    return [
        `-Dforgewrapper.librariesDir=${LIB_DIR}`,
        `-Dforgewrapper.installer=${LIB_DIR}/${coordPath(parseCoord(`net.minecraftforge:forge:${forgeId}:installer@${installerExtension}`))}`,
        `-Dforgewrapper.minecraft=${clientPath(mc)}`,
    ];
}

/**
 * What the processors themselves run on.
 *
 * Forge keeps these in a separate file for a reason: `installertools`,
 * `jarsplitter`, ASM 9.2 and 9.6, Guava 25.1 are the *installer's* classpath,
 * and several are older than what the game needs. Merged into `libraries` they
 * would land on the game's classpath and displace the runtime versions —
 * 1.20.1 ships Guava 32.1.2, and starting it against 25.1 is not a smaller
 * game, it is a broken one.
 *
 * `mavenFiles` is MultiMC's and Prism's name for exactly this: files that must
 * exist under the library directory without joining `-cp`. The Mojang format
 * cannot say that, which is why both launchers grew a field for it.
 *
 * An entry with no URL is produced by a processor rather than fetched, and one
 * already declared as a runtime library is not repeated.
 */
export function installerFiles(runtime, installProfile) {
    const declared = new Set(runtime.map(l => l.name));
    return (installProfile?.libraries ?? []).filter(
        l => l.downloads?.artifact?.url && !declared.has(l.name),
    );
}

async function buildProcessor({ forgeId, mc, documents, classifiers }) {
    const source = documents.versionJson;
    if (!source) throw new Error(`Processor build ${forgeId} has no version.json`);

    const [client, wrapper, installer] = await Promise.all([
        clientLibrary(mc),
        wrapperLibrary(),
        forgeFileLibrary(forgeId, 'installer', classifiers.installer),
    ]);
    if (!installer) throw new Error(`Processor build ${forgeId} has no reachable installer`);

    // An entry with no URL is not a download: the processors produce it.
    const produced = (source.libraries ?? []).filter(l => l.downloads?.artifact?.url);

    const mavenFiles = installerFiles(produced, documents.installProfile);

    return {
        id: source.id ?? documentId(forgeId, mc),
        inheritsFrom: mc,
        type: source.type ?? 'release',
        time: source.time,
        releaseTime: source.releaseTime,
        ...loggingOf(source.logging),
        mainClass: WRAPPER.mainClass,
        arguments: {
            game: source.arguments?.game ?? [],
            jvm: [...wrapperJvmArgs(forgeId, mc, classifiers.installer), ...stripModuleArgs(source.arguments?.jvm ?? [])],
        },
        libraries: [...produced, ...[client, installer, wrapper].filter(Boolean)],
        ...(mavenFiles.length > 0 ? { mavenFiles } : {}),
    };
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
