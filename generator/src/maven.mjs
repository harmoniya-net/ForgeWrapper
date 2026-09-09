/**
 * Maven coordinates as Forge writes them: `group:artifact:version[:classifier][@ext]`.
 */
export function parseCoord(coord) {
    const [withoutExt, extension = 'jar'] = coord.split('@');
    const [group, artifact, version, classifier] = withoutExt.split(':');
    if (!group || !artifact || !version) {
        throw new Error(`Not a maven coordinate: ${coord}`);
    }
    return { group, artifact, version, classifier, extension };
}

export function coordPath({ group, artifact, version, classifier, extension }) {
    const suffix = classifier ? `-${classifier}` : '';
    return `${group.split('.').join('/')}/${artifact}/${version}/${artifact}-${version}${suffix}.${extension}`;
}

export function coordUrl(base, coord) {
    return `${base.replace(/\/$/, '')}/${coordPath(coord)}`;
}

export function withClassifier(coord, classifier, extension = coord.extension) {
    return { ...coord, classifier, extension };
}
