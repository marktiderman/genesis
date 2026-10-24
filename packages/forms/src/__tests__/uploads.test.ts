// @feat:forms-engine
// Upload fields on the server: the handshake that signs one upload per file (for the
// form's upload field, its attempt or edit link, type and size, rate limited) and the
// submit-time check that every file the answers name was uploaded by that attempt.
// Moved with the code from Breakthrough's src/test/feedback-photo-uploads.test.ts; every
// refusal there is here, since these are the ownership checks.
import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { defineForm, f, type Json } from "../index";
import {
  addressPrefix,
  attemptHash,
  checkUploads,
  createUploadHandler,
  NOT_UPLOADED_MESSAGE,
  signEditToken,
  UPLOAD_MESSAGES,
  uploadFields,
  type EditableResponse,
  type RateLimitStore,
  type StoredUpload,
  type UploadForm,
  type UploadStore,
} from "../server";

const ATTEMPT = "3f2b8c1e-9d4a-4f6b-8e2a-1c5d7e9f0a1b";
const OTHER_ATTEMPT = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";
const SECRET = "test-edit-secret-that-is-32-bytes-or-more";
const RATE_SECRET = "a-rate-limit-secret";
const PRACTICE = "practice-a";
const FORM_ID = "11111111-1111-4111-8111-111111111111";
const RESPONSE_ID = "22222222-2222-4222-8222-222222222222";
const NONCE = "nonce-0000000000000001";
const MB = 1024 * 1024;

const kitForm = defineForm({
  id: "broken-kit",
  title: "Report broken equipment",
  blocks: [
    f.longText("what", { label: "What's broken?", required: true }),
    f.photo("photo", { label: "Add a photo (optional)", maxFiles: 2, maxSizeMb: 5, formats: ["jpeg", "heic"] }),
  ],
}).toJSON();

/** An in-memory upload store with the database's rules for begin and read-back. */
function fakeUploads() {
  const rows: StoredUpload[] = [];
  let n = 0;
  const store = {
    beginUpload: vi.fn(async (input: Parameters<UploadStore["beginUpload"]>[0]) => {
      const owned = rows.filter(
        (r) => (input.attemptHash && r.attemptHash === input.attemptHash) || (input.editOf && r.editOf === input.editOf),
      );
      if (owned.length >= 20) return { tooMany: true as const };
      const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
      rows.push({
        id,
        fieldId: input.fieldId,
        attemptHash: input.attemptHash,
        editOf: input.editOf,
        responseId: null,
        name: input.name,
        contentType: input.contentType,
        size: input.size,
        stored: false,
        storedType: null,
        storedSize: null,
      });
      return { id, objectName: `${PRACTICE}/${input.formId}/${id}` };
    }),
    signUpload: vi.fn(async (objectName: string) => ({
      bucket: "feedback-uploads",
      path: objectName,
      token: `token-for-${objectName}`,
    })),
    uploadRefs: vi.fn(async (_formId: string, ids: string[]) => rows.filter((r) => ids.includes(r.id))),
  } satisfies UploadStore;
  /** As the browser sending the bytes to the signed URL. */
  const arrive = (id: string, type = "image/jpeg", size = 2048) =>
    Object.assign(rows.find((r) => r.id === id)!, { stored: true, storedType: type, storedSize: size });
  return { store, rows, arrive };
}

interface Setup {
  form?: Partial<UploadForm> | null;
  allow?: boolean | null;
  responses?: EditableResponse[];
}

function setup(options: Setup = {}) {
  const up = fakeUploads();
  const log = vi.fn();
  const hits: [string, number, number][] = [];
  const counter: RateLimitStore = {
    hit: vi.fn(async (key: string, limit: number, windowSeconds: number) => {
      hits.push([key, limit, windowSeconds]);
      return options.allow === undefined ? true : options.allow;
    }),
  };
  const form: UploadForm | null =
    options.form === null
      ? null
      : { id: FORM_ID, definition: kitForm, open: true, scope: PRACTICE, allowsEdits: true, label: "broken-kit", ...options.form };
  const responses = options.responses ?? [{ id: RESPONSE_ID, editNonce: NONCE }];
  const resolveForm = vi.fn(async (_request: Request, slug: string) => (slug === "broken-kit" ? form : null));
  const handler = createUploadHandler<string>({
    resolveForm,
    store: up.store,
    edit: { secret: () => SECRET, response: async (id) => responses.find((r) => r.id === id) ?? null },
    rateLimit: { store: counter, secret: RATE_SECRET },
    log,
  });
  return {
    ...up,
    log,
    hits,
    counter,
    resolveForm,
    upload: (body: unknown, headers: Record<string, string> = {}, slug = "broken-kit") =>
      handler(request(body, headers), slug),
  };
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://cff.example/api/upload/broken-kit", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.7", "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** The refusal's words. */
const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;

const photo = (over: Record<string, unknown> = {}) => ({
  fieldId: "photo",
  name: "IMG_0042.jpg",
  type: "image/jpeg",
  size: 2048,
  attemptId: ATTEMPT,
  ...over,
});

describe("attemptHash", () => {
  it("is Breakthrough's resumeTokenHash: hex SHA-256 of the attempt id", async () => {
    expect(await attemptHash(ATTEMPT)).toBe(createHash("sha256").update(ATTEMPT).digest("hex"));
  });
});

describe("createUploadHandler", () => {
  it("records the upload for the attempt and hands back a reference and a signed upload", async () => {
    const t = setup();
    const res = await t.upload(photo());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ref: Json; upload: Record<string, string> };
    const id = t.rows[0]!.id;
    expect(body.ref).toEqual({ id, name: "IMG_0042.jpg", type: "image/jpeg", size: 2048 });
    expect(body.upload).toEqual({
      bucket: "feedback-uploads",
      path: `${PRACTICE}/${FORM_ID}/${id}`,
      token: `token-for-${PRACTICE}/${FORM_ID}/${id}`,
    });
    expect(t.store.beginUpload).toHaveBeenCalledWith({
      formId: FORM_ID,
      fieldId: "photo",
      name: "IMG_0042.jpg",
      contentType: "image/jpeg",
      size: 2048,
      attemptHash: createHash("sha256").update(ATTEMPT).digest("hex"),
      editOf: null,
    });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(t.resolveForm).toHaveBeenCalledWith(expect.any(Request), "broken-kit");
  });

  it("names a file without a name 'photo' and trims a long one", async () => {
    const t = setup();
    await t.upload(photo({ name: "  " }));
    expect(t.rows[0]!.name).toBe("photo");
    await t.upload(photo({ name: "x".repeat(400) }));
    expect(t.rows[1]!.name).toHaveLength(255);
  });

  it("refuses what the field doesn't take, before recording anything", async () => {
    const t = setup();
    const notUpload = await t.upload(photo({ fieldId: "what" }));
    expect(notUpload.status).toBe(400);
    expect((await errorOf(notUpload))).toBe(UPLOAD_MESSAGES.notUploadField);
    expect((await t.upload(photo({ fieldId: "nope" }))).status).toBe(400);
    const png = await t.upload(photo({ type: "image/png", name: "x.png" }));
    expect(png.status).toBe(415);
    expect((await errorOf(png))).toBe("Use a JPEG or HEIC photo.");
    const big = await t.upload(photo({ size: 5 * MB + 1 }));
    expect(big.status).toBe(413);
    expect((await errorOf(big))).toBe("Each photo must be 5 MB or smaller.");
    expect((await t.upload(photo({ size: 0 }))).status).toBe(413);
    expect((await t.upload(photo({ size: 1.5 }))).status).toBe(413);
    expect((await t.upload(photo({ size: "2048" }))).status).toBe(413);
    expect(t.store.beginUpload).not.toHaveBeenCalled();
    expect(t.counter.hit).not.toHaveBeenCalled();
  });

  it("takes HEIC by its type, whatever the case", async () => {
    const t = setup();
    expect((await t.upload(photo({ type: "IMAGE/HEIC", name: "IMG.HEIC" }))).status).toBe(200);
    expect(t.rows[0]!.contentType).toBe("image/heic");
  });

  it("needs the visit's attempt id, JSON, and a form that is open", async () => {
    const t = setup();
    expect((await t.upload(photo({ attemptId: undefined }))).status).toBe(400);
    const notUuid = await t.upload(photo({ attemptId: "not-a-uuid" }));
    expect(notUuid.status).toBe(400);
    expect((await errorOf(notUuid))).toBe(UPLOAD_MESSAGES.reload);
    expect((await t.upload("{")).status).toBe(400);
    expect((await t.upload("[1]")).status).toBe(400);
    expect((await t.upload(photo(), { "content-type": "text/plain" })).status).toBe(415);
    expect((await t.upload(photo(), { "content-type": "application/json; charset=utf-8" })).status).toBe(200);
    const closed = setup({ form: { open: false } });
    const shut = await closed.upload(photo());
    expect(shut.status).toBe(409);
    expect(await shut.json()).toEqual({ error: UPLOAD_MESSAGES.notOpen });
    const missing = await t.upload(photo(), {}, "unknown");
    expect(missing.status).toBe(404);
    expect(closed.store.beginUpload).not.toHaveBeenCalled();
  });

  it("refuses a request past the size cap without reading it all", async () => {
    const t = setup();
    const res = await t.upload(photo({ name: "x".repeat(5_000) }));
    expect(res.status).toBe(413);
    expect(t.resolveForm).not.toHaveBeenCalled();
  });

  it("answers 503 without details when the form can't be loaded", async () => {
    const t = setup();
    t.resolveForm.mockRejectedValueOnce(new Error("db password wrong"));
    const res = await t.upload(photo());
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("password");
    expect(t.log).toHaveBeenCalledWith("db password wrong");
  });

  it("counts uploads per scope and address, apart from responses, and says so at the limit", async () => {
    const t = setup({ allow: false });
    const res = await t.upload(photo());
    expect(res.status).toBe(429);
    expect((await errorOf(res))).toBe(UPLOAD_MESSAGES.rateLimited);
    const [key, limit, windowSeconds] = t.hits[0]!;
    const hex = createHmac("sha256", RATE_SECRET).update(addressPrefix("203.0.113.7")).digest("hex");
    expect(key).toBe(`upload:${PRACTICE}:${hex}`);
    expect([limit, windowSeconds]).toEqual([120, 600]);
    expect(t.store.beginUpload).not.toHaveBeenCalled();
  });

  it("lets the upload through, and says so, when the count can't be kept", async () => {
    const t = setup({ allow: null });
    expect((await t.upload(photo())).status).toBe(200);
    expect(t.log).toHaveBeenCalledWith("The upload rate limit could not be checked; letting the upload through.");
  });

  it("refuses past the store's limit for one attempt", async () => {
    const t = setup();
    for (let i = 0; i < 20; i++) expect((await t.upload(photo())).status).toBe(200);
    const res = await t.upload(photo());
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: UPLOAD_MESSAGES.tooMany, code: "too_many_photos" });
  });

  it("answers 500 without details when storage can't sign the upload", async () => {
    const t = setup();
    t.store.signUpload.mockRejectedValueOnce(new Error("bucket missing"));
    const res = await t.upload(photo());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("bucket");
    expect(t.log.mock.calls[0]![0]).toContain("bucket missing");
  });

  it("takes an upload for an edit only with the response's newest edit link", async () => {
    const t = setup();
    const token = await signEditToken({ id: RESPONSE_ID, nonce: NONCE }, SECRET);
    const res = await t.upload(photo({ attemptId: undefined, edit: token }));
    expect(res.status).toBe(200);
    expect(t.store.beginUpload).toHaveBeenLastCalledWith(expect.objectContaining({ attemptHash: null, editOf: RESPONSE_ID }));

    const stale = await signEditToken({ id: RESPONSE_ID, nonce: "nonce-0000000000000999" }, SECRET);
    const refused = await t.upload(photo({ attemptId: undefined, edit: stale }));
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: UPLOAD_MESSAGES.badEditLink, code: "bad_link" });
    expect((await t.upload(photo({ attemptId: undefined, edit: "forged" }))).status).toBe(403);
    expect((await t.upload(photo({ attemptId: undefined, edit: 42 }))).status).toBe(403);
    const otherSecret = await signEditToken({ id: RESPONSE_ID, nonce: NONCE }, `${SECRET}-other`);
    expect((await t.upload(photo({ attemptId: undefined, edit: otherSecret }))).status).toBe(403);
    // A response the app doesn't find for this form (another form's, say).
    const gone = await signEditToken({ id: "33333333-3333-4333-8333-333333333333", nonce: NONCE }, SECRET);
    expect((await t.upload(photo({ attemptId: undefined, edit: gone }))).status).toBe(403);
    expect(t.store.beginUpload).toHaveBeenCalledTimes(1);
  });

  it("refuses an edit's upload on a form without edits, without edit options, or while closed", async () => {
    const token = await signEditToken({ id: RESPONSE_ID, nonce: NONCE }, SECRET);
    const noEdits = setup({ form: { allowsEdits: false } });
    expect((await noEdits.upload(photo({ attemptId: undefined, edit: token }))).status).toBe(403);
    const closed = setup({ form: { open: false } });
    const shut = await closed.upload(photo({ attemptId: undefined, edit: token }));
    expect(shut.status).toBe(409);
    expect(await shut.json()).toEqual({ error: UPLOAD_MESSAGES.notTakingChanges, code: "closed" });

    const store = fakeUploads().store;
    const bare = createUploadHandler({
      resolveForm: async () => ({ id: FORM_ID, definition: kitForm, open: true, scope: PRACTICE, allowsEdits: true }),
      store,
    });
    expect((await bare(request(photo({ attemptId: undefined, edit: token })))).status).toBe(403);
    expect(store.beginUpload).not.toHaveBeenCalled();
    // Without a rate limit nothing is counted, and a new response's upload still works.
    expect((await bare(request(photo()))).status).toBe(200);
  });

  it("answers 503 when the edit's response can't be loaded", async () => {
    const t = setup();
    const handler = createUploadHandler({
      resolveForm: async () => ({ id: FORM_ID, definition: kitForm, open: true, scope: PRACTICE, allowsEdits: true }),
      store: t.store,
      edit: { secret: SECRET, response: async () => Promise.reject(new Error("db down")) },
      log: t.log,
    });
    const token = await signEditToken({ id: RESPONSE_ID, nonce: NONCE }, SECRET);
    expect((await handler(request(photo({ attemptId: undefined, edit: token })))).status).toBe(503);
    expect(t.store.beginUpload).not.toHaveBeenCalled();
  });

  it("takes the app's own words", async () => {
    const store = fakeUploads().store;
    const handler = createUploadHandler({
      resolveForm: async () => null,
      store,
      messages: { unavailable: "Gone." },
    });
    expect(await (await handler(request(photo()))).json()).toEqual({ error: "Gone." });
  });
});

describe("checkUploads", () => {
  const upload = (over: Partial<StoredUpload>): StoredUpload => ({
    id: "u1",
    fieldId: "photo",
    attemptHash: null,
    editOf: null,
    responseId: null,
    name: "a.jpg",
    contentType: "image/jpeg",
    size: 10,
    stored: true,
    storedType: "image/jpeg",
    storedSize: 10,
    ...over,
  });
  const store = (rows: StoredUpload[]) => ({ uploadRefs: vi.fn(async () => rows) });
  const ref = (id: string) => ({ id, name: "a.jpg", type: "image/jpeg", size: 10 });
  const check = (answers: Record<string, Json>, owner: Parameters<typeof checkUploads>[2]["owner"], rows: StoredUpload[]) =>
    checkUploads(kitForm, answers, { formId: FORM_ID, owner, store: store(rows) });

  it("lists the form's upload fields", () => {
    expect(uploadFields(kitForm).map((b) => b.id)).toEqual(["photo"]);
  });

  it("keeps the files this attempt uploaded, with what storage holds for them", async () => {
    const hash = await attemptHash(ATTEMPT);
    const rows = [upload({ id: "mine", attemptHash: hash, name: "IMG_0042.jpg", storedType: "IMAGE/JPEG", storedSize: 1900 })];
    const checked = await check(
      { what: "Rower 3's seat", photo: [{ ...ref("mine"), name: "renamed.jpg", size: 1 }] },
      { attemptHash: hash },
      rows,
    );
    expect(checked).toEqual({
      ok: true,
      answers: { what: "Rower 3's seat", photo: [{ id: "mine", name: "IMG_0042.jpg", type: "image/jpeg", size: 1900 }] },
    });
  });

  it("refuses a file another attempt uploaded, one that never arrived, or a made-up one", async () => {
    const hash = await attemptHash(ATTEMPT);
    const rows = [
      upload({ id: "theirs", attemptHash: await attemptHash(OTHER_ATTEMPT) }),
      upload({ id: "pending", attemptHash: hash, stored: false, storedType: null, storedSize: null }),
    ];
    expect(await check({ photo: [ref("theirs")] }, { attemptHash: hash }, rows)).toEqual({
      ok: false,
      errors: { photo: NOT_UPLOADED_MESSAGE },
    });
    expect((await check({ photo: [ref("pending")] }, { attemptHash: hash }, rows)).ok).toBe(false);
    expect((await check({ photo: [ref("made-up")] }, { attemptHash: hash }, rows)).ok).toBe(false);
  });

  it("refuses a stored file whose type or size the field doesn't take", async () => {
    const hash = await attemptHash(ATTEMPT);
    const wrongType = await check({ photo: [ref("u1")] }, { attemptHash: hash }, [upload({ attemptHash: hash, storedType: "image/png" })]);
    expect(wrongType).toEqual({ ok: false, errors: { photo: "Use a JPEG or HEIC photo." } });
    const unknownType = await check({ photo: [ref("u1")] }, { attemptHash: hash }, [upload({ attemptHash: hash, storedType: null })]);
    expect(unknownType.ok).toBe(false);
    const tooBig = await check({ photo: [ref("u1")] }, { attemptHash: hash }, [upload({ attemptHash: hash, storedSize: 6 * MB })]);
    expect(tooBig).toEqual({ ok: false, errors: { photo: "Each photo must be 5 MB or smaller." } });
    const empty = await check({ photo: [ref("u1")] }, { attemptHash: hash }, [upload({ attemptHash: hash, storedSize: 0 })]);
    expect(empty.ok).toBe(false);
  });

  it("refuses more files than the field takes", async () => {
    const hash = await attemptHash(ATTEMPT);
    const rows = ["a", "b", "c"].map((id) => upload({ id, attemptHash: hash }));
    expect(await check({ photo: [ref("a"), ref("b"), ref("c")] }, { attemptHash: hash }, rows)).toEqual({
      ok: false,
      errors: { photo: "Add at most 2 photos." },
    });
  });

  it("lets an edit keep the response's files and add ones uploaded for it", async () => {
    const rows = [upload({ id: "kept", responseId: "r1" }), upload({ id: "added", editOf: "r1" })];
    expect((await check({ photo: [ref("kept"), ref("added")] }, { responseId: "r1" }, rows)).ok).toBe(true);
  });

  it("doesn't let an edit take another response's files", async () => {
    const rows = [upload({ id: "theirs", responseId: "r2" }), upload({ id: "their-edit", editOf: "r2" })];
    expect(await check({ photo: [ref("theirs")] }, { responseId: "r1" }, rows)).toEqual({
      ok: false,
      errors: { photo: NOT_UPLOADED_MESSAGE },
    });
    expect((await check({ photo: [ref("their-edit")] }, { responseId: "r1" }, rows)).ok).toBe(false);
  });

  it("doesn't let an attempt take an edit's upload", async () => {
    const hash = await attemptHash(ATTEMPT);
    const rows = [upload({ id: "edit-upload", editOf: "r1" })];
    expect((await check({ photo: [ref("edit-upload")] }, { attemptHash: hash }, rows)).ok).toBe(false);
  });

  it("refuses a file uploaded for another field, or one a response already took", async () => {
    const hash = await attemptHash(ATTEMPT);
    expect((await check({ photo: [ref("u1")] }, { attemptHash: hash }, [upload({ fieldId: "what", attemptHash: hash })])).ok).toBe(false);
    expect((await check({ photo: [ref("u1")] }, { attemptHash: hash }, [upload({ attemptHash: hash, responseId: "r9" })])).ok).toBe(
      false,
    );
  });

  it("asks the store for this form's uploads, and nothing when the answers name no files", async () => {
    const s = store([]);
    expect(await checkUploads(kitForm, { what: "Bike 2" }, { formId: FORM_ID, owner: { attemptHash: "h" }, store: s })).toEqual({
      ok: true,
      answers: { what: "Bike 2" },
    });
    expect(s.uploadRefs).not.toHaveBeenCalled();
    // No store is needed either, until a file is named.
    expect((await checkUploads(kitForm, { what: "Bike 2" }, { formId: FORM_ID, owner: { attemptHash: "h" } })).ok).toBe(true);
    await expect(checkUploads(kitForm, { photo: [ref("u1")] }, { formId: FORM_ID, owner: { attemptHash: "h" } })).rejects.toThrow(
      /upload store/,
    );
    await checkUploads(kitForm, { photo: [ref("u1")] }, { formId: FORM_ID, owner: { attemptHash: "h" }, store: s });
    expect(s.uploadRefs).toHaveBeenCalledWith(FORM_ID, ["u1"]);
  });

  it("throws when the store can't read the uploads, so the app answers 503 and saves nothing", async () => {
    const failing = { uploadRefs: vi.fn(async () => Promise.reject(new Error("db down"))) };
    await expect(
      checkUploads(kitForm, { photo: [ref("u1")] }, { formId: FORM_ID, owner: { attemptHash: "h" }, store: failing }),
    ).rejects.toThrow("db down");
  });
});
