#!/usr/bin/env python3
"""Open a Seb's Symptoms backup (.ssbk) on a computer.

Writes a folder containing data.json (every entry and product) and a photos/ folder.
Useful for checking a backup works, for bringing data to a specialist, or for
analysis later on.

    pip install cryptography
    python3 tools/decrypt_backup.py SebsSymptoms-2026-11-08-2100.ssbk [output-folder]

The output is NOT encrypted. Keep it somewhere private, and never put it in the git repo.
"""
import getpass
import hashlib
import json
import pathlib
import struct
import sys
import unicodedata

try:
    from cryptography.exceptions import InvalidTag
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    sys.exit("Needs the 'cryptography' package:  pip install cryptography")

MAGIC = b"SSBK"
HEADER_LEN = 37


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = pathlib.Path(sys.argv[1])
    out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_suffix("")
    blob = src.read_bytes()
    if blob[:4] != MAGIC:
        sys.exit("Not a Seb's Symptoms backup file.")
    if blob[4] != 1:
        sys.exit(f"Unsupported backup format {blob[4]}.")
    iterations = struct.unpack(">I", blob[5:9])[0]
    salt, iv, header = blob[9:25], blob[25:37], blob[:HEADER_LEN]

    if sys.stdin.isatty():
        passphrase = getpass.getpass("Backup passphrase: ")
    else:
        passphrase = sys.stdin.readline().rstrip("\n")
    key = hashlib.pbkdf2_hmac("sha256", unicodedata.normalize("NFC", passphrase).encode(), salt, iterations, 32)
    try:
        plain = AESGCM(key).decrypt(iv, blob[HEADER_LEN:], header)
    except InvalidTag:
        sys.exit("Wrong passphrase, or the file is damaged.")

    n = struct.unpack(">I", plain[:4])[0]
    data = json.loads(plain[4:4 + n].decode("utf-8"))
    base = 4 + n

    photos_dir = out / "photos"
    photos_dir.mkdir(parents=True, exist_ok=True)
    names = {}
    for p in data["photos"]:
        start = base + p["off"]
        names[p["id"]] = f"photos/{p['id']}.jpg"
        (out / names[p["id"]]).write_bytes(plain[start:start + p["len"]])
    # Point entries and products at their photo files, and drop the internal byte offsets.
    for item in data["entries"] + data["products"]:
        if item.get("photoId") in names:
            item["photoFile"] = names[item["photoId"]]
    data["photos"] = [{k: v for k, v in p.items() if k not in ("off", "len", "toff", "tlen")} for p in data["photos"]]

    (out / "data.json").write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Decrypted {len(data['entries'])} entries, {len(data['products'])} products, "
          f"{len(data['photos'])} photos -> {out}/")


if __name__ == "__main__":
    main()
