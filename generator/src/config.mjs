import path from 'node:path';

const CACHE_DIR = path.join(process.cwd(), '.cache');

/**
 * The wrapper jar these documents name. It is a release asset of this same
 * repository — the jar and the version.json files that point at it ship
 * together, which is the whole reason the generator lives here.
 */
export const WRAPPER = {
    tag: process.env.FORGEWRAPPER_TAG ?? 'harmoniya-1',
    group: 'io.github.zekerzhayard',
    artifact: 'ForgeWrapper',
    mainClass: 'io.github.zekerzhayard.forgewrapper.installer.Main',
    repo: 'harmoniya-net/ForgeWrapper',
    /** A locally built jar to hash instead of fetching the release asset. */
    jar: process.env.FORGEWRAPPER_JAR ?? null,
};

export const CONFIG = {
    FORGE_API: 'https://files.minecraftforge.net/net/minecraftforge/forge',
    FORGE_MAVEN: 'https://maven.minecraftforge.net',
    MOJANG_MANIFEST: 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json',
    DOCUMENT_CACHE: path.join(CACHE_DIR, 'documents'),
    META_CACHE: path.join(CACHE_DIR, 'forge-meta.json'),
    ARTIFACT_CACHE: path.join(CACHE_DIR, 'artifacts.json'),
    MOJANG_CACHE: path.join(CACHE_DIR, 'mojang.json'),
    PUBLIC_DIR: path.join(process.cwd(), 'public'),
    CONCURRENCY: Number(process.env.CONCURRENCY ?? 12),
};

export default CONFIG;
