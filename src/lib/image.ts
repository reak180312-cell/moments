/**
 * Preparing a photo for the family record.
 *
 * A picture straight off a phone is several megabytes. It gets scaled down and
 * re-encoded here before it goes anywhere, so the record stays small and loads
 * quickly on a slow connection. The original on the phone is untouched.
 */

const MAX_SIDE = 1400;
const QUALITY = 0.82;

export async function fileToJpegBase64(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not a picture.');
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not prepare the picture.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY)
  );
  if (!blob) throw new Error('This browser could not prepare the picture.');

  if (blob.size > 3_000_000) {
    throw new Error('That picture is still too large. Try a smaller one.');
  }

  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  buffer.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}
