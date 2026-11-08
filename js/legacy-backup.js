// Reads the encrypted .ssbk backups made by version 1.0 of the app, before
// backups became plain zip files. Kept only so those older files can still be restored.
//
// Layout: "SSBK" | format (1) | PBKDF2 iterations (uint32 BE) | salt (16) | IV (12) | AES-256-GCM ciphertext.
// Decrypted: JSON length (uint32 BE) | JSON | photo bytes (offsets listed in the JSON).

const MAGIC = [0x53, 0x53, 0x42, 0x4b];
const HEADER_LEN = 37;

export const isLegacyBackup = u8 => u8.byteLength >= 4 && MAGIC.every((b, i) => u8[i] === b);

export async function openLegacyBackup(bytes, passphrase) {
  const u8 = new Uint8Array(bytes);
  if (!isLegacyBackup(u8) || u8.byteLength < HEADER_LEN + 16) throw new Error("This isn't a Seb's Symptoms backup file.");
  if (u8[4] !== 1) throw new Error('Unknown backup format.');
  const iterations = new DataView(u8.buffer, u8.byteOffset, HEADER_LEN).getUint32(5);
  if (iterations < 100000 || iterations > 10000000) throw new Error('This backup file looks damaged.');
  const salt = u8.slice(9, 25), iv = u8.slice(25, 37), header = u8.slice(0, HEADER_LEN);

  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const raw = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256);
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
  let plain;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: header }, key, u8.subarray(HEADER_LEN)));
  } catch {
    throw new Error('Wrong passphrase, or the file is damaged.');
  }
  const n = new DataView(plain.buffer).getUint32(0);
  const data = JSON.parse(new TextDecoder().decode(plain.subarray(4, 4 + n)));
  const base0 = 4 + n;
  return {
    entries: data.entries,
    products: data.products,
    photos: data.photos.map(m => ({
      id: m.id, type: m.type, w: m.w, h: m.h, created: m.created,
      data: plain.slice(base0 + m.off, base0 + m.off + m.len).buffer,
      thumb: plain.slice(base0 + m.toff, base0 + m.toff + m.tlen).buffer,
    })),
    weather: [],
    missing: [],
  };
}
