import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coordPath, coordUrl, parseCoord, withClassifier } from '../src/maven.mjs';

test('parses a plain coordinate', () => {
    assert.deepEqual(parseCoord('net.minecraft:launchwrapper:1.8'), {
        group: 'net.minecraft', artifact: 'launchwrapper', version: '1.8', classifier: undefined, extension: 'jar',
    });
});

test('parses a classifier and an extension', () => {
    assert.deepEqual(parseCoord('net.minecraftforge:forge:1.4.7-6.6.2.534:universal@zip'), {
        group: 'net.minecraftforge', artifact: 'forge', version: '1.4.7-6.6.2.534', classifier: 'universal', extension: 'zip',
    });
});

test('rejects something that is not a coordinate', () => {
    assert.throws(() => parseCoord('launchwrapper'), /Not a maven coordinate/);
});

test('lays a coordinate out the way maven does', () => {
    assert.equal(
        coordPath(parseCoord('org.lwjgl.lwjgl:lwjgl-platform:2.9.0:natives-linux')),
        'org/lwjgl/lwjgl/lwjgl-platform/2.9.0/lwjgl-platform-2.9.0-natives-linux.jar',
    );
    assert.equal(
        coordPath(parseCoord('net.minecraftforge:forge:1.4.7-6.6.2.534:universal@zip')),
        'net/minecraftforge/forge/1.4.7-6.6.2.534/forge-1.4.7-6.6.2.534-universal.zip',
    );
});

test('joins a base url without doubling the slash', () => {
    assert.equal(
        coordUrl('https://maven.example/', parseCoord('a.b:c:1')),
        'https://maven.example/a/b/c/1/c-1.jar',
    );
});

test('swaps the classifier without touching the rest', () => {
    const coord = withClassifier(parseCoord('org.lwjgl.lwjgl:lwjgl-platform:2.9.0'), 'natives-osx');
    assert.equal(coordPath(coord), 'org/lwjgl/lwjgl/lwjgl-platform/2.9.0/lwjgl-platform-2.9.0-natives-osx.jar');
});
