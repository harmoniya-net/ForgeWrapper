import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installerCoord, installerUrl, isPrerelease, minecraftVersionOf } from '../src/neoforge.mjs';

test('reads the Minecraft version out of the build rather than off its id', () => {
    // `21.1.172` does encode 1.21.1, and for years every version did — which is
    // exactly why deriving it looks safe. `26.2.0.84` carries four components
    // and targets Minecraft `26.2`, which has no leading `1.` at all.
    assert.equal(minecraftVersionOf({ versionJson: { inheritsFrom: '1.21.1' } }), '1.21.1');
    assert.equal(minecraftVersionOf({ versionJson: { inheritsFrom: '26.2' } }), '26.2');
});

test('falls back to the install profile when the version document names nothing', () => {
    assert.equal(minecraftVersionOf({ versionJson: {}, installProfile: { minecraft: '1.20.4' } }), '1.20.4');
    assert.equal(minecraftVersionOf({}), null);
});

test('treats a qualified version as a prerelease, which is NeoForge own rule', () => {
    assert.equal(isPrerelease('20.4.80-beta'), true);
    assert.equal(isPrerelease('26.1.0.0-alpha.1+snapshot-1'), true);
    assert.equal(isPrerelease('21.1.172'), false);
    assert.equal(isPrerelease('26.2.0.84'), false);
});

test('addresses the installer the way NeoForge publishes it', () => {
    assert.equal(
        installerUrl('21.1.172'),
        'https://maven.neoforged.net/releases/net/neoforged/neoforge/21.1.172/neoforge-21.1.172-installer.jar',
    );
    assert.equal(installerCoord('21.1.172'), 'net.neoforged:neoforge:21.1.172:installer@jar');
});
