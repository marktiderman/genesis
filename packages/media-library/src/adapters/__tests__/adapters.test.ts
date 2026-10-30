// @feat:media-resumable-uploads
import { describe, expect, it, vi } from "vitest";
// Types only: it checks the forms adapter fits forms' port. forms doesn't depend on this package.
// (chat's port is checked by shape below: its native types would bring React Native's fetch in.)
import type { UploadAdapter } from "@marktiderman/genesis-forms";
import type { UploadResult } from "../../client/uploader";
import { TusError } from "../../client/supabase-tus";
import { createChatTusTransport } from "../chat";
import { createFormsUploadAdapter } from "../forms";

const fakeUploader = (result: UploadResult) => {
  const upload = vi.fn((_source: unknown, _options: { name: string; contentType: string; purpose: string }) => ({ done: Promise.resolve(result) }));
  return { upload: upload as never as (typeof upload & ((...a: never[]) => never)), calls: upload.mock.calls };
};

describe("the forms adapter", () => {
  it("fits genesis-forms' upload port", () => {
    const adapter: UploadAdapter<File> = createFormsUploadAdapter({ uploader: fakeUploader({ state: "done", uploadId: "u1", copies: [] }) });
    expect(typeof adapter.upload).toBe("function");
  });

  it("uploads the file through the uploader and resolves to the reference the answer keeps", async () => {
    const uploader = fakeUploader({ state: "done", uploadId: "u1", copies: [] });
    const adapter = createFormsUploadAdapter({ uploader, purpose: (field) => `forms.${field.id}` });
    const file = new File([new Uint8Array(5)], "a.jpg", { type: "image/jpeg" });
    expect(await adapter.upload(file, { id: "photo" })).toEqual({ id: "u1", name: "a.jpg", type: "image/jpeg", size: 5 });
    expect(uploader.calls[0]![1]).toEqual({ name: "a.jpg", contentType: "image/jpeg", purpose: "forms.photo" });
  });

  it("keeps the app's own reference for a file it already holds, and refuses a partial store", async () => {
    const file = new File([new Uint8Array(5)], "a.heic", { type: "" });
    const skipped = createFormsUploadAdapter({ uploader: fakeUploader({ state: "skipped", copies: [], ref: "media-7" }), contentType: () => "image/heic" });
    expect(await skipped.upload(file, { id: "photo" })).toEqual({ id: "media-7", name: "a.heic", type: "image/heic", size: 5 });
    const partial = createFormsUploadAdapter({ uploader: fakeUploader({ state: "partial", uploadId: "u2", copies: [] }) });
    await expect(partial.upload(file, { id: "photo" })).rejects.toThrow(/wasn't stored/);
  });

  it("reads a link through readUrl, and null when it fails or isn't given", async () => {
    const ref = { id: "u1", name: "a", type: "image/png", size: 1 };
    expect(await createFormsUploadAdapter({ uploader: fakeUploader({ state: "done", copies: [] }) }).url(ref)).toBeNull();
    expect(await createFormsUploadAdapter({ uploader: fakeUploader({ state: "done", copies: [] }), readUrl: async () => "https://x/a" }).url(ref)).toBe("https://x/a");
    expect(await createFormsUploadAdapter({ uploader: fakeUploader({ state: "done", copies: [] }), readUrl: async () => Promise.reject(new Error("no")) }).url(ref)).toBeNull();
  });
});

describe("the chat adapter", () => {
  const info = (headers: () => Promise<Record<string, string>>) => ({ bucket: "genesis-chat", contentType: "image/jpeg", cacheControl: "3600", headers });
  const source = { size: 3, read: async (from: number, to: number) => new Uint8Array(3).buffer.slice(from, to) };

  it("fits genesis-chat's upload port", () => {
    // genesis-chat's TusTransport, as it declares it.
    type TusTransport = {
      send(
        record: { path: string; location?: string | undefined; done?: boolean | undefined },
        source: { size: number; read(from: number, to: number): Promise<ArrayBuffer> },
        info: { bucket: string; contentType: string; cacheControl: string; headers: () => Promise<Record<string, string>> },
        renamePath: () => string,
      ): Promise<string>;
    };
    const transport: TusTransport = createChatTusTransport({ supabaseUrl: "http://127.0.0.1:54321" });
    expect(typeof transport.send).toBe("function");
  });

  it("sends to chat's path and bucket with chat's headers", async () => {
    const calls: { method: string; headers: Record<string, string> }[] = [];
    const fetch = vi.fn(async (_url: string, init: RequestInit = {}) => {
      calls.push({ method: init.method ?? "GET", headers: init.headers as Record<string, string> });
      if (init.method === "POST") return new Response(null, { status: 201, headers: { location: "http://127.0.0.1:54321/storage/v1/upload/resumable/x" } });
      return new Response(null, { status: 204, headers: { "upload-offset": "3" } });
    }) as unknown as typeof globalThis.fetch;
    const transport = createChatTusTransport({ supabaseUrl: "http://127.0.0.1:54321", fetch });
    const record = { path: "c/u/id.jpg" };
    expect(await transport.send(record, source, info(async () => ({ authorization: "Bearer jwt" })), () => "c/u/other.jpg")).toBe("c/u/id.jpg");
    expect(calls.map((c) => c.method)).toEqual(["POST", "PATCH"]);
    expect(calls[0]!.headers).toMatchObject({ authorization: "Bearer jwt", "tus-resumable": "1.0.0" });
    expect(atob(calls[0]!.headers["upload-metadata"]!.split(",")[0]!.split(" ")[1]!)).toBe("genesis-chat");
  });

  it("doesn't retry a refusal chat made (signed out), and fails a refused create with a refusal", async () => {
    const signedOut = Object.assign(new Error("Sign in to send files"), { transient: false });
    const sleep = vi.fn(async () => {});
    const transport = createChatTusTransport({ supabaseUrl: "http://x", fetch: vi.fn() as never, sleep });
    await expect(transport.send({ path: "p.jpg" }, source, info(async () => Promise.reject(signedOut)), () => "q.jpg")).rejects.toBe(signedOut);
    expect(sleep).not.toHaveBeenCalled();
    const refused = createChatTusTransport({ supabaseUrl: "http://x", fetch: (async () => new Response("no", { status: 403 })) as never, sleep });
    const error = await refused.send({ path: "p.jpg" }, source, info(async () => ({})), () => "q.jpg").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TusError);
    expect((error as TusError).failure).toBe("forbidden");
  });
});
