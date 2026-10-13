// How the device queue reads the answers it gets back: sent, try again later,
// or never going to be accepted. Kept apart from the queue and from the
// browser clients so it can be tested.

import type { SendStep } from "./outbox";

/** The parts of a storage error the upload looks at. */
export interface UploadError {
  message?: string;
  status?: number;
  statusCode?: string | number;
}

/** What an upload's outcome means for the queue. `null` is success. */
export function uploadStep(error: UploadError | null | undefined): SendStep {
  if (!error) return "ok";
  const status = Number(error.statusCode ?? error.status);
  const message = error.message ?? "";

  // The photo is already there from an earlier, interrupted send.
  if (status === 409 || /already exists|duplicate/i.test(message)) return "ok";
  // A sign-in that ran out while the phone was offline: signing in again fixes it.
  if (status === 401 || /jwt|token|unauthori[sz]ed/i.test(message)) return "retry";
  // Not a member, wrong path, too large or not a JPEG: repeating will not help.
  if ([400, 403, 413, 415, 422].includes(status) || /row-level security|mime type|maximum allowed size/i.test(message)) return "refused";
  // Anything else is taken as no connection or a passing fault.
  return "retry";
}

/** What the server's answer to recording a case means for the queue. */
export function submitStep(result: { ok: true } | { ok: false; error: string }): SendStep {
  if (result.ok) return "ok";
  return result.error === "forbidden" || result.error === "invalid" ? "refused" : "retry";
}
