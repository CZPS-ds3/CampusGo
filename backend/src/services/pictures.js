import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { AppError } from '../middleware/errors.js';

const ALLOWED = new Set(['jpeg', 'png', 'webp']);
const MAX_SIDE_IN = 4096;
const OUT_SIDE = 512;

/**
 * Validates an uploaded image by its content (not its name or declared type), re-encodes it to a
 * 512 px WebP (metadata such as EXIF GPS is dropped) and stores it under a random file name.
 * Returns the public URL path.
 */
export async function storeProfilePicture(buffer, uploadDir) {
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new AppError(400, 'INVALID_IMAGE', 'Please upload a PNG, JPG or WebP image.');
  }
  if (
    !ALLOWED.has(meta.format) ||
    !meta.width ||
    !meta.height ||
    meta.width > MAX_SIDE_IN ||
    meta.height > MAX_SIDE_IN
  ) {
    throw new AppError(
      400,
      'INVALID_IMAGE',
      'Please upload a PNG, JPG or WebP image (at most 4096 x 4096 px).',
    );
  }
  const output = await sharp(buffer)
    .rotate()
    .resize(OUT_SIDE, OUT_SIDE, { fit: 'cover' })
    .webp({ quality: 82 })
    .toBuffer();
  await mkdir(uploadDir, { recursive: true });
  const name = `${randomBytes(16).toString('hex')}.webp`;
  await writeFile(join(uploadDir, name), output);
  return `/uploads/${name}`;
}
