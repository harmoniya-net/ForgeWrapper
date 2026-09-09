/**
 * The pieces every published document is built out of, whichever loader it
 * describes.
 *
 * Forge and NeoForge ship the same kind of installer and are read the same
 * way; what differs is where the version list comes from and how a build is
 * named. Everything below that line lives here, so a fix to the wrapper's
 * arguments or to the client-jar declaration lands on both families at once.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { WRAPPER } from './config.mjs';
import { resolveArtifact } from './artifacts.mjs';
import { coordPath } from './maven.mjs';
import { vanillaVersion } from './mojang.mjs';

export const LIB_DIR = '${library_directory}';

const sha1OfFile = file => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');

export function library(name, artifact) {
    return { name, downloads: { artifact } };
}

/**
 * Arguments that put jars on the module path. The loader's own version
 * document lists them, and for the processor era the wrapper reads that
 * document out of the installer and applies them itself — so leaving them on
 * the command line applies them twice.
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
export const loggingOf = logging => (logging?.client ? { logging } : {});

const clientCoord = mc => ({ group: 'com.mojang', artifact: 'minecraft', version: mc, classifier: 'client', extension: 'jar' });

export const clientPath = mc => `${LIB_DIR}/${coordPath(clientCoord(mc))}`;

/**
 * The vanilla client jar, declared as a library.
 *
 * The wrapper has to be told where that jar is, and the Mojang format has no
 * placeholder for it — `${version_name}` names the loader's version, not the
 * Minecraft one, and every launcher lays out `versions/` differently. Declaring
 * it as a library puts it at a path `${library_directory}` can address, which
 * is also where ForgeWrapper's own detector looks for it. The cost is that a
 * launcher honouring `inheritsFrom` fetches the jar twice; the alternative is a
 * document that only works in launchers told about it out of band.
 */
export async function clientLibrary(mc) {
    const vanilla = await vanillaVersion(mc);
    if (!vanilla?.client) return null;
    return library(`com.mojang:minecraft:${mc}:client`, {
        path: coordPath(clientCoord(mc)),
        url: vanilla.client.url,
        sha1: vanilla.client.sha1,
        size: vanilla.client.size,
    });
}

let wrapperLibraryPromise = null;

export function wrapperLibrary() {
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

/**
 * A processor-era document: the loader's own version JSON, with the wrapper
 * put in front of it.
 *
 * The installer is declared as a library so it lands on disk, and named again
 * in `-Dforgewrapper.installer` so the wrapper can find it without a launcher
 * being told anything. Everything the wrapper will apply itself — the module
 * path, `ignoreList` — comes off the command line, because applying it twice
 * is not the same as applying it once.
 */
export async function processorDocument({ source, mc, installer, id }) {
    const [client, wrapper] = await Promise.all([clientLibrary(mc), wrapperLibrary()]);

    // An entry with no URL is not a download: the processors produce it.
    const produced = (source.libraries ?? []).filter(l => l.downloads?.artifact?.url);

    return {
        id: source.id ?? id,
        inheritsFrom: mc,
        type: source.type ?? 'release',
        time: source.time,
        releaseTime: source.releaseTime,
        ...loggingOf(source.logging),
        mainClass: WRAPPER.mainClass,
        arguments: {
            game: source.arguments?.game ?? [],
            jvm: [
                `-Dforgewrapper.librariesDir=${LIB_DIR}`,
                `-Dforgewrapper.installer=${LIB_DIR}/${installer.downloads.artifact.path}`,
                `-Dforgewrapper.minecraft=${clientPath(mc)}`,
                ...stripModuleArgs(source.arguments?.jvm ?? []),
            ],
        },
        libraries: [...produced, ...[client, installer, wrapper].filter(Boolean)],
    };
}
