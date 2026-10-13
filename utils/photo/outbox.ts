// The device queue for photo cases (Requirements.md, Photo cases: weak
// coverage). A case is written here before any network call, so nothing is
// lost when the signal drops, and sent when there is a connection.
//
// Sending is safe to repeat: the case id is made on the device, a photo that
// is already stored counts as uploaded, and the server ignores a case it
// already has. So a send cut off half way is simply run again.
//
// There is no Background Sync: iPhone Safari does not have it. The queue is
// flushed on save, when the browser comes back online and when the app is
// opened or brought to the front (see PhotoCaseProvider).

import { photoPaths } from "./case";

const DB_NAME = "nutjob-photo-cases";
const STORE = "outbox";

/** Waiting cases one device may hold: about 30 MB at three photos each. */
export const MAX_WAITING = 20;

export type OutboxState = "waiting" | "sending" | "failed";

export interface OutboxCase {
  /** UUID made on the device; also the id of the case on the server. */
  id: string;
  farmId: string;
  /** Who saved it. A shared phone sends each person's cases only under their own sign-in. */
  userId: string;
  blockId: string;
  blockName: string;
  note: string;
  /** ISO time the case was saved on the device. */
  takenAt: string;
  /** Prepared JPEGs. Buffers, not Blobs: older Safari cannot store Blobs in IndexedDB. */
  photos: ArrayBuffer[];
  state: OutboxState;
}

/** What the queue shows; the photo bytes stay in the store. */
export type OutboxEntry = Omit<OutboxCase, "photos"> & { photoCount: number };

/** 'retry' = no connection or a passing fault; 'refused' = the server will never take it. */
export type SendStep = "ok" | "retry" | "refused";

export interface Transport {
  /** Stores one photo. Must answer 'ok' when the photo is already there. */
  upload(path: string, bytes: ArrayBuffer): Promise<SendStep>;
  /** Records the case. Must answer 'ok' when the case is already recorded. */
  submit(c: { farmId: string; blockId: string; caseId: string; paths: string[]; takenAt: string; note: string }): Promise<SendStep>;
}

function open(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(idb: IDBFactory, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open(idb);
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const all = (idb: IDBFactory) => withStore<OutboxCase[]>(idb, "readonly", (s) => s.getAll());
const put = (idb: IDBFactory, c: OutboxCase) => withStore(idb, "readwrite", (s) => s.put(c));

/** Adds a case to the queue. 'full' when the device already holds MAX_WAITING. */
export async function addCase(c: Omit<OutboxCase, "state">, idb: IDBFactory = indexedDB): Promise<"added" | "full"> {
  if ((await all(idb)).length >= MAX_WAITING) return "full";
  await put(idb, { ...c, state: "waiting" });
  return "added";
}

const mine = (farmId: string, userId: string) => (c: OutboxCase) => c.farmId === farmId && c.userId === userId;

/** The cases this user still has on this device for one farm, oldest first. */
export async function listCases(farmId: string, userId: string, idb: IDBFactory = indexedDB): Promise<OutboxEntry[]> {
  return (await all(idb))
    .filter(mine(farmId, userId))
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt))
    .map(({ photos, ...rest }) => ({ ...rest, photoCount: photos.length }));
}

export async function removeCase(id: string, idb: IDBFactory = indexedDB): Promise<void> {
  await withStore(idb, "readwrite", (s) => s.delete(id));
}

/** Puts a refused case back in line, for the user's "Try again". */
export async function retryCase(id: string, idb: IDBFactory = indexedDB): Promise<void> {
  const c = (await all(idb)).find((x) => x.id === id);
  if (c && c.state === "failed") await put(idb, { ...c, state: "waiting" });
}

async function sendCase(c: OutboxCase, transport: Transport, idb: IDBFactory): Promise<"sent" | "waiting" | "failed"> {
  await put(idb, { ...c, state: "sending" });
  const finish = async (step: SendStep): Promise<"waiting" | "failed"> => {
    const state = step === "refused" ? "failed" : "waiting";
    await put(idb, { ...c, state });
    return state;
  };

  const paths = photoPaths(c.farmId, c.id, c.photos.length);
  try {
    for (let i = 0; i < paths.length; i++) {
      const step = await transport.upload(paths[i], c.photos[i]);
      if (step !== "ok") return finish(step);
    }
    const step = await transport.submit({ farmId: c.farmId, blockId: c.blockId, caseId: c.id, paths, takenAt: c.takenAt, note: c.note });
    if (step !== "ok") return finish(step);
  } catch {
    return finish("retry");
  }
  await removeCase(c.id, idb);
  return "sent";
}

export interface FlushResult {
  sent: number;
  waiting: number;
  failed: number;
}

let running: Promise<FlushResult> | null = null;

/**
 * Sends what this user has waiting for one farm, oldest first, and stops at the first
 * case that cannot get through so a dead connection is tried once, not twenty
 * times. A case left in 'sending' by a closed app is picked up again. Calls
 * made while a flush is running share its result.
 */
export function flush(farmId: string, userId: string, transport: Transport, idb: IDBFactory = indexedDB): Promise<FlushResult> {
  if (running) return running;
  running = (async () => {
    const cases = (await all(idb)).filter(mine(farmId, userId)).sort((a, b) => a.takenAt.localeCompare(b.takenAt));
    const result: FlushResult = { sent: 0, waiting: 0, failed: 0 };
    let stopped = false;
    for (const c of cases) {
      if (c.state === "failed") result.failed++;
      else if (stopped) result.waiting++;
      else {
        const outcome = await sendCase(c, transport, idb);
        result[outcome]++;
        if (outcome === "waiting") stopped = true;
      }
    }
    return result;
  })().finally(() => {
    running = null;
  });
  return running;
}
