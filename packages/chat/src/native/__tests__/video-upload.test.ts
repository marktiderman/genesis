// @feat:chat
import { describe, expect, it, vi } from "vitest";
import { chunkedPut, createVideoUploads, nextOffset, type ByteSource } from "../video-upload";

const KIB = 1024;
const bytes = (n: number): ByteSource => {
  const buf = new Uint8Array(n).map((_, i) => i % 251).buffer;
  return { size: n, read: async (a, b) => buf.slice(a, b), close: vi.fn() };
};
const res = (status: number, headers: Record<string, string> = {}) => new Response(status === 204 ? null : "", { status, headers });
const noSleep = async () => undefined;
const flush = () => new Promise((r) => setTimeout(r, 0));

/** A resumable upload server (the protocol Mux direct uploads speak): keeps what it receives. */
function server(total: number, opts: { dropAt?: number[]; refuse?: number } = {}) {
  let have = 0;
  const calls: { range: string; size: number }[] = [];
  let n = 0;
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const range = String((init.headers as Record<string, string>)["content-range"]);
    const size = init.body ? (init.body as ArrayBuffer).byteLength : 0;
    calls.push({ range, size });
    const call = n++;
    if (opts.refuse !== undefined) return res(opts.refuse);
    if (range.startsWith("bytes */")) return have >= total ? res(200) : res(308, have ? { range: `bytes=0-${have - 1}` } : {});
    if (opts.dropAt?.includes(call)) throw new TypeError("Network request failed");
    const [, from, to] = /bytes (\d+)-(\d+)\//.exec(range)!.map(Number);
    if (from !== have) return res(308, have ? { range: `bytes=0-${have - 1}` } : {});
    have = to! + 1;
    return have >= total ? res(201) : res(308, { range: `bytes=0-${have - 1}` });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls, have: () => have };
}

describe("chunkedPut (resumable PUT to a direct upload URL)", () => {
  it("sends 256 KiB-multiple chunks with Content-Range and reports progress", async () => {
    const s = server(600 * KIB);
    const progress: number[] = [];
    await chunkedPut({ url: "https://up", contentType: "video/quicktime", source: bytes(600 * KIB), fetch: s.fetch, chunkBytes: 256 * KIB, onProgress: (sent) => progress.push(sent), sleep: noSleep });
    expect(s.calls.map((c) => c.range)).toEqual([`bytes 0-262143/614400`, `bytes 262144-524287/614400`, `bytes 524288-614399/614400`]);
    expect(progress).toEqual([0, 262144, 524288, 614400]);
    expect(s.have()).toBe(614400);
  });

  it("after a dropped connection asks where the server is and carries on from there", async () => {
    const s = server(600 * KIB, { dropAt: [1] });
    await chunkedPut({ url: "https://up", contentType: "video/mp4", source: bytes(600 * KIB), fetch: s.fetch, chunkBytes: 256 * KIB, sleep: noSleep });
    expect(s.calls.map((c) => c.range)).toEqual([`bytes 0-262143/614400`, `bytes 262144-524287/614400`, `bytes */614400`, `bytes 262144-524287/614400`, `bytes 524288-614399/614400`]);
    expect(s.have()).toBe(614400);
  });

  it("resumes an upload that got partway (a Retry) without sending the start again", async () => {
    const first = server(512 * KIB);
    await chunkedPut({ url: "u", contentType: "video/mp4", source: bytes(512 * KIB), fetch: first.fetch, chunkBytes: 256 * KIB, sleep: noSleep, isCancelled: () => first.have() >= 256 * KIB }).catch(() => undefined);
    expect(first.have()).toBe(256 * KIB);
    first.calls.length = 0;
    await chunkedPut({ url: "u", contentType: "video/mp4", source: bytes(512 * KIB), fetch: first.fetch, chunkBytes: 256 * KIB, sleep: noSleep, resume: true });
    expect(first.calls.map((c) => c.range)).toEqual([`bytes */524288`, `bytes 262144-524287/524288`]);
  });

  it("gives up on a refusal at once, and marks an expired upload URL so Retry mints another", async () => {
    const refused = server(10, { refuse: 403 });
    await expect(chunkedPut({ url: "u", contentType: "video/mp4", source: bytes(10), fetch: refused.fetch, sleep: noSleep })).rejects.toMatchObject({ code: "42501" });
    expect(refused.calls).toHaveLength(1);
    const gone = server(10, { refuse: 410 });
    await expect(chunkedPut({ url: "u", contentType: "video/mp4", source: bytes(10), fetch: gone.fetch, sleep: noSleep })).rejects.toMatchObject({ code: "P0002" });
  });

  it("fails after its retries when the network stays down", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    await expect(chunkedPut({ url: "u", contentType: "video/mp4", source: bytes(10), fetch: down, retries: 2, sleep: noSleep })).rejects.toThrow(/connection/);
  });

  it("reads Range headers", () => {
    expect(nextOffset("bytes=0-262143")).toBe(262144);
    expect(nextOffset(null)).toBe(0);
  });
});

describe("video uploads in flight", () => {
  const video = { uri: "file:///take.mov", name: "video-1.mov", contentType: "video/quicktime", durationMs: 4200 };
  const read = async () => new Response(new Uint8Array(100));

  it("with videoUpload: uploads to the minted URL, then sends the pending Mux attachment through the outbox", async () => {
    const s = server(100);
    const fetch = vi.fn(async (url: string, init?: RequestInit) => (url.startsWith("file:") ? read() : s.fetch(url, init!))) as unknown as typeof globalThis.fetch;
    const send = vi.fn(async () => "client-1");
    const create = vi.fn(async () => ({ url: "https://storage.googleapis.com/up", providerId: "upl_1", provider: "mux" as const }));
    const uploads = createVideoUploads(() => "t1");
    const seen: number[] = [];
    uploads.subscribe(() => seen.push(uploads.list("c")[0]?.progress ?? -1));
    uploads.start({ conversationId: "c", video, extra: { replyToId: "m9", threadRootId: null }, send, videoUpload: { create }, fetch, sleep: noSleep });
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith("c");
    expect(send).toHaveBeenCalledWith({
      conversationId: "c",
      replyToId: "m9",
      threadRootId: null,
      body: "",
      attachments: [{ kind: "video", provider: "mux", providerId: "upl_1", status: "pending", name: "video-1.mov", mime: "video/quicktime", bytes: 100, durationMs: 4200 }],
    });
    expect(uploads.list("c")).toEqual([]);
    expect(seen).toContain(1);
  });

  it("uses the upload minted when recording started", async () => {
    const s = server(100);
    const fetch = vi.fn(async (url: string, init?: RequestInit) => (url.startsWith("file:") ? read() : s.fetch(url, init!))) as unknown as typeof globalThis.fetch;
    const create = vi.fn();
    const send = vi.fn(async () => "x");
    createVideoUploads().start({ conversationId: "c", video, send, videoUpload: { create }, prepared: Promise.resolve({ url: "https://up", providerId: "upl_p", provider: "mux" }), fetch, sleep: noSleep });
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    expect(create).not.toHaveBeenCalled();
    expect((send.mock.calls[0] as unknown[])[0]).toMatchObject({ attachments: [{ providerId: "upl_p" }] });
  });

  it("a failed upload shows as failed, and Retry resumes it on the same upload", async () => {
    let up = true;
    const s = server(100);
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("file:")) return read();
      if (!up) throw new TypeError("Network request failed");
      return s.fetch(url, init!);
    }) as unknown as typeof globalThis.fetch;
    up = false;
    const send = vi.fn(async () => "x");
    const create = vi.fn(async () => ({ url: "https://up", providerId: "upl_1", provider: "mux" as const }));
    const uploads = createVideoUploads(() => "t1");
    uploads.start({ conversationId: "c", video, send, videoUpload: { create }, fetch, sleep: noSleep });
    await vi.waitFor(() => expect(uploads.list("c")[0]?.status).toBe("failed"));
    expect(uploads.list("c")[0]?.error).toMatch(/connection/);
    up = true;
    uploads.retry("t1");
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledTimes(1);
    expect(s.calls[0]?.range).toBe("bytes */100");
  });

  it("Cancel stops it and nothing is sent", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fetch = vi.fn(async (url: string) => {
      if (url.startsWith("file:")) return read();
      await gate;
      return res(201);
    }) as unknown as typeof globalThis.fetch;
    const send = vi.fn();
    const uploads = createVideoUploads(() => "t1");
    uploads.start({ conversationId: "c", video, send, videoUpload: { create: async () => ({ url: "https://up", providerId: "p", provider: "mux" }) }, fetch, sleep: noSleep });
    await flush();
    uploads.cancel("t1");
    release();
    await flush();
    await flush();
    expect(uploads.list("c")).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it("without videoUpload: goes through the outbox as a file to storage", async () => {
    const send = vi.fn(async () => "x");
    createVideoUploads().start({ conversationId: "c", video, extra: { threadRootId: "root" }, send });
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    expect(send).toHaveBeenCalledWith({ conversationId: "c", threadRootId: "root", body: "" }, [
      { data: "file:///take.mov", name: "video-1.mov", contentType: "video/quicktime", previewUrl: "file:///take.mov", meta: { kind: "video", durationMs: 4200 } },
    ]);
  });
});
