// @feat:media-resumable-uploads
// The two medium findings from the re-review of #551: native runtimes without crypto or btoa,
// and the speed cap with several parts in flight.
import { afterEach, describe, expect, it, vi } from "vitest";
import { toBase64 } from "../../protocol";
import { bytesOf, setup } from "../../server/__tests__/helpers";
import { createSpeedLimiter } from "../config";
import { fromBytes } from "../sources";
import { UploadClientError, createUploader } from "../uploader";

const ENDPOINT = "https://app.example.com/uploads";

function uploaderFor(s: ReturnType<typeof setup>, over: Parameters<typeof createUploader>[0] extends infer O ? Partial<O> : never = {}) {
  const fetch = (async (input: string, init: RequestInit = {}) =>
    s.handler(new Request(String(input), { ...init, headers: { ...(init.headers as Record<string, string>), "x-test-owner": "alice" } }))) as unknown as typeof globalThis.fetch;
  return createUploader({ endpoint: ENDPOINT, fetch, sleep: async () => {}, retries: 1, ...over });
}

afterEach(() => vi.unstubAllGlobals());

describe("a runtime without crypto.getRandomValues or btoa (Hermes)", () => {
  it("encodes base64 without btoa", () => {
    vi.stubGlobal("btoa", undefined);
    for (const n of [0, 1, 2, 3, 4, 5, 16, 32, 255]) {
      const bytes = bytesOf(n, 3);
      expect(toBase64(bytes), `${n} bytes`).toBe(Buffer.from(bytes).toString("base64"));
    }
  });

  it("uploads with the randomId it's given, and no btoa", async () => {
    vi.stubGlobal("btoa", undefined);
    const s = setup();
    const randomId = vi.fn(() => "AAAAAAAAAAAAAAAAAAAAAA");
    const result = await uploaderFor(s, { randomId }).upload(fromBytes(bytesOf(10)), { name: "a.bin", contentType: "a/b", purpose: "media" }).done;
    expect(result.state).toBe("done");
    expect(result.uploadId).toBe("AAAAAAAAAAAAAAAAAAAAAA");
    expect(randomId).toHaveBeenCalledTimes(1);
  });

  it("says plainly what to do when there's no randomness source, before anything is sent", async () => {
    vi.stubGlobal("crypto", { subtle: globalThis.crypto.subtle });
    const s = setup();
    const error = await uploaderFor(s).upload(fromBytes(bytesOf(10)), { name: "a.bin", contentType: "a/b", purpose: "media" }).done.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UploadClientError);
    expect((error as UploadClientError).code).toBe("no_random_source");
    expect((error as Error).message).toMatch(/randomId/);
    expect(s.store.sessions.size).toBe(0);
  });

  it("refuses a randomId that isn't an upload id", async () => {
    const s = setup();
    const error = await uploaderFor(s, { randomId: () => "short" }).upload(fromBytes(bytesOf(10)), { name: "a.bin", contentType: "a/b", purpose: "media" }).done.catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/22 characters/);
  });
});

describe("the speed cap with several parts in flight", () => {
  it("three takes at once, each refilled as one finishes, still average the rate", async () => {
    // A clock and timers the test runs: each sleep wakes when the clock reaches it.
    let clock = 0;
    const timers: { at: number; wake: () => void }[] = [];
    const sleep = (ms: number) => new Promise<void>((wake) => timers.push({ at: clock + ms, wake }));
    const rate = 1000;
    const take = createSpeedLimiter(() => rate, sleep, () => clock);
    const sent: { at: number; bytes: number }[] = [];
    const worker = async () => {
      for (let i = 0; i < 3; i++) {
        await take(rate);
        sent.push({ at: clock, bytes: rate });
      }
    };
    const all = Promise.all([worker(), worker(), worker()]);
    for (let guard = 0; guard < 100; guard++) {
      await new Promise((r) => setTimeout(r, 0));
      if (sent.length === 9) break;
      timers.sort((a, b) => a.at - b.at);
      const next = timers.shift();
      if (!next) continue;
      clock = Math.max(clock, next.at);
      next.wake();
    }
    await all;
    expect(sent).toHaveLength(9);
    // Never ahead of the cap: by any moment, at most rate × seconds (plus one second's burst).
    let total = 0;
    for (const s of sent) {
      total += s.bytes;
      expect(total, `at ${s.at} ms`).toBeLessThanOrEqual(rate * (s.at / 1000) + rate);
    }
    // 9 seconds' worth at 1000 bytes a second, starting from an empty bucket.
    expect(sent.at(-1)!.at).toBeGreaterThanOrEqual(9000);
  });
});
