/**
 * Image upload library — generic, reusable across image types.
 *
 * Provides:
 *   - Client-side resize + compress (configurable max width and quality)
 *   - Upload to any Supabase storage bucket
 *   - Public URL generation
 *   - Safe delete by URL (path extraction)
 *
 * Usage patterns:
 *
 *   // Define a typed "image slot" once per use case
 *   export const questionImages = createImageSlot({
 *     bucket: 'question-images',
 *     maxWidth: 1600,
 *     quality: 0.85,
 *   });
 *
 *   // Then use it anywhere
 *   const { url } = await questionImages.upload(file);
 *   await questionImages.delete(url);
 */

import { supabase } from './supabase-client';

// ── Types ──

export interface ImageSlotConfig {
  /** Storage bucket name. Must exist with public-read policies. */
  bucket: string;
  /** Max image width in pixels (height scales proportionally). Default 1600. */
  maxWidth?: number;
  /** JPEG quality 0-1. Default 0.85. */
  quality?: number;
  /**
   * Optional path prefix inside the bucket. E.g., 'positions/' for per-position folders.
   * Defaults to '' (flat).
   */
  pathPrefix?: string;
  /**
   * Optional filename generator. Defaults to `crypto.randomUUID() + '.jpg'`.
   * Useful for per-entity folders: `(ctx) => \`\${ctx.entityId}/\${crypto.randomUUID()}.jpg\``
   */
  makeFilename?: (ctx: UploadContext) => string;
}

export interface UploadContext {
  /** The original filename the user selected. */
  originalName: string;
  /** Any extra metadata the caller wants to attach. */
  [key: string]: unknown;
}

export interface UploadResult {
  /** Publicly accessible URL. */
  url: string;
  /** Bucket-relative path (used for deletion later). */
  path: string;
}

export interface ImageSlot {
  upload(file: File, context?: Partial<UploadContext>): Promise<UploadResult>;
  delete(publicUrl: string): Promise<void>;
  /** The config, in case consumers need to inspect bucket name, etc. */
  config: Required<ImageSlotConfig>;
}

// ── Factory ──

/**
 * Create a reusable upload slot for a specific storage bucket + config.
 *
 * Once-per-use-case. Consumer modules (question-images.ts, position-images.ts)
 * should each create their own slot and export it.
 */
export function createImageSlot(config: ImageSlotConfig): ImageSlot {
  const resolved: Required<ImageSlotConfig> = {
    bucket:       config.bucket,
    maxWidth:     config.maxWidth ?? 1600,
    quality:      config.quality ?? 0.85,
    pathPrefix:   config.pathPrefix ?? '',
    makeFilename: config.makeFilename ?? ((_ctx) => `${crypto.randomUUID()}.jpg`),
  };

  return {
    config: resolved,

    async upload(file: File, context: Partial<UploadContext> = {}): Promise<UploadResult> {
      if (!file.type.startsWith('image/')) {
        throw new Error('File must be an image');
      }

      const blob = await resizeImage(file, resolved.maxWidth, resolved.quality);

      const ctx: UploadContext = {
        originalName: file.name,
        ...context,
      };
      const filename = resolved.makeFilename(ctx);
      const fullPath = resolved.pathPrefix + filename;

      const { error } = await supabase.storage
        .from(resolved.bucket)
        .upload(fullPath, blob, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        throw new Error(`Upload failed: ${error.message}`);
      }

      const { data } = supabase.storage.from(resolved.bucket).getPublicUrl(fullPath);
      return { url: data.publicUrl, path: fullPath };
    },

    async delete(publicUrl: string): Promise<void> {
      const path = extractPathFromPublicUrl(publicUrl, resolved.bucket);
      if (!path) return;

      // Errors are swallowed — orphaned files are acceptable in exchange for
      // robustness during deletion flows. Storage RLS will block unauthorized
      // deletes anyway.
      await supabase.storage.from(resolved.bucket).remove([path]).catch(() => {});
    },
  };
}

// ── Internal helpers ──

/**
 * Extract bucket-relative path from a Supabase public URL.
 * URL shape: https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
 */
function extractPathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

/**
 * Draw the image to a canvas at max width (preserving aspect ratio),
 * return a JPEG Blob at given quality.
 */
async function resizeImage(file: File, maxWidth: number, quality: number): Promise<Blob> {
  const img = await loadImage(file);

  const scale = img.width > maxWidth ? maxWidth / img.width : 1;
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  // White bg for transparent PNGs — JPEG has no alpha
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Canvas encoding failed'));
        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load image'));
    };
    img.src = url;
  });
}