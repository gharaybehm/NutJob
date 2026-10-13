// On-device photo check, run before a photo is queued or uploaded
// (Requirements.md, Photo cases). Pure functions over pixel data so the same
// code runs in the browser (canvas), in the calibration script (sharp) and in
// tests.
//
// A photo that is too small, too dark or washed out is refused. Blur is only
// a warning: a sharp background behind a soft leaf passes a whole-frame
// measure, and a soft subject (bark, gum) can fail it, so the user decides.
// The thresholds were set with scripts/calibrate-photo-quality.ts on field
// photos and on blurred and darkened copies of them.

/** RGBA pixels of the analysis copy (long side SAMPLE_SIDE_PX). */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export type QualityIssue = "too_small" | "too_dark" | "too_bright" | "blurred" | "subject_soft";

export interface QualityMetrics {
  /** Mean brightness, 0 to 255. */
  brightness: number;
  /** Share of pixels that are nearly black, 0 to 1. */
  darkShare: number;
  /** Share of pixels that are nearly white, 0 to 1. */
  brightShare: number;
  /** Variance of the Laplacian over the whole frame: higher is sharper. */
  sharpness: number;
  /** The same over the middle of the frame, where the subject usually is. */
  centreSharpness: number;
  /** The same over the rest of the frame. */
  outerSharpness: number;
}

export interface QualityReport {
  /** Reasons the photo is refused. */
  blocking: QualityIssue[];
  /** Reasons to ask the user before using it. */
  warnings: QualityIssue[];
  metrics: QualityMetrics;
}

/** Long side of the copy the measures are taken on. */
export const SAMPLE_SIDE_PX = 512;

export const MIN_SHORT_SIDE_PX = 720;
export const MIN_BRIGHTNESS = 45;
export const MAX_DARK_SHARE = 0.6;
export const MAX_BRIGHTNESS = 215;
export const MAX_BRIGHT_SHARE = 0.5;
export const MIN_SHARPNESS = 100;
/** The centre counts as soft when it is this much less sharp than the rest... */
export const SOFT_CENTRE_RATIO = 0.25;
/** ...and is itself below this. */
export const SOFT_CENTRE_SHARPNESS = 120;

const DARK_LUMA = 30;
const BRIGHT_LUMA = 240;

export function measure(sample: Pixels): QualityMetrics {
  const { width: w, height: h, data } = sample;
  const n = w * h;
  const luma = new Float32Array(n);
  let sum = 0;
  let dark = 0;
  let bright = 0;
  for (let i = 0; i < n; i++) {
    const y = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    luma[i] = y;
    sum += y;
    if (y < DARK_LUMA) dark++;
    else if (y > BRIGHT_LUMA) bright++;
  }

  // Middle half of each side: a quarter of the area.
  const x0 = Math.floor(w * 0.25);
  const x1 = Math.ceil(w * 0.75);
  const y0 = Math.floor(h * 0.25);
  const y1 = Math.ceil(h * 0.75);

  // Sums for the variance of the 4-neighbour Laplacian, whole / centre / outer.
  const acc = { all: [0, 0, 0], centre: [0, 0, 0], outer: [0, 0, 0] };
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = luma[i - 1] + luma[i + 1] + luma[i - w] + luma[i + w] - 4 * luma[i];
      const part = x >= x0 && x < x1 && y >= y0 && y < y1 ? acc.centre : acc.outer;
      for (const a of [acc.all, part]) {
        a[0]++;
        a[1] += lap;
        a[2] += lap * lap;
      }
    }
  }
  const variance = ([count, s, sq]: number[]) => (count ? sq / count - (s / count) ** 2 : 0);

  return {
    brightness: n ? sum / n : 0,
    darkShare: n ? dark / n : 0,
    brightShare: n ? bright / n : 0,
    sharpness: variance(acc.all),
    centreSharpness: variance(acc.centre),
    outerSharpness: variance(acc.outer),
  };
}

/** `original` is the size of the photo as taken, before any downscaling. */
export function assessPhoto(original: { width: number; height: number }, sample: Pixels): QualityReport {
  const metrics = measure(sample);
  const blocking: QualityIssue[] = [];
  const warnings: QualityIssue[] = [];

  if (Math.min(original.width, original.height) < MIN_SHORT_SIDE_PX) blocking.push("too_small");
  if (metrics.brightness < MIN_BRIGHTNESS || metrics.darkShare > MAX_DARK_SHARE) blocking.push("too_dark");
  else if (metrics.brightness > MAX_BRIGHTNESS || metrics.brightShare > MAX_BRIGHT_SHARE) blocking.push("too_bright");

  if (metrics.sharpness < MIN_SHARPNESS) warnings.push("blurred");
  else if (
    metrics.centreSharpness < SOFT_CENTRE_SHARPNESS &&
    metrics.centreSharpness < metrics.outerSharpness * SOFT_CENTRE_RATIO
  ) {
    warnings.push("subject_soft");
  }

  return { blocking, warnings, metrics };
}

/** Size of the analysis copy for a photo of the given size. */
export function sampleSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, SAMPLE_SIDE_PX / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
