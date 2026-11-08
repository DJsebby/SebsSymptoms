// Minimal ZIP support, so backups are ordinary .zip files that open anywhere.
// Writing stores files uncompressed (photos are already compressed JPEGs).
// Reading handles stored and deflated files, so a backup that was unzipped
// and re-zipped on a computer can still be restored.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function dosDateTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// files: [{ name: 'folder/file.ext', data: string | ArrayBuffer | Uint8Array }]
export function makeZip(files, when = new Date()) {
  const parts = [];
  const central = [];
  let offset = 0;
  const { time, date } = dosDateTime(when);
  for (const f of files) {
    const data = typeof f.data === 'string' ? enc.encode(f.data) : new Uint8Array(f.data);
    const name = enc.encode(f.name);
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);         // version needed
    local.setUint16(6, 0x0800, true);     // UTF-8 file names
    local.setUint16(8, 0, true);          // stored (no compression)
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, time, true);
    entry.setUint16(14, date, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);

    offset += 30 + name.length + data.length;
    if (offset > 0xffffffff) throw new Error('The backup is over 4 GB, which is too big for one zip file.');
  }
  if (files.length > 0xffff) throw new Error('Too many files for one zip backup.');
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

export async function readZip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("This isn't a zip file.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error('The zip file is damaged.');
    const nameLen = dv.getUint16(p + 28, true);
    files.set(dec.decode(buf.subarray(p + 46, p + 46 + nameLen)), {
      method: dv.getUint16(p + 10, true),
      size: dv.getUint32(p + 20, true),
      localOffset: dv.getUint32(p + 42, true),
    });
    p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return {
    names: [...files.keys()],
    async bytes(name) {
      const f = files.get(name);
      if (!f) return null;
      const lo = f.localOffset;
      const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
      const raw = buf.subarray(start, start + f.size);
      if (f.method === 0) return raw.slice();
      if (f.method === 8) {
        const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      }
      throw new Error(`Unsupported compression in ${name}.`);
    },
    async text(name) {
      const b = await this.bytes(name);
      return b && dec.decode(b);
    },
  };
}
