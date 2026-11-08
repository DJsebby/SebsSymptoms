// Shrinks photos before storing them. Re-encoding through a canvas also strips
// all metadata (including GPS location) from the original camera file.

export async function compressImage(file, maxDim = 1600, quality = 0.82, thumbDim = 360) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const full = await draw(img, maxDim, quality);
    const thumb = await draw(img, thumbDim, 0.72);
    return { type: 'image/jpeg', data: full.buf, w: full.w, h: full.h, thumb: thumb.buf };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Rebuilds a small preview image (used when restoring from a backup).
export async function makeThumb(bytes, type = 'image/jpeg') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return (await draw(img, 360, 0.72)).buf;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function draw(img, maxDim, quality) {
  const sw = img.naturalWidth, sh = img.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not process the photo'))), 'image/jpeg', quality));
  canvas.width = canvas.height = 0; // release memory straight away (iOS is strict about canvas memory)
  return { buf: await blob.arrayBuffer(), w, h };
}
