// Encrypted backup format (.ssbk). Pure functions: no storage or UI here.
//
// File layout:
//   "SSBK" (4 bytes) | format (1) | PBKDF2 iterations (uint32 BE) | salt (16) | IV (12) | AES-256-GCM ciphertext
// The 37-byte header is authenticated as additional data, so any tampering is detected.
// Key = PBKDF2-SHA256(passphrase, salt, iterations) → 256 bits.
//
// Decrypted payload:
//   JSON length (uint32 BE) | JSON (UTF-8) | raw photo bytes...
// The JSON lists each photo with byte offsets into the trailing section.
// tools/decrypt_backup.py reads the same format on a computer.

const MAGIC = [0x53, 0x53, 0x42, 0x4b]; // "SSBK"
const FORMAT = 1;
const HEADER_LEN = 37;
export const DEFAULT_ITERATIONS = 600000;

const enc = new TextEncoder();
const dec = new TextDecoder();

export const newSalt = () => crypto.getRandomValues(new Uint8Array(16));

export async function deriveKeyRaw(passphrase, salt, iterations = DEFAULT_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256);
  return new Uint8Array(bits);
}

const aesKey = (raw, usage) => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [usage]);

export function packPayload({ entries, products, photos, meta }) {
  const parts = [];
  let offset = 0;
  const photoIndex = photos.map(p => {
    const data = new Uint8Array(p.data);
    const thumb = new Uint8Array(p.thumb || new ArrayBuffer(0));
    const m = { id: p.id, type: p.type, w: p.w, h: p.h, created: p.created,
      off: offset, len: data.byteLength, toff: offset + data.byteLength, tlen: thumb.byteLength };
    parts.push(data, thumb);
    offset += data.byteLength + thumb.byteLength;
    return m;
  });
  const json = enc.encode(JSON.stringify({ ...meta, entries, products, photos: photoIndex }));
  const out = new Uint8Array(4 + json.byteLength + offset);
  new DataView(out.buffer).setUint32(0, json.byteLength);
  out.set(json, 4);
  let pos = 4 + json.byteLength;
  for (const part of parts) { out.set(part, pos); pos += part.byteLength; }
  return out;
}

export function unpackPayload(buffer) {
  const u8 = new Uint8Array(buffer);
  const n = new DataView(u8.buffer, u8.byteOffset, u8.byteLength).getUint32(0);
  const data = JSON.parse(dec.decode(u8.subarray(4, 4 + n)));
  const base = 4 + n;
  data.photos = data.photos.map(m => ({
    id: m.id, type: m.type, w: m.w, h: m.h, created: m.created,
    data: u8.slice(base + m.off, base + m.off + m.len).buffer,
    thumb: u8.slice(base + m.toff, base + m.toff + m.tlen).buffer,
  }));
  return data;
}

export async function encrypt(plain, keyRaw, salt, iterations) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header = new Uint8Array(HEADER_LEN);
  header.set(MAGIC, 0);
  header[4] = FORMAT;
  new DataView(header.buffer).setUint32(5, iterations);
  header.set(salt, 9);
  header.set(iv, 25);
  const key = await aesKey(keyRaw, 'encrypt');
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header }, key, plain));
  const out = new Uint8Array(HEADER_LEN + ct.byteLength);
  out.set(header, 0);
  out.set(ct, HEADER_LEN);
  return out;
}

export function readHeader(bytes) {
  const u8 = new Uint8Array(bytes);
  if (u8.byteLength < HEADER_LEN + 16 || MAGIC.some((b, i) => u8[i] !== b)) {
    throw new Error("This isn't a Seb's Symptoms backup file.");
  }
  if (u8[4] !== FORMAT) throw new Error('This backup was made by a newer version of the app.');
  const iterations = new DataView(u8.buffer, u8.byteOffset, HEADER_LEN).getUint32(5);
  if (iterations < 100000 || iterations > 10000000) throw new Error('This backup file looks damaged.');
  return { iterations, salt: u8.slice(9, 25), iv: u8.slice(25, 37), header: u8.slice(0, HEADER_LEN) };
}

export async function createBackup({ entries, products, photos, keyRaw, salt, iterations, appVersion }) {
  const meta = { app: 'SebsSymptoms', format: FORMAT, appVersion, exportedAt: new Date().toISOString() };
  const plain = packPayload({ entries, products, photos, meta });
  return encrypt(plain, keyRaw, salt, iterations);
}

// Returns the decrypted data plus the key details, so restoring on a new phone
// keeps using the same passphrase for future backups.
export async function openBackup(bytes, passphrase) {
  const u8 = new Uint8Array(bytes);
  const hd = readHeader(u8);
  const keyRaw = await deriveKeyRaw(passphrase, hd.salt, hd.iterations);
  const key = await aesKey(keyRaw, 'decrypt');
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hd.iv, additionalData: hd.header }, key, u8.subarray(HEADER_LEN));
  } catch {
    throw new Error('Wrong passphrase, or the file is damaged.');
  }
  const data = unpackPayload(plain);
  if (data.app !== 'SebsSymptoms') throw new Error("This isn't a Seb's Symptoms backup file.");
  return { data, keyRaw, salt: hd.salt, iterations: hd.iterations };
}
