import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ERA } from '../src/era.mjs';
import { buildVersionJson, stripModuleArgs, withoutVanillaDuplicates } from '../src/version.mjs';

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

test('drops an empty logging object rather than passing the key through', async () => {
    // Forge's own documents carry `"logging": {}`. Under `inheritsFrom` the
    // vanilla document supplies the real one, and a consumer that reads the
    // field as optional-but-whole cannot make sense of a key with nothing
    // under it.
    const source = {
        id: '1.12.2-forge-14.23.5.2860',
        mainClass: 'net.minecraft.launchwrapper.Launch',
        logging: {},
        libraries: [
            {
                name: 'org.ow2.asm:asm-debug-all:5.2',
                downloads: { artifact: { path: 'org/ow2/asm/asm-debug-all/5.2/asm-debug-all-5.2.jar', url: 'https://maven/asm.jar', sha1: 'a'.repeat(40), size: 1 } },
            },
        ],
    };
    const document = await buildVersionJson({
        era: ERA.LEGACY,
        forgeId: '1.12.2-14.23.5.2860',
        mc: '1.12.2',
        documents: { versionJson: source },
        vanillaLibraries: [],
    });
    assert.equal('logging' in document, false);
});

test('keeps a logging object that actually names a client config', async () => {
    const logging = { client: { argument: '-Dl=${path}', file: { id: 'client-1.12.xml', sha1: 'b'.repeat(40), size: 1, url: 'https://l/x.xml' }, type: 'log4j2-xml' } };
    const document = await buildVersionJson({
        era: ERA.LEGACY,
        forgeId: '1.12.2-14.23.5.2860',
        mc: '1.12.2',
        documents: { versionJson: { id: 'x', mainClass: 'M', logging, libraries: [] } },
        vanillaLibraries: [],
    });
    assert.deepEqual(document.logging, logging);
});

