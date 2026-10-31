// @feat:media-resumable-uploads
// Findings from the review of #559: each of these failed before its fix.
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesOf, setup } from "../../server/__tests__/helpers";
import { fromBytes } from "../sources";
import { UploadClientError, createUploader } from "../uploader";

const ENDPOINT = "https://app.example.com/uploads";

afterEach(() => vi.restoreAllMocks());

function uploaderFor(s: ReturnType<typeof setup>, over: Partial<Parameters<typeof createUploader>[0]> = {}, intercept?: (method: string, path: string) => Response | undefined) {
  const fetch = (async (input: string, init: RequestInit = {}) => {
    const path = String(input).slice(ENDPOINT.length) || "/";
    const forced = intercept?.(init.method ?? "GET", path);
    if (forced) return forced;
    return s.handler(new Request(String(input), { ...init, headers: { ...(init.headers as Record<string, string>), "x-test-owner": "alice" } }));
  }) as unknown as typeof globalThis.fetch;
  return createUploader({ endpoint: ENDPOINT, fetch, sleep: async () => {}, retries: 1, ...over });
}

describe("the uploader", () => {
  it("a finalize answered 200 while still verifying waits for the read-back instead of calling it done", async () => {
    const s = setup();
    const seen: string[] = [];
    let id = "";
    const status = (state: string) => new Response(JSON.stringify({ uploadId: id, state, size: 10, partSize: 4, parts: [], targets: ["working"], expiresAt: "2026-11-08T00:00:00Z", ...(state === "done" ? { copies: [{ target: "working", key: "k", size: 10, sha256: "x", verifiedAt: "t" }] } : {}) }), { status: 200 });
    const uploader = uploaderFor(s, {}, (method, path) => {
      if (method === "POST" && path.endsWith("/finalize")) {
        id = path.split("/")[1]!;
        seen.push("finalize");
        // Another tab's finalize got there first: the session is verifying.
        return status("verifying");
      }
      if (method === "GET" && id && path === `/${id}`) {
        seen.push("poll");
        return status(seen.filter((x) => x === "poll").length < 2 ? "verifying" : "done");
      }
      return undefined;
    });
    const result = await uploader.upload(fromBytes(bytesOf(10)), { name: "a.bin", contentType: "a/b", purpose: "media" }).done;
    expect(seen).toEqual(["finalize", "poll", "poll"]);
    expect(result.state).toBe("done");
    expect(result.copies).toHaveLength(1);
  });

  it("an upload whose signal had already fired rejects, and never starts", async () => {
    const s = setup();
    const uploader = uploaderFor(s);
    const done = uploader.upload(fromBytes(bytesOf(10)), { name: "a.bin", contentType: "a/b", purpose: "media", signal: AbortSignal.abort() }).done;
    await expect(done).rejects.toMatchObject({ code: "cancelled" });
    expect(s.store.sessions.size).toBe(0);
  });

  it("a pause leaves no abort listener behind once it is over", async () => {
    const add = vi.spyOn(AbortSignal.prototype, "addEventListener");
    const remove = vi.spyOn(AbortSignal.prototype, "removeEventListener");
    const s = setup();
    const uploader = uploaderFor(s);
    const handle = uploader.upload(fromBytes(bytesOf(10)), { name: "a.bin", contentType: "a/b", purpose: "media" });
    handle.pause();
    await new Promise((r) => setTimeout(r, 20));
    const pausedAdds = add.mock.calls.filter(([type]) => type === "abort").length;
    handle.resume();
    expect((await handle.done).state).toBe("done");
    expect(pausedAdds).toBeGreaterThan(0);
    expect(remove.mock.calls.filter(([type]) => type === "abort").length).toBeGreaterThan(0);
  });

  it("a status that is still open or verifying is never reported as a result", async () => {
    const s = setup();
    const uploader = uploaderFor(s, {}, (method, path) =>
      method === "POST" && path.endsWith("/finalize")
        ? new Response(JSON.stringify({ uploadId: path.split("/")[1], state: "open", size: 10, partSize: 4, parts: [], targets: ["working"], expiresAt: "2026-11-08T00:00:00Z" }), { status: 200 })
        : undefined,
    );
    const error = await uploader.upload(fromBytes(bytesOf(10)), { name: "a.bin", contentType: "a/b", purpose: "media" }).done.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UploadClientError);
  });
});
