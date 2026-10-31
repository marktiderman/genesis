// @feat:media-resumable-uploads
// Findings from the review of #559: each of these failed before its fix.
import { describe, expect, it } from "vitest";
import type { UploadStatus } from "../../protocol";
import { bytesOf, sendAll, setup } from "./helpers";

const json = async <T = Record<string, unknown>>(r: Response) => (await r.json()) as T;

describe("finalize", () => {
  it("a finalize that loses the race to another answers 202 while the upload is still being checked", async () => {
    const s = setup();
    const { id } = await sendAll(s, bytesOf(10));
    const update = s.store.update;
    s.store.update = async (uploadId, patch, when, holder) => {
      // Another tab's finalize moves it on between this one's load and its compare-and-set.
      if (patch.state === "verifying" && when?.includes("open")) await update(uploadId, { state: "verifying", verifyingSince: new Date(s.now()).toISOString() }, ["open"]);
      return update(uploadId, patch, when, holder);
    };
    const res = await s.alice.finalize(id);
    expect(res.status).toBe(202);
    expect((await json<UploadStatus>(res)).state).toBe("verifying");
  });
});

describe("the verify run", () => {
  it("a copy that failed after it was made is removed, that exact version, before the retry copies again", async () => {
    const s = setup();
    const { id } = await sendAll(s, bytesOf(10));
    const lock = s.archive.lock!;
    let fails = 1;
    s.archive.lock = async (key, versionId) => {
      if (fails-- > 0) throw new Error("retention refused");
      return lock(key, versionId);
    };
    expect((await json<UploadStatus>(await s.alice.finalize(id))).state).toBe("partial");
    const key = s.store.sessions.get(id)!.key;
    expect([...s.archive.versions.keys()].filter((k) => k.startsWith(`${key}#`))).toHaveLength(1);
    expect((await json<UploadStatus>(await s.alice.finalize(id))).state).toBe("done");
    // Only the copy that verified is left: the first one didn't stay behind as an old version.
    expect([...s.archive.versions.keys()].filter((k) => k.startsWith(`${key}#`))).toHaveLength(1);
  });

  it("records each copy as soon as it is locked, so a run that dies before the end leaves it as media", async () => {
    const s = setup();
    const { id } = await sendAll(s, bytesOf(10));
    const update = s.store.update;
    s.store.update = async (uploadId, patch, when, holder) => {
      // The run dies at its last step.
      if (patch.state === "done" || patch.state === "partial") throw new Error("worker killed");
      return update(uploadId, patch, when, holder);
    };
    expect((await s.alice.finalize(id)).status).toBe(503);
    const session = s.store.sessions.get(id)!;
    expect(session.state).toBe("verifying");
    expect(session.copies.map((c) => c.target).sort()).toEqual(["archive", "working"]);
    expect(s.archive.locks.size).toBe(1);
  });

  it("a copy finished just as the lease went is removed by its version, not left pointing nowhere", async () => {
    const s = setup();
    const { id } = await sendAll(s, bytesOf(10));
    const update = s.store.update;
    s.store.update = async (uploadId, patch, when, holder) => {
      // Another run took the lease just as the archive copy finished.
      if (holder !== undefined && patch.assembled?.archive) return false;
      return update(uploadId, patch, when, holder);
    };
    expect((await s.alice.finalize(id)).status).toBe(202);
    const key = s.store.sessions.get(id)!.key;
    expect([...s.archive.versions.keys()].filter((k) => k.startsWith(`${key}#`))).toEqual([]);
  });
});
