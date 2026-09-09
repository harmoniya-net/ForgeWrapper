import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import zlib from 'node:zlib';
import { after, before, test } from 'node:test';
import { listEntries, RangeUnsupportedError, readEntries } from '../src/remote-zip.mjs';

/** A zip built by hand, so the reader is tested against bytes rather than against itself. */
function buildZip(entries, { comment = '' } = {}) {
    const locals = [];
    const central = [];
    let offset = 0;

    for (const [name, content, store] of entries) {
        const raw = Buffer.from(content);
        const data = store ? raw : zlib.deflateRawSync(raw);
        const nameBytes = Buffer.from(name);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(store ? 0 : 8, 8);
        local.writeUInt32LE(zlib.crc32 ? zlib.crc32(raw) : 0, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(raw.length, 22);
        local.writeUInt16LE(nameBytes.length, 26);
        // A non-empty extra field: its length lives only in the local header,
        // so a reader that assumes zero addresses the data at the wrong offset.
        const extra = Buffer.from([0x99, 0x99, 0x02, 0x00, 0x01, 0x02]);
        local.writeUInt16LE(extra.length, 28);

        const header = Buffer.concat([local, nameBytes, extra]);

        const entry = Buffer.alloc(46);
        entry.writeUInt32LE(0x02014b50, 0);
        entry.writeUInt16LE(store ? 0 : 8, 10);
        entry.writeUInt32LE(data.length, 20);
        entry.writeUInt32LE(raw.length, 24);
        entry.writeUInt16LE(nameBytes.length, 28);
        entry.writeUInt32LE(offset, 42);
        central.push(Buffer.concat([entry, nameBytes]));

        locals.push(header, data);
        offset += header.length + data.length;
    }

    const directory = Buffer.concat(central);
    const commentBytes = Buffer.from(comment);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(central.length, 8);
    eocd.writeUInt16LE(central.length, 10);
    eocd.writeUInt32LE(directory.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(commentBytes.length, 20);

    return Buffer.concat([...locals, directory, eocd, commentBytes]);
}

const ZIP = buildZip([
    ['install_profile.json', JSON.stringify({ spec: 1, processors: [] })],
    // Incompressible, and large enough that reading around it is visible —
    // it stands in for the megabytes of jar a real installer carries.
    ['maven/big.jar', crypto.randomBytes(1 << 20), true],
    ['version.json', JSON.stringify({ id: '1.20.1-forge', inheritsFrom: '1.20.1' }), true],
], { comment: 'a trailing comment' });

let server;
let base;
let honourRanges = true;
let servedBytes = 0;

before(async () => {
    server = http.createServer((request, response) => {
        const range = /^bytes=(-?\d+)(?:-(\d+))?$/.exec(request.headers.range ?? '');
        if (!range || !honourRanges) {
            servedBytes += ZIP.length;
            response.writeHead(200, { 'content-length': ZIP.length });
            response.end(request.method === 'HEAD' ? undefined : ZIP);
            return;
        }
        const start = Number(range[1]) < 0 ? ZIP.length + Number(range[1]) : Number(range[1]);
        const end = range[2] === undefined ? ZIP.length - 1 : Number(range[2]);
        const slice = ZIP.subarray(Math.max(0, start), end + 1);
        servedBytes += slice.length;
        response.writeHead(206, {
            'content-range': `bytes ${start}-${end}/${ZIP.length}`,
            'content-length': slice.length,
        });
        response.end(slice);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}/installer.jar`;
});

after(() => server.close());

test('reads a deflated entry past a non-empty extra field', async () => {
    const entries = await readEntries(base, ['install_profile.json']);
    assert.deepEqual(JSON.parse(entries.get('install_profile.json').toString()), { spec: 1, processors: [] });
});

test('reads a stored entry', async () => {
    const entries = await readEntries(base, ['version.json']);
    assert.equal(JSON.parse(entries.get('version.json').toString()).inheritsFrom, '1.20.1');
});

test('omits a name the archive does not have, rather than failing', async () => {
    const entries = await readEntries(base, ['version.json', 'nope.json']);
    assert.deepEqual([...entries.keys()], ['version.json']);
});

test('lists the archive from the central directory alone', async () => {
    assert.deepEqual(await listEntries(base), ['install_profile.json', 'maven/big.jar', 'version.json']);
});

test('never transfers the entries it was not asked for', async () => {
    servedBytes = 0;
    await readEntries(base, ['install_profile.json', 'version.json']);
    assert.ok(servedBytes < ZIP.length / 4, `transferred ${servedBytes} of ${ZIP.length} bytes`);
});

test('says so when the server ignores the range header', async () => {
    honourRanges = false;
    try {
        await assert.rejects(() => readEntries(base, ['version.json']), RangeUnsupportedError);
    } finally {
        honourRanges = true;
    }
});
