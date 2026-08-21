/**
 * Minimal ZIP writer — enough of the format to build ODF packages.
 *
 * An ODF file is a zip with a strict first entry, and every zip library on npm
 * is either a heavy peer or arrives with its own async model. Deflate is in
 * Node's standard library and the container is a few hundred bytes of header
 * arithmetic, so ODF export carries no dependency at all. That matters more
 * than it looks: docx and pdf are optional peers that can be missing, and the
 * open format should be the one that always works.
 *
 * Scope is deliberately narrow — no zip64, no encryption, no directory
 * entries. ODF packages are a handful of small files, so none of it applies.
 */

import { deflateRawSync } from 'node:zlib';

export interface ZipEntry {
  /** Path inside the archive, '/'-separated. */
  name: string;
  data: Buffer;
  /**
   * Store without compressing. ODF requires exactly this for `mimetype`, so
   * that a reader can identify the file from the first bytes of the stream.
   */
  store?: boolean;
}

// ── CRC-32 ───────────────────────────────────────────────────────────────────

let CRC_TABLE: Uint32Array | null = null;

function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  CRC_TABLE = table;
  return table;
}

export function crc32(buf: Buffer): number {
  const table = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── DOS timestamps ───────────────────────────────────────────────────────────

/** Zip stores mtime as two 16-bit DOS fields; the epoch is 1980 and seconds
 *  have 2-second resolution. Anything earlier clamps rather than underflows. */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = d.getFullYear();
  if (year < 1980) return { time: 0, date: (1 << 5) | 1 };
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// ── Writer ───────────────────────────────────────────────────────────────────

/**
 * Build a zip archive. Entries are written in the order given — which is the
 * whole reason this takes an array rather than a map, since ODF's `mimetype`
 * must come first.
 *
 * `modified` defaults to now; pass a fixed date for byte-reproducible output.
 */
export function zipSync(entries: ZipEntry[], modified: Date = new Date()): Buffer {
  const { time, date } = dosDateTime(modified);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const raw = entry.data;

    // Compress unless told not to — and keep the compressed form only if it
    // actually won, which for the tiny XML stubs it sometimes does not.
    let method = 0;
    let body = raw;
    if (!entry.store && raw.length > 0) {
      const deflated = deflateRawSync(raw, { level: 9 });
      if (deflated.length < raw.length) {
        method = 8;
        body = deflated;
      }
    }

    const sum = crc32(raw);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0, 6);           // flags — names below are ASCII
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);          // extra field length
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);        // version made by
    central.writeUInt16LE(20, 6);        // version needed
    central.writeUInt16LE(0, 8);         // flags
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);        // extra
    central.writeUInt16LE(0, 32);        // comment
    central.writeUInt16LE(0, 34);        // disk number
    central.writeUInt16LE(0, 36);        // internal attributes
    central.writeUInt32LE(0, 38);        // external attributes
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);

    locals.push(local, body);
    centrals.push(central);
    offset += local.length + body.length;
  }

  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);                    // this disk
  end.writeUInt16LE(0, 6);                    // disk with central directory
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);                   // comment length

  return Buffer.concat([...locals, centralDir, end]);
}
