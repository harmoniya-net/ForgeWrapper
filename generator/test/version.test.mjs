import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripModuleArgs, withoutVanillaDuplicates } from '../src/version.mjs';

test('drops a module argument and the value that follows it', () => {
    assert.deepEqual(stripModuleArgs(['-p', 'a.jar:b.jar', '-Xmx2G']), ['-Xmx2G']);
    assert.deepEqual(stripModuleArgs(['--module-path', 'x', '--add-modules', 'ALL-MODULE-PATH', '-Da=b']), ['-Da=b']);
});

test('drops the joined spelling too', () => {
    assert.deepEqual(
        stripModuleArgs(['--add-opens=java.base/java.util=ALL-UNNAMED', '--add-exports=jdk/x=y', '-Dkeep=1']),
        ['-Dkeep=1'],
    );
});

test('drops ignoreList, which names the jars Forge must not see twice', () => {
    assert.deepEqual(stripModuleArgs(['-DignoreList=asm,client-extra', '-DlibraryDirectory=${library_directory}']), [
        '-DlibraryDirectory=${library_directory}',
    ]);
});

test('leaves a conditional argument object alone', () => {
    const conditional = { rules: [{ action: 'allow' }], value: '-XstartOnFirstThread' };
    assert.deepEqual(stripModuleArgs([conditional]), [conditional]);
});

test('drops a library vanilla already provides at the same version', () => {
    const kept = withoutVanillaDuplicates(
        [{ name: 'net.minecraft:launchwrapper:1.5' }, { name: 'net.minecraftforge:legacyfixer:1.0' }],
        [{ name: 'net.minecraft:launchwrapper:1.5' }],
    );
    assert.deepEqual(kept.map(l => l.name), ['net.minecraftforge:legacyfixer:1.0']);
});

test('keeps a library vanilla provides at a different version', () => {
    const kept = withoutVanillaDuplicates(
        [{ name: 'net.minecraft:launchwrapper:1.8' }],
        [{ name: 'net.minecraft:launchwrapper:1.5' }],
    );
    assert.deepEqual(kept.map(l => l.name), ['net.minecraft:launchwrapper:1.8']);
});

test('keeps one of two versions vanilla lists side by side', () => {
    // Vanilla carries LWJGL 2.9.0 and a 2.9.1 nightly at once and picks with
    // rules. Keying the comparison by group:artifact would forget one of them
    // and wrongly drop Forge's matching entry.
    const vanilla = [
        { name: 'org.lwjgl.lwjgl:lwjgl:2.9.0' },
        { name: 'org.lwjgl.lwjgl:lwjgl:2.9.1-nightly-20130708-debug3' },
    ];
    assert.deepEqual(withoutVanillaDuplicates([{ name: 'org.lwjgl.lwjgl:lwjgl:2.9.0' }], vanilla), []);
    assert.deepEqual(
        withoutVanillaDuplicates([{ name: 'org.lwjgl.lwjgl:lwjgl:2.9.4' }], vanilla).map(l => l.name),
        ['org.lwjgl.lwjgl:lwjgl:2.9.4'],
    );
});

test('keeps an entry whose name is not a coordinate rather than losing it', () => {
    assert.deepEqual(withoutVanillaDuplicates([{ name: 'mystery' }], []).map(l => l.name), ['mystery']);
});
