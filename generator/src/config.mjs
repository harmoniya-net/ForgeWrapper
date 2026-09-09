import path from 'node:path';

const CACHE_DIR = path.join(process.cwd(), '.cache');

/**
 * The wrapper jar these documents name. It is a release asset of this same
 * repository — the jar and the version.json files that point at it ship
 * together, which is the whole reason the generator lives here.
 */
export const WRAPPER = {
    tag: process.env.FORGEWRAPPER_TAG ?? '0.1.0',
    group: 'io.github.zekerzhayard',
    artifact: 'ForgeWrapper',
    mainClass: 'io.github.zekerzhayard.forgewrapper.installer.Main',
    repo: 'harmoniya-net/ForgeWrapper',
    /** A locally built jar to hash instead of fetching the release asset. */
    jar: process.env.FORGEWRAPPER_JAR ?? null,
};

export const CONFIG = {
    /** Where the documents are served from. URLs in the index are absolute against it. */
    SITE: (process.env.SITE_BASE ?? 'https://harmoniya-net.github.io/ForgeWrapper').replace(/\/$/, ''),
    FORGE_API: 'https://files.minecraftforge.net/net/minecraftforge/forge',
    FORGE_MAVEN: 'https://maven.minecraftforge.net',
    /** NeoForge publishes no promotions endpoint; the version list is the whole API. */
    NEOFORGE_VERSIONS: 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge',
    NEOFORGE_MAVEN: 'https://maven.neoforged.net/releases',
    MOJANG_MANIFEST: 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json',
    DOCUMENT_CACHE: path.join(CACHE_DIR, 'documents'),
    NEOFORGE_DOCUMENT_CACHE: path.join(CACHE_DIR, 'neoforge-documents'),
    META_CACHE: path.join(CACHE_DIR, 'forge-meta.json'),
    ARTIFACT_CACHE: path.join(CACHE_DIR, 'artifacts.json'),
    MOJANG_CACHE: path.join(CACHE_DIR, 'mojang.json'),
    PUBLIC_DIR: path.join(process.cwd(), 'public'),
    /** NeoForge's documents get their own index under the same site. */
    NEOFORGE_DIR: path.join(process.cwd(), 'public', 'neoforge'),
    CONCURRENCY: Number(process.env.CONCURRENCY ?? 12),
};

export default CONFIG;
