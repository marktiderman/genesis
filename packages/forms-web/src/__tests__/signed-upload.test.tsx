// The browser half of the upload handshake: ask the endpoint for a signed upload, send the
// bytes, keep the reference. Moved with the code from the host app's
// src/lib/feedback/photo-upload.ts (uploadFeedbackPhoto, feedbackPhotoUrl), and run here
// against genesis-forms/server's createUploadHandler so both halves speak the same JSON.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createForm, defineForm, f, type FieldBlock, type PhotoRef, type SignedUpload } from "@marktiderman/genesis-forms";
import { createUploadHandler, type StoredUpload, type UploadStore } from "@marktiderman/genesis-forms/server";
import { Form, signedUploadHost } from "../index";

const ATTEMPT = "3f2b8c1e-9d4a-4f6b-8e2a-1c5d7e9f0a1b";
const form = defineForm({
  id: "kit",
  title: "Broken kit",
  layout: { mode: "classic" },
  blocks: [f.photo("photo", { label: "Add a photo (optional)", maxFiles: 2, formats: ["jpeg", "heic"] })],
});
const field = form.definition.blocks[0] as FieldBlock;
const file = (name: string, type: string, size = 1000) => new File([new Uint8Array(size)], name, { type });
const granted = (ref: PhotoRef, upload: SignedUpload) => new Response(JSON.stringify({ ref, upload }), { status: 200 });

describe("signedUploadHost", () => {
  it("asks for a signed upload, sends the bytes there, and resolves to the server's reference", async () => {
    const ref = { id: "u1", name: "IMG_0042.jpg", type: "image/jpeg", size: 1000 };
    const upload = { bucket: "feedback-uploads", path: "p/f/u1", token: "t" };
    const fetch = vi.fn(async () => granted(ref, upload));
    const send = vi.fn(async () => {});
    const host = signedUploadHost({ endpoint: "/api/upload/kit?practice=riverside", claim: { attemptId: ATTEMPT }, send, fetch });
    const photo = file("IMG_0042.jpg", "image/jpeg");
    expect(await host.upload(photo, field)).toEqual(ref);
    const [url, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("/api/upload/kit?practice=riverside");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({
      fieldId: "photo",
      name: "IMG_0042.jpg",
      type: "image/jpeg",
      size: 1000,
      attemptId: ATTEMPT,
    });
    expect(send).toHaveBeenCalledWith(photo, upload, "image/jpeg");
  });

  it("sends an edit link's token instead of the attempt, read at each upload, to a per-field endpoint", async () => {
    let claim: { attemptId: string } | { edit: string } = { attemptId: ATTEMPT };
    const fetch = vi.fn(async () => granted({ id: "u1", name: "a.heic", type: "image/heic", size: 1000 }, { path: "p", token: "t" }));
    const host = signedUploadHost({ endpoint: (fl) => `/api/upload/${fl.id}`, claim: () => claim, send: async () => {}, fetch });
    claim = { edit: "the-token" };
    // A HEIC file the browser gives no type is sent by its extension.
    await host.upload(file("a.heic", ""), field);
    const [url, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("/api/upload/photo");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ edit: "the-token", type: "image/heic" });
    expect(body).not.toHaveProperty("attemptId");
  });

  it("rejects with the server's words, or the status when it gave none, and sends nothing", async () => {
    const send = vi.fn(async () => {});
    const refusal = signedUploadHost({
      endpoint: "/u",
      claim: { attemptId: ATTEMPT },
      send,
      fetch: async () => new Response(JSON.stringify({ error: "Use a JPEG or HEIC photo." }), { status: 415 }),
    });
    await expect(refusal.upload(file("x.png", "image/png"), field)).rejects.toThrow("Use a JPEG or HEIC photo.");
    const broken = signedUploadHost({
      endpoint: "/u",
      claim: { attemptId: ATTEMPT },
      send,
      fetch: async () => new Response("<html>", { status: 502 }),
    });
    await expect(broken.upload(file("x.jpg", "image/jpeg"), field)).rejects.toThrow("The photo wasn't accepted (502).");
    // A 200 without a reference is no grant either.
    const empty = signedUploadHost({ endpoint: "/u", claim: { attemptId: ATTEMPT }, send, fetch: async () => new Response("{}") });
    await expect(empty.upload(file("x.jpg", "image/jpeg"), field)).rejects.toThrow("(200)");
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects when sending the bytes fails", async () => {
    const host = signedUploadHost({
      endpoint: "/u",
      claim: { attemptId: ATTEMPT },
      send: async () => Promise.reject(new Error("storage said no")),
      fetch: async () => granted({ id: "u1", name: "a.jpg", type: "image/jpeg", size: 1000 }, { path: "p", token: "t" }),
    });
    await expect(host.upload(file("a.jpg", "image/jpeg"), field)).rejects.toThrow("storage said no");
  });

  it("without send, PUTs the file to the signed URL, and fails without one", async () => {
    const ref = { id: "u1", name: "a.jpg", type: "image/jpeg", size: 1000 };
    const calls: [string, RequestInit | undefined][] = [];
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push([String(url), init]);
      return calls.length === 1 ? granted(ref, { path: "p", token: "t", url: "https://store.test/put/u1" }) : new Response(null);
    });
    const host = signedUploadHost({ endpoint: "/u", claim: { attemptId: ATTEMPT }, fetch });
    const photo = file("a.jpg", "image/jpeg");
    expect(await host.upload(photo, field)).toEqual(ref);
    expect(calls[1]![0]).toBe("https://store.test/put/u1");
    expect(calls[1]![1]).toMatchObject({ method: "PUT", headers: { "content-type": "image/jpeg" }, body: photo });

    const failing = signedUploadHost({
      endpoint: "/u",
      claim: { attemptId: ATTEMPT },
      fetch: vi
        .fn()
        .mockResolvedValueOnce(granted(ref, { path: "p", token: "t", url: "https://store.test/put/u1" }))
        .mockResolvedValueOnce(new Response(null, { status: 403 })),
    });
    await expect(failing.upload(photo, field)).rejects.toThrow("The file wasn't stored (403).");
    const noUrl = signedUploadHost({ endpoint: "/u", claim: { attemptId: ATTEMPT }, fetch: async () => granted(ref, { path: "p", token: "t" }) });
    await expect(noUrl.upload(photo, field)).rejects.toThrow(/pass `send`/);
  });

  it("reads a stored file through readUrl, null when it can't (the host app's feedbackPhotoUrl)", async () => {
    const ref = { id: "u1", name: "IMG_0042.jpg", type: "image/jpeg", size: 2048 };
    const readUrl = vi.fn(async (r: PhotoRef) => (r.id === "u1" ? "https://storage.test/signed" : null));
    const host = signedUploadHost({ endpoint: "/u", claim: { attemptId: ATTEMPT }, readUrl });
    expect(await host.url(ref)).toBe("https://storage.test/signed");
    expect(await host.url({ ...ref, id: "gone" })).toBeNull();
    const throwing = signedUploadHost({
      endpoint: "/u",
      claim: { attemptId: ATTEMPT },
      readUrl: async () => Promise.reject(new Error("Object not found")),
    });
    expect(await throwing.url(ref)).toBeNull();
    expect(await signedUploadHost({ endpoint: "/u", claim: { attemptId: ATTEMPT } }).url(ref)).toBeNull();
  });
});

describe("signedUploadHost with createUploadHandler", () => {
  /** The server half in memory: a store that keeps rows, and storage that keeps bytes. */
  function server() {
    const rows: StoredUpload[] = [];
    const stored = new Map<string, File>();
    const store: UploadStore = {
      async beginUpload(input) {
        const id = `00000000-0000-4000-8000-${String(rows.length + 1).padStart(12, "0")}`;
        rows.push({
          ...input,
          id,
          responseId: null,
          stored: false,
          storedType: null,
          storedSize: null,
        });
        return { id, objectName: `practice/${input.formId}/${id}` };
      },
      signUpload: async (objectName) => ({ bucket: "uploads", path: objectName, token: `token-${objectName}` }),
      uploadRefs: async (_formId, ids) => rows.filter((r) => ids.includes(r.id)),
    };
    const handler = createUploadHandler({
      resolveForm: async () => ({ id: "form-1", definition: form.definition, open: true, scope: "practice" }),
      store,
    });
    const fetch = vi.fn((url: string | URL | Request, init?: RequestInit) =>
      handler(new Request(new URL(String(url), "https://app.test"), init)),
    );
    const send = vi.fn(async (f: File, upload: SignedUpload) => {
      if (upload.token !== `token-${upload.path}`) throw new Error("bad token");
      stored.set(upload.path, f);
    });
    return { rows, stored, fetch, send };
  }

  it("uploads a picked photo end to end, and the answer keeps the server's reference", async () => {
    const s = server();
    const host = signedUploadHost({ endpoint: "/api/upload/kit", claim: { attemptId: ATTEMPT }, send: s.send, fetch: s.fetch });
    const engine = createForm(form.definition);
    const { container } = render(<Form form={form} engine={engine} onUpload={host.upload} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!;
    fireEvent.change(input, { target: { files: [file("rower.jpg", "image/jpeg", 2048)] } });
    await waitFor(() => expect(engine.getState().values["photo"]).toHaveLength(1));
    const id = s.rows[0]!.id;
    expect(engine.getState().values["photo"]).toEqual([{ id, name: "rower.jpg", type: "image/jpeg", size: 2048 }]);
    expect(s.stored.has(`practice/form-1/${id}`)).toBe(true);
    expect(s.rows[0]!.attemptHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("shows a refused upload under the field and keeps no answer", async () => {
    const s = server();
    const host = signedUploadHost({ endpoint: "/api/upload/kit", claim: { attemptId: "not-a-uuid" }, send: s.send, fetch: s.fetch });
    const engine = createForm(form.definition);
    const { container } = render(<Form form={form} engine={engine} onUpload={host.upload} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!;
    fireEvent.change(input, { target: { files: [file("rower.jpg", "image/jpeg")] } });
    expect(await screen.findByText(/didn't upload/)).toBeTruthy();
    expect(engine.getState().values["photo"]).toBeUndefined();
    expect(s.send).not.toHaveBeenCalled();
  });
});
