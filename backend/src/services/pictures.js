import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import { AppError } from '../middleware/errors.js';

const ALLOWED = new Set(['jpeg', 'png', 'webp']);
const MAX_SIDE_IN = 4096;
const OUT_SIDE = 512;
const PHOTO_SIZE = { width: 1280, height: 720 };

/**
 * Validates an uploaded image by its content (not its name or declared type), re-encodes it to a
 * 512 px WebP (metadata such as EXIF GPS is dropped) and stores it under a random file name.
 * Returns the public URL path.
 */
export async function storeProfilePicture(buffer, uploadDir) {
  return storeImage(buffer, uploadDir, { width: OUT_SIDE, height: OUT_SIDE });
}

/** The same checks for a quest photo, kept at 16:9 so the carousel looks even. */
export async function storeQuestPhoto(buffer, uploadDir) {
  return storeImage(buffer, uploadDir, PHOTO_SIZE);
}

async function storeImage(buffer, uploadDir, { width, height }) {
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
    .resize(width, height, { fit: 'cover' })
    .webp({ quality: 82 })
    .toBuffer();
  await mkdir(uploadDir, { recursive: true });
  const name = `${randomBytes(16).toString('hex')}.webp`;
  await writeFile(join(uploadDir, name), output);
  return `/uploads/${name}`;
}

/**
 * Removes an uploaded picture that nothing uses any more (replaced profile or team picture, erased quest photo).
 * Only files under /uploads/ are touched; a file that is already gone is fine; any other failure is logged.
 */
export async function deleteUpload(uploadDir, url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return;
  try {
    await rm(join(uploadDir, basename(url)), { force: true });
  } catch (error) {
    console.error('[uploads] could not delete an unused file:', error.code ?? error.message);
  }
}
