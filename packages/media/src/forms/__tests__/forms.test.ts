// @feat:media-resumable-uploads
import { describe, expect, it, vi } from "vitest";
// Types only: it checks the forms adapter fits forms' port. forms doesn't depend on this package.
import type { UploadAdapter } from "@marktiderman/genesis-forms";
import type { UploadResult } from "../../uploads/client/uploader";
import { createFormsUploadAdapter } from "../index";

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
    const noRef = createFormsUploadAdapter({ uploader: fakeUploader({ state: "skipped", copies: [] }) });
    await expect(noRef.upload(file, { id: "photo" })).rejects.toThrow(/readable.*ref/);
  });

  it("retries a partial store's failed targets once before giving up", async () => {
    const file = new File([new Uint8Array(5)], "a.jpg", { type: "image/jpeg" });
    const finalize = vi.fn(async () => ({ state: "done" as const, uploadId: "u3", copies: [] }));
    const adapter = createFormsUploadAdapter({ uploader: { ...fakeUploader({ state: "partial", uploadId: "u3", copies: [] }), finalize } });
    expect((await adapter.upload(file, { id: "photo" })).id).toBe("u3");
    expect(finalize).toHaveBeenCalledWith("u3");
  });

  it("reads a link through readUrl, and null when it fails or isn't given", async () => {
    const ref = { id: "u1", name: "a", type: "image/png", size: 1 };
    expect(await createFormsUploadAdapter({ uploader: fakeUploader({ state: "done", copies: [] }) }).url(ref)).toBeNull();
    expect(await createFormsUploadAdapter({ uploader: fakeUploader({ state: "done", copies: [] }), readUrl: async () => "https://x/a" }).url(ref)).toBe("https://x/a");
    expect(await createFormsUploadAdapter({ uploader: fakeUploader({ state: "done", copies: [] }), readUrl: async () => Promise.reject(new Error("no")) }).url(ref)).toBeNull();
  });
});
