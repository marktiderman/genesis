// @feat:chat
import { describe, expect, it, vi } from "vitest";
import { ChatError } from "../../core/client";
import { base64Utf8, createTusUpload } from "../tus";

const URL_ = "http://127.0.0.1:54321";
const CONV = "c0000000-0000-4000-8000-000000000001";
const USER = "u0000000-0000-4000-8000-000000000002";

function server(opts: { failPatchOnce?: boolean; createStatus?: number | (() => number); objectThere?: boolean } = {}) {
  let received = 0;
  let failed = false;
  const calls: { method: string; url: string; headers: Record<string, string>; size?: number }[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
    const method = init.method ?? "GET";
    const size = init.body instanceof ArrayBuffer ? init.body.byteLength : undefined;
    calls.push({ method, url, headers, size });
    if (method === "POST") {
      const status = (typeof opts.createStatus === "function" ? opts.createStatus() : opts.createStatus) ?? 201;
      return new Response(null, { status, headers: status === 201 ? { location: `${URL_}/storage/v1/upload/resumable/abc` } : {} });
    }
    // Storage answers a missing object with 400 (its body says 404).
    if (method === "HEAD" && url.includes("/storage/v1/object/authenticated/")) return new Response(null, { status: opts.objectThere ? 200 : 400 });
    if (method === "HEAD") return new Response(null, { status: 200, headers: { "upload-offset": String(received) } });
    if (method === "PATCH") {
      if (opts.failPatchOnce && !failed && received > 0) {
        failed = true;
        throw new TypeError("Network request failed");
      }
      expect(Number(headers["upload-offset"])).toBe(received);
      received += size ?? 0;
      return new Response(null, { status: 204, headers: { "upload-offset": String(received) } });
    }
    return new Response(new Uint8Array(10).buffer, { status: 200 });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls, received: () => received };
}

const file = (bytes: number) => ({ data: new Uint8Array(bytes).buffer, name: "photo.jpg", contentType: "image/jpeg" });

describe("createTusUpload", () => {
  it("creates the upload at the conversation's path with the person's token, then sends it in chunks", async () => {
    const s = server();
    const upload = createTusUpload({ supabaseUrl: `${URL_}/`, userId: USER, getAccessToken: async () => "jwt", apikey: "pk", fetch: s.fetch, chunkBytes: 4, newId: () => "id1" });
    const path = await upload(CONV, file(10));
    expect(path).toBe(`${CONV}/${USER}/id1.jpg`);
    const create = s.calls[0]!;
    expect(create).toMatchObject({ method: "POST", url: `${URL_}/storage/v1/upload/resumable` });
    expect(create.headers).toMatchObject({ authorization: "Bearer jwt", apikey: "pk", "tus-resumable": "1.0.0", "upload-length": "10", "x-upsert": "false" });
    expect(create.headers["upload-metadata"]).toContain(`bucketName ${base64Utf8("genesis-chat")}`);
    expect(create.headers["upload-metadata"]).toContain(`objectName ${base64Utf8(path)}`);
    expect(s.calls.filter((c) => c.method === "PATCH").map((c) => c.size)).toEqual([4, 4, 2]);
    expect(s.received()).toBe(10);
  });

  it("resumes after a dropped chunk from where the server is, and a retry reuses the path", async () => {
    const s = server({ failPatchOnce: true });
    const upload = createTusUpload({ supabaseUrl: URL_, userId: USER, getAccessToken: async () => "jwt", fetch: s.fetch, chunkBytes: 4, newId: () => "id2", retries: 0 });
    const f = file(10);
    await expect(upload(CONV, f)).rejects.toBeInstanceOf(ChatError);
    const path = await upload(CONV, f);
    expect(path).toBe(`${CONV}/${USER}/id2.jpg`);
    expect(s.calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(s.calls.some((c) => c.method === "HEAD")).toBe(true);
    expect(s.received()).toBe(10);
    // Done: a third call doesn't upload again.
    const before = s.calls.length;
    expect(await upload(CONV, f)).toBe(path);
    expect(s.calls.length).toBe(before);
  });

  it("an upload the server already has (409) counts as done once the object is checked to be there", async () => {
    const s = server({ createStatus: 409, objectThere: true });
    const upload = createTusUpload({ supabaseUrl: URL_, userId: USER, getAccessToken: async () => "jwt", fetch: s.fetch, newId: () => "id3" });
    expect(await upload(CONV, file(3))).toBe(`${CONV}/${USER}/id3.jpg`);
    expect(s.calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
    expect(s.calls.find((c) => c.method === "HEAD")).toMatchObject({ url: `${URL_}/storage/v1/object/authenticated/genesis-chat/${CONV}/${USER}/id3.jpg`, headers: { authorization: "Bearer jwt" } });
  });

  it("a 409 whose object isn't there is never taken as done: the file goes up whole at a new path", async () => {
    let creates = 0;
    const s = server({ createStatus: () => (++creates === 1 ? 409 : 201), objectThere: false });
    const ids = ["old", "new"];
    const upload = createTusUpload({ supabaseUrl: URL_, userId: USER, getAccessToken: async () => "jwt", fetch: s.fetch, newId: () => ids.shift()!, chunkBytes: 4 });
    expect(await upload(CONV, file(10))).toBe(`${CONV}/${USER}/new.jpg`);
    expect(s.received()).toBe(10);
    const creates2 = s.calls.filter((c) => c.method === "POST");
    expect(creates2).toHaveLength(2);
    expect(creates2[1]!.headers["upload-metadata"]).toContain(`objectName ${base64Utf8(`${CONV}/${USER}/new.jpg`)}`);
  });

  it("a refusal is a ChatError that isn't retried; signed out or a bad type never reaches the server", async () => {
    const s = server({ createStatus: 403 });
    const upload = createTusUpload({ supabaseUrl: URL_, userId: USER, getAccessToken: async () => "jwt", fetch: s.fetch });
    const err = await upload(CONV, file(3)).catch((e) => e);
    expect(err).toBeInstanceOf(ChatError);
    expect(err.forbidden).toBe(true);
    expect(s.calls.filter((c) => c.method === "POST")).toHaveLength(1);

    const s2 = server();
    const signedOut = createTusUpload({ supabaseUrl: URL_, userId: USER, getAccessToken: async () => null, fetch: s2.fetch });
    await expect(signedOut(CONV, file(3))).rejects.toMatchObject({ code: "42501" });
    await expect(signedOut(CONV, { ...file(3), name: "x.svg", contentType: "image/svg+xml" })).rejects.toMatchObject({ code: "22023" });
    expect(s2.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("reads a file URI one chunk at a time through openFile, never whole, and closes it", async () => {
    const s = server();
    const reads: [number, number][] = [];
    const close = vi.fn();
    const openFile = vi.fn(async () => ({
      size: 10,
      read: async (offset: number, length: number) => {
        reads.push([offset, length]);
        return new Uint8Array(Math.min(length, 10 - offset));
      },
      close,
    }));
    const readFile = vi.fn(async () => new Uint8Array(10).buffer);
    const upload = createTusUpload({ supabaseUrl: URL_, userId: USER, getAccessToken: async () => "jwt", fetch: s.fetch, openFile, readFile, chunkBytes: 4, newId: () => "id5" });
    await upload(CONV, { data: "file:///video.mp4", name: "video.mp4", contentType: "video/mp4" });
    expect(openFile).toHaveBeenCalledWith("file:///video.mp4");
    expect(readFile).not.toHaveBeenCalled();
    expect(reads).toEqual([[0, 4], [4, 4], [8, 2]]);
    expect(s.calls.find((c) => c.method === "POST")!.headers["upload-length"]).toBe("10");
    expect(s.calls.filter((c) => c.method === "PATCH").map((c) => c.size)).toEqual([4, 4, 2]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes the file when the upload fails", async () => {
    const s = server({ createStatus: 403 });
    const close = vi.fn();
    const upload = createTusUpload({ supabaseUrl: URL_, userId: USER, getAccessToken: async () => "jwt", fetch: s.fetch, openFile: () => ({ size: 3, read: async () => new Uint8Array(3), close }) });
    await expect(upload(CONV, { data: "file:///a.jpg", name: "a.jpg", contentType: "image/jpeg" })).rejects.toBeInstanceOf(ChatError);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("reads a file URI through readFile", async () => {
    const s = server();
    const readFile = vi.fn(async () => new Uint8Array(5).buffer);
    const upload = createTusUpload({ supabaseUrl: URL_, userId: () => USER, getAccessToken: async () => "jwt", fetch: s.fetch, readFile, newId: () => "id4" });
    await upload(CONV, { data: "file:///voice.m4a", name: "voice.m4a", contentType: "audio/mp4" });
    expect(readFile).toHaveBeenCalledWith("file:///voice.m4a");
    expect(s.received()).toBe(5);
  });
});

describe("base64Utf8", () => {
  it("encodes UTF-8", () => {
    expect(base64Utf8("genesis-chat")).toBe(Buffer.from("genesis-chat").toString("base64"));
    expect(base64Utf8("é/ü")).toBe(Buffer.from("é/ü").toString("base64"));
  });
});
