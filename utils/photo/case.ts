// What a photo case is, shared by the device queue, the server actions and the
// migration's checks: one observation of one problem on one tree, 1 to 3 photos.

export const PHOTO_BUCKET = "plant-photos";
export const MAX_PHOTOS = 3;
export const MAX_NOTE_CHARS = 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

/** Where photo `n` (1 to 3) of a case is stored. The storage policies depend on this shape. */
export function photoPath(farmId: string, caseId: string, n: number): string {
  return `${farmId}/${caseId}/${n}.jpg`;
}

/** The paths a case with `count` photos must have, in order. */
export function photoPaths(farmId: string, caseId: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => photoPath(farmId, caseId, i + 1));
}

/** True when `paths` are exactly the paths of this case: nothing from another case or farm. */
export function pathsBelongToCase(farmId: string, caseId: string, paths: unknown): paths is string[] {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > MAX_PHOTOS) return false;
  const expected = photoPaths(farmId, caseId, paths.length);
  return paths.every((p, i) => p === expected[i]);
}

/** A new case id. `crypto.randomUUID` exists only on https and localhost, so fall back to random bytes. */
export function newCaseId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
