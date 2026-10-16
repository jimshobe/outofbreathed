// Shrinks a photo on the device before upload, so posting from a phone sends ~0.5 MB instead of 3–5 MB.
// The caller reads the date and location from the original first and sends them as fields: the shrunken
// copy has no metadata at all. Returns null to mean "send the original" (unsupported or already small).

/** Longest edge sent to the server; it makes its own 1600 px display copy from this. */
export const UPLOAD_PX = 2048;

export async function shrink(file: File, maxPx = UPLOAD_PX): Promise<Blob | null> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return null; // e.g. HEIC on desktop: let the server convert
  let bitmap: ImageBitmap;
  try {
    // Applies the photo's rotation, so the pixels come out upright.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1_500_000) { bitmap.close(); return null; }
  const canvas = document.createElement('canvas') as unknown as HTMLCanvasElement;
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap.close(); return null; }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  canvas.width = canvas.height = 0; // free the memory promptly on phones
  return blob && blob.size < file.size ? blob : null;
}
