// Browser side of a photo case: decode the file the camera or the library
// gave, check it (utils/photo/quality.ts), and make the copy that is stored
// and uploaded. Drawing to a canvas and re-encoding drops EXIF, including GPS.

import { assessPhoto, sampleSize, type QualityReport } from "./quality";

/** Long side of the stored copy. */
export const UPLOAD_SIDE_PX = 1600;
export const UPLOAD_JPEG_QUALITY = 0.85;
/** The bucket refuses anything larger; see the photo cases migration. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export interface PreparedPhoto {
  /** JPEG bytes, kept as a buffer so they can be stored in IndexedDB everywhere. */
  bytes: ArrayBuffer;
  width: number;
  height: number;
  report: QualityReport;
}

export type PrepareError = "unreadable" | "too_large";

function canvasOf(source: ImageBitmap, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function preparePhoto(file: Blob): Promise<{ ok: true; photo: PreparedPhoto } | { ok: false; error: PrepareError }> {
  let bitmap: ImageBitmap;
  try {
    // 'from-image' applies the EXIF rotation, so portrait photos stay upright.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { ok: false, error: "unreadable" };
  }

  try {
    const sample = sampleSize(bitmap.width, bitmap.height);
    const sampleCanvas = canvasOf(bitmap, sample.width, sample.height);
    const pixels = sampleCanvas.getContext("2d")!.getImageData(0, 0, sample.width, sample.height);
    const report = assessPhoto({ width: bitmap.width, height: bitmap.height }, { width: sample.width, height: sample.height, data: pixels.data });

    const scale = Math.min(1, UPLOAD_SIDE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = canvasOf(bitmap, width, height);

    // A very detailed photo can exceed the limit at the usual quality; step down once or twice.
    for (const quality of [UPLOAD_JPEG_QUALITY, 0.7, 0.55]) {
      const blob = await toJpeg(canvas, quality);
      if (!blob) return { ok: false, error: "unreadable" };
      if (blob.size <= MAX_UPLOAD_BYTES) {
        return { ok: true, photo: { bytes: await blob.arrayBuffer(), width, height, report } };
      }
    }
    return { ok: false, error: "too_large" };
  } catch {
    return { ok: false, error: "unreadable" };
  } finally {
    bitmap.close();
  }
}
