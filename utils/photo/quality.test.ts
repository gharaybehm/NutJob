import { describe, expect, it } from "vitest";
import { assessPhoto, measure, sampleSize, type Pixels } from "./quality";

const W = 128;
const H = 96;
const BIG = { width: 1600, height: 1200 };

/** An image whose brightness at (x, y) is given by `luma`. */
function image(luma: (x: number, y: number) => number, w = W, h = H): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = luma(x, y);
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

/** Fine checkerboard: as sharp as an image gets. */
const sharp = (x: number, y: number) => ((x + y) % 2 ? 190 : 70);
/** Slow ramp: no fine detail at all. */
const smooth = (x: number) => 100 + (x / W) * 60;
const inCentre = (x: number, y: number) => x >= W * 0.25 && x < W * 0.75 && y >= H * 0.25 && y < H * 0.75;
/** A little wider than the centre, so the soft area's edge falls outside it. */
const aroundCentre = (x: number, y: number) => x >= W * 0.2 && x < W * 0.8 && y >= H * 0.2 && y < H * 0.8;

describe("assessPhoto", () => {
  it("passes a sharp, well-lit photo", () => {
    const r = assessPhoto(BIG, image(sharp));
    expect(r.blocking).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("refuses a photo that is too small, whatever its content", () => {
    expect(assessPhoto({ width: 640, height: 480 }, image(sharp)).blocking).toEqual(["too_small"]);
    expect(assessPhoto({ width: 1280, height: 719 }, image(sharp)).blocking).toEqual(["too_small"]);
    expect(assessPhoto({ width: 1280, height: 720 }, image(sharp)).blocking).toEqual([]);
  });

  it("refuses a dark photo", () => {
    expect(assessPhoto(BIG, image((x, y) => ((x + y) % 2 ? 25 : 5))).blocking).toEqual(["too_dark"]);
  });

  it("refuses a photo that is mostly black even when the rest is bright", () => {
    const r = assessPhoto(BIG, image((x, y) => (x < W * 0.7 ? 5 : sharp(x, y) + 60)));
    expect(r.blocking).toEqual(["too_dark"]);
  });

  it("refuses a washed-out photo", () => {
    expect(assessPhoto(BIG, image((x, y) => ((x + y) % 2 ? 255 : 245))).blocking).toEqual(["too_bright"]);
  });

  it("warns about a photo with no fine detail, without refusing it", () => {
    const r = assessPhoto(BIG, image(smooth));
    expect(r.blocking).toEqual([]);
    expect(r.warnings).toEqual(["blurred"]);
  });

  it("warns when the middle is soft and the surroundings are sharp", () => {
    const r = assessPhoto(BIG, image((x, y) => (aroundCentre(x, y) ? 130 : sharp(x, y))));
    expect(r.blocking).toEqual([]);
    expect(r.warnings).toEqual(["subject_soft"]);
  });

  it("does not warn when the middle is sharp and the background is soft", () => {
    const r = assessPhoto(BIG, image((x, y) => (inCentre(x, y) ? sharp(x, y) : 130)));
    expect(r.warnings).toEqual([]);
  });
});

describe("measure", () => {
  it("reports brightness and the black and white shares", () => {
    const m = measure(image((x) => (x < W / 2 ? 0 : 255)));
    expect(m.brightness).toBeCloseTo(127.5, 0);
    expect(m.darkShare).toBeCloseTo(0.5, 2);
    expect(m.brightShare).toBeCloseTo(0.5, 2);
  });

  it("gives zero sharpness for a flat image and survives a tiny one", () => {
    expect(measure(image(() => 120)).sharpness).toBe(0);
    expect(measure(image(() => 120, 2, 2)).sharpness).toBe(0);
  });
});

describe("sampleSize", () => {
  it("fits the long side and never enlarges", () => {
    expect(sampleSize(4000, 3000)).toEqual({ width: 512, height: 384 });
    expect(sampleSize(720, 1280)).toEqual({ width: 288, height: 512 });
    expect(sampleSize(300, 200)).toEqual({ width: 300, height: 200 });
  });
});
