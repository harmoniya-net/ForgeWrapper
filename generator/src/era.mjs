/**
 * Forge's install eras, decided from the documents a build ships rather than
 * from its Minecraft version. The two do not line up: the installer arrives
 * partway through 1.6.1, so two builds for the same Minecraft version can
 * belong to different eras.
 */
export const ERA = {
    /** 1.13+. An install profile with processors that have to be run. */
    PROCESSOR: 'processor',
    /** 1.6.1-1.12.2. A version document and libraries; nothing to run, nothing to patch. */
    LEGACY: 'legacy',
    /** 1.5.2. `stripMeta`: Forge is a library, but the signed client jar has to be rewritten. */
    JARMOD: 'jarmod',
    /** 1.5.1 and older. No installer at all — a zip of class files to overlay. */
    ANCIENT: 'ancient',
};

export function detectEra(installProfile) {
    if (!installProfile) return ERA.ANCIENT;
    if (installProfile.versionInfo) {
        return installProfile.install?.stripMeta === true ? ERA.JARMOD : ERA.LEGACY;
    }
    // The new-format profile. Having a `spec` is not what makes a build a
    // processor build — 1.12.2's last releases were backported onto this format
    // and carry no processors at all.
    const processors = installProfile.processors ?? [];
    return processors.length > 0 ? ERA.PROCESSOR : ERA.LEGACY;
}
