import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { addCase, flush, listCases, MAX_WAITING, removeCase, retryCase, type SendStep, type Transport } from "./outbox";
import { pathsBelongToCase, photoPath } from "./case";

const FARM = "11111111-1111-4111-8111-111111111111";
const OTHER_FARM = "22222222-2222-4222-8222-222222222222";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let idb: IDBFactory;
beforeEach(() => {
  idb = new IDBFactory();
});

function aCase(n: number, photos = 2, farmId = FARM, userId = USER) {
  return {
    id: id(n),
    farmId,
    userId,
    blockId: "B1",
    blockName: "Block 1",
    note: `note ${n}`,
    takenAt: new Date(Date.UTC(2026, 9, 12, 8, n)).toISOString(),
    photos: Array.from({ length: photos }, () => new Uint8Array([1, 2, 3]).buffer),
  };
}

/** A server that remembers what it was given, and can be told to fail. */
function server(script: { upload?: (path: string, call: number) => SendStep; submit?: (caseId: string, call: number) => SendStep } = {}) {
  const stored = new Set<string>();
  const cases = new Map<string, string[]>();
  let uploads = 0;
  let submits = 0;
  const transport: Transport = {
    async upload(path) {
      uploads++;
      const step = script.upload?.(path, uploads) ?? "ok";
      if (step === "ok") stored.add(path);
      return step;
    },
    async submit(c) {
      submits++;
      const step = script.submit?.(c.caseId, submits) ?? "ok";
      if (step === "ok" && !cases.has(c.caseId)) cases.set(c.caseId, c.paths);
      return step;
    },
  };
  return { transport, stored, cases, calls: () => ({ uploads, submits }) };
}

describe("photo case paths", () => {
  it("accepts only the paths of the case itself", () => {
    const own = [photoPath(FARM, id(1), 1), photoPath(FARM, id(1), 2)];
    expect(pathsBelongToCase(FARM, id(1), own)).toBe(true);
    expect(pathsBelongToCase(FARM, id(1), [photoPath(OTHER_FARM, id(1), 1)])).toBe(false);
    expect(pathsBelongToCase(FARM, id(1), [photoPath(FARM, id(2), 1)])).toBe(false);
    expect(pathsBelongToCase(FARM, id(1), [own[1], own[0]])).toBe(false);
    expect(pathsBelongToCase(FARM, id(1), [])).toBe(false);
    expect(pathsBelongToCase(FARM, id(1), [1, 2, 3, 4].map((n) => photoPath(FARM, id(1), n)))).toBe(false);
    expect(pathsBelongToCase(FARM, id(1), "x")).toBe(false);
  });
});

describe("outbox", () => {
  it("keeps a case on the device until it is sent, then removes it", async () => {
    expect(await addCase(aCase(1), idb)).toBe("added");
    expect(await listCases(FARM, USER, idb)).toMatchObject([{ id: id(1), state: "waiting", photoCount: 2, blockName: "Block 1" }]);

    const s = server();
    expect(await flush(FARM, USER, s.transport, idb)).toEqual({ sent: 1, waiting: 0, failed: 0 });
    expect(await listCases(FARM, USER, idb)).toEqual([]);
    expect([...s.stored]).toEqual([photoPath(FARM, id(1), 1), photoPath(FARM, id(1), 2)]);
    expect(s.cases.get(id(1))).toEqual([photoPath(FARM, id(1), 1), photoPath(FARM, id(1), 2)]);
  });

  it("refuses more than the device limit", async () => {
    for (let n = 0; n < MAX_WAITING; n++) expect(await addCase(aCase(n, 1), idb)).toBe("added");
    expect(await addCase(aCase(99, 1), idb)).toBe("full");
    await removeCase(id(0), idb);
    expect(await addCase(aCase(99, 1), idb)).toBe("added");
  });

  it("leaves everything waiting when there is no connection, trying only once", async () => {
    await addCase(aCase(1), idb);
    await addCase(aCase(2), idb);
    const s = server({ upload: () => "retry" });
    expect(await flush(FARM, USER, s.transport, idb)).toEqual({ sent: 0, waiting: 2, failed: 0 });
    expect(s.calls().uploads).toBe(1);
    expect((await listCases(FARM, USER, idb)).map((c) => c.state)).toEqual(["waiting", "waiting"]);
  });

  it("repeats a send cut off half way and ends with the case recorded once", async () => {
    await addCase(aCase(1, 3), idb);
    // Second photo fails the first time round.
    const s = server({ upload: (_p, call) => (call === 2 ? "retry" : "ok") });
    expect(await flush(FARM, USER, s.transport, idb)).toEqual({ sent: 0, waiting: 1, failed: 0 });
    expect(s.cases.size).toBe(0);

    expect(await flush(FARM, USER, s.transport, idb)).toEqual({ sent: 1, waiting: 0, failed: 0 });
    expect(s.stored.size).toBe(3);
    expect(s.cases.size).toBe(1);
  });

  it("keeps the case when the photos went up but recording it failed", async () => {
    await addCase(aCase(1), idb);
    const s = server({ submit: (_c, call) => (call === 1 ? "retry" : "ok") });
    expect((await flush(FARM, USER, s.transport, idb)).waiting).toBe(1);
    expect((await flush(FARM, USER, s.transport, idb)).sent).toBe(1);
    expect(s.cases.size).toBe(1);
  });

  it("treats a thrown error as no connection", async () => {
    await addCase(aCase(1), idb);
    const transport: Transport = {
      upload: async () => {
        throw new Error("network");
      },
      submit: async () => "ok",
    };
    expect(await flush(FARM, USER, transport, idb)).toEqual({ sent: 0, waiting: 1, failed: 0 });
    expect((await listCases(FARM, USER, idb))[0].state).toBe("waiting");
  });

  it("sets a refused case aside, sends the rest, and retries it only when asked", async () => {
    await addCase(aCase(1), idb);
    await addCase(aCase(2), idb);
    const s = server({ submit: (caseId) => (caseId === id(1) ? "refused" : "ok") });
    expect(await flush(FARM, USER, s.transport, idb)).toEqual({ sent: 1, waiting: 0, failed: 1 });
    expect(await listCases(FARM, USER, idb)).toMatchObject([{ id: id(1), state: "failed" }]);

    const before = s.calls().submits;
    expect(await flush(FARM, USER, s.transport, idb)).toEqual({ sent: 0, waiting: 0, failed: 1 });
    expect(s.calls().submits).toBe(before);

    await retryCase(id(1), idb);
    expect((await listCases(FARM, USER, idb))[0].state).toBe("waiting");
  });

  it("sends only the farm that is open", async () => {
    await addCase(aCase(1), idb);
    await addCase(aCase(2, 1, OTHER_FARM), idb);
    const s = server();
    expect(await flush(FARM, USER, s.transport, idb)).toEqual({ sent: 1, waiting: 0, failed: 0 });
    expect(await listCases(OTHER_FARM, USER, idb)).toHaveLength(1);
  });

  it("leaves another person's cases on a shared phone for their own sign-in", async () => {
    await addCase(aCase(1), idb);
    await addCase(aCase(2, 1, FARM, OTHER_USER), idb);
    const s = server();
    expect(await flush(FARM, USER, s.transport, idb)).toEqual({ sent: 1, waiting: 0, failed: 0 });
    expect([...s.cases.keys()]).toEqual([id(1)]);
    expect(await listCases(FARM, USER, idb)).toEqual([]);
    expect(await listCases(FARM, OTHER_USER, idb)).toHaveLength(1);
  });

  it("does not send twice when two flushes start together", async () => {
    await addCase(aCase(1), idb);
    const s = server();
    const [a, b] = await Promise.all([flush(FARM, USER, s.transport, idb), flush(FARM, USER, s.transport, idb)]);
    expect(a).toEqual(b);
    expect(s.calls()).toEqual({ uploads: 2, submits: 1 });
  });
});
