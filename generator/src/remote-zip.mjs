import zlib from 'node:zlib';

/**
 * Reads named entries out of a zip over HTTP, without downloading the zip.
 *
 * This is what makes covering every Forge build affordable. The two documents
 * worth having — `install_profile.json` and `version.json` — are tens of
 * kilobytes inside installers that run 2-5 MB, and there are about five
 * thousand installers. Fetching the central directory and then just those
 * entries turns ~20 GB into ~650 MB.
 *
 * Forge's maven sits behind Cloudflare and answers `accept-ranges: bytes`. A
 * server that does not is not a failure case here: `readEntries` reports it and
 * the caller falls back to downloading the whole archive.
 */

const EOCD_SIGNATURE = 0x06054b50;
const EOCD_MIN_SIZE = 22;
const CENTRAL_SIGNATURE = 0x02014b50;
/** Enough for the end-of-central-directory record plus any sane zip comment. */
const TAIL_SIZE = 65_536;

export class RangeUnsupportedError extends Error {
    constructor(url) {
        super(`Server does not support range requests: ${url}`);
        this.name = 'RangeUnsupportedError';
        this.url = url;
    }
}

async function fetchRange(url, start, end) {
    const suffix = start < 0;
    const range = suffix ? `bytes=${start}` : `bytes=${start}-${end - 1}`;
    const response = await fetch(url, { headers: { Range: range } });
    if (response.status === 200) {
        // A 200 to a ranged request means the whole file came back: the server
        // ignored the header rather than refused it.
        throw new RangeUnsupportedError(url);
    }
    if (response.status !== 206) {
        throw new Error(`GET ${url} [${range}] -> ${response.status} ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
}

function findEocd(tail) {
    for (let i = tail.length - EOCD_MIN_SIZE; i >= 0; i--) {
        if (tail.readUInt32LE(i) === EOCD_SIGNATURE) return i;
    }
    return -1;
}

/**
 * @returns {Map<string, {offset: number, compressedSize: number, method: number}>}
 */
function parseCentralDirectory(buffer) {
    const entries = new Map();
    let cursor = 0;
    while (cursor + 46 <= buffer.length && buffer.readUInt32LE(cursor) === CENTRAL_SIGNATURE) {
        const method = buffer.readUInt16LE(cursor + 10);
        const compressedSize = buffer.readUInt32LE(cursor + 20);
        const nameLength = buffer.readUInt16LE(cursor + 28);
        const extraLength = buffer.readUInt16LE(cursor + 30);
        const commentLength = buffer.readUInt16LE(cursor + 32);
        const offset = buffer.readUInt32LE(cursor + 42);
        const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
        entries.set(name, { offset, compressedSize, method });
        cursor += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}

function inflate(data, method) {
    if (method === 0) return data;
    if (method === 8) return zlib.inflateRawSync(data);
    throw new Error(`Unsupported zip compression method: ${method}`);
}

/**
 * @param {string} url
 * @param {string[]} names Entries to read. Missing ones are simply absent from the result.
 * @returns {Promise<Map<string, Buffer>>}
 */
export async function readEntries(url, names) {
    const tail = await fetchRange(url, -TAIL_SIZE, 0);
    const eocd = findEocd(tail);
    if (eocd < 0) {
        // Zip64, or a comment longer than the tail we read. Neither has ever
        // shown up in a Forge installer; say so rather than guess.
        throw new Error(`No end-of-central-directory record in the last ${TAIL_SIZE} bytes of ${url}`);
    }

    const size = tail.readUInt32LE(eocd + 12);
    const offset = tail.readUInt32LE(eocd + 16);
    const central = parseCentralDirectory(await fetchRange(url, offset, offset + size));

    const found = new Map();
    for (const name of names) {
        const entry = central.get(name);
        if (!entry) continue;
        // The local header repeats the name and carries its own extra field,
        // whose length the central directory does not record — so its size has
        // to be read before the data can be addressed.
        const header = await fetchRange(url, entry.offset, entry.offset + 30);
        const start = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
        const data = await fetchRange(url, start, start + entry.compressedSize);
        found.set(name, inflate(data, entry.method));
    }
    return found;
}

/** The entry names present in the archive, read from the central directory alone. */
export async function listEntries(url) {
    const tail = await fetchRange(url, -TAIL_SIZE, 0);
    const eocd = findEocd(tail);
    if (eocd < 0) {
        throw new Error(`No end-of-central-directory record in the last ${TAIL_SIZE} bytes of ${url}`);
    }
    const size = tail.readUInt32LE(eocd + 12);
    const offset = tail.readUInt32LE(eocd + 16);
    return [...parseCentralDirectory(await fetchRange(url, offset, offset + size)).keys()];
}
