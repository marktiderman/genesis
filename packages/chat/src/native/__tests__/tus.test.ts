// @feat:chat
import { describe, expect, it, vi } from "vitest";
import { ChatError } from "../../core/client";
import { base64Utf8, createTusUpload } from "../tus";

const URL_ = "http://127.0.0.1:54321";
const CONV = "c0000000-0000-4000-8000-000000000001";
const USER = "u0000000-0000-4000-8000-000000000002";

function server(opts: { failPatchOnce?: boolean; createStatus?: number } = {}) {
  let received = 0;
  let failed = false;
  const calls: { method: string; url: string; headers: Record<string, string>; size?: number }[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
    const method = init.method ?? "GET";
    const size = init.body instanceof ArrayBuffer ? init.body.byteLength : undefined;
    calls.push({ method, url, headers, size });
    if (method === "POST") {
      const status = opts.createStatus ?? 201;
      return new Response(null, { status, headers: status === 201 ? { location: `${URL_}/storage/v1/upload/resumable/abc` } : {} });
    }
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

  it("an upload the server already has (409) counts as done", async () => {
    const s = server({ createStatus: 409 });
    const upload = createTusUpload({ supabaseUrl: URL_, userId: USER, getAccessToken: async () => "jwt", fetch: s.fetch, newId: () => "id3" });
    expect(await upload(CONV, file(3))).toBe(`${CONV}/${USER}/id3.jpg`);
    expect(s.calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
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
