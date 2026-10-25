// @feat:chat
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHAT_LIMITS } from "../../core/media";
import {
  base64ToBytes,
  canSend,
  composerDisabledReason,
  composerReducer,
  createDraftSaver,
  draftKey,
  clearDrafts,
  emptyComposer,
  fileFromDataUri,
  filesFromAssets,
  loadDraft,
  memoryDraftStorage,
  toSend,
  type ComposerAttachment,
} from "../composer-state";
import { chatNativeCopy as copy } from "../copy";

const file = (key: string): ComposerAttachment => ({ key, file: { data: `file:///${key}.jpg`, name: `${key}.jpg`, contentType: "image/jpeg" } });

describe("composerReducer", () => {
  it("types, attaches, removes, replies and empties on send", () => {
    let s = composerReducer(emptyComposer, { type: "text", text: "hi " });
    s = composerReducer(s, { type: "add", attachments: [file("a"), file("b")] });
    s = composerReducer(s, { type: "remove", key: "a" });
    s = composerReducer(s, { type: "reply", to: { messageId: "m1", name: "Sam", preview: "yo" } });
    expect(s.attachments.map((a) => a.key)).toEqual(["b"]);
    expect(s.replyTo?.messageId).toBe("m1");
    expect(composerReducer(s, { type: "sent" })).toEqual(emptyComposer);
  });

  it("keeps at most the per-message limit of files, and says so", () => {
    const many = Array.from({ length: CHAT_LIMITS.attachmentsPerMessage + 3 }, (_, i) => file(`f${i}`));
    const s = composerReducer(emptyComposer, { type: "add", attachments: many, tooMany: "Too many" });
    expect(s.attachments).toHaveLength(CHAT_LIMITS.attachmentsPerMessage);
    expect(s.notice).toBe("Too many");
  });

  it("caps the text at the body limit", () => {
    const s = composerReducer(emptyComposer, { type: "text", text: "x".repeat(CHAT_LIMITS.bodyChars + 10) });
    expect(s.text).toHaveLength(CHAT_LIMITS.bodyChars);
  });

  it("restores a draft only into an empty composer", () => {
    const draft = { text: "draft", replyTo: { messageId: "m", name: "Lee", preview: "p" } };
    expect(composerReducer(emptyComposer, { type: "restore", draft }).text).toBe("draft");
    const typing = composerReducer(emptyComposer, { type: "text", text: "new" });
    expect(composerReducer(typing, { type: "restore", draft }).text).toBe("new");
  });
});

describe("canSend and the disabled reason", () => {
  it("needs text that isn't blank, or a file, and permission", () => {
    expect(canSend({ ...emptyComposer, text: "   " }, true)).toBe(false);
    expect(canSend({ ...emptyComposer, text: "a" }, true)).toBe(true);
    expect(canSend({ ...emptyComposer, attachments: [file("a")] }, true)).toBe(true);
    expect(canSend({ ...emptyComposer, text: "a" }, false)).toBe(false);
  });

  it("explains why: closed, admins only, or not allowed; nothing while loading or allowed", () => {
    const conv = { settings: {}, status: null, archivedAt: null };
    expect(composerDisabledReason(null, conv, null, copy)).toBeNull();
    expect(composerDisabledReason(true, conv, "member", copy)).toBeNull();
    expect(composerDisabledReason(false, { ...conv, status: "closed" as const }, "member", copy)).toBe(copy.cantPostClosed);
    expect(composerDisabledReason(false, { ...conv, settings: { who_posts: "admins" as const } }, "member", copy)).toBe(copy.cantPostAdmins);
    expect(composerDisabledReason(false, conv, "observer", copy)).toBe(copy.cantPost);
  });
});

describe("toSend", () => {
  it("trims the body, carries the reply and the mentions, and the files", () => {
    const id = "0b5f3c3e-7f53-4a5e-9f43-6a8d2c1e9b10";
    const s = { ...emptyComposer, text: `  hi @[Sam](user:${id}) `, attachments: [file("a")], replyTo: { messageId: "m1", name: "Sam", preview: "" } };
    const { input, files } = toSend(s);
    expect(input).toEqual({ body: `hi @[Sam](user:${id})`, replyToId: "m1", mentions: [id] });
    expect(files).toHaveLength(1);
  });
});

describe("filesFromAssets", () => {
  it("makes photos and videos into files with their size and kind", () => {
    const { attachments, notice } = filesFromAssets(
      [
        { uri: "file:///p/IMG_1.HEIC", fileName: "IMG_1.HEIC", mimeType: "image/heic", width: 4032, height: 3024, fileSize: 2_000_000, type: "image" },
        { uri: "file:///p/v.mov", fileName: "v.mov", mimeType: "video/quicktime", duration: 4200, type: "video" },
      ],
      copy,
    );
    expect(notice).toBeNull();
    expect(attachments[0]!.file).toMatchObject({ data: "file:///p/IMG_1.HEIC", contentType: "image/heic", meta: { kind: "image", width: 4032, height: 3024, bytes: 2_000_000 } });
    expect(attachments[1]!.file.meta).toMatchObject({ kind: "video", durationMs: 4200 });
  });

  it("refuses a type the bucket won't take, and a file over the limit", () => {
    const { attachments, notice } = filesFromAssets([{ uri: "file:///x.svg", fileName: "x.svg", mimeType: "image/svg+xml" }], copy);
    expect(attachments).toHaveLength(0);
    expect(notice).toBe("x.svg can't be sent.");
    const big = filesFromAssets([{ uri: "file:///b.jpg", fileName: "b.jpg", mimeType: "image/jpeg", fileSize: CHAT_LIMITS.fileBytes + 1 }], copy);
    expect(big.notice).toBe("b.jpg is too large to send.");
  });
});

describe("pasting a picture", () => {
  it("decodes a data URI into bytes", () => {
    expect([...base64ToBytes("aGk=")]).toEqual([104, 105]);
    expect([...base64ToBytes("aGVsbG8=")]).toEqual([...new TextEncoder().encode("hello")]);
    const a = fileFromDataUri("data:image/png;base64,aGVsbG8=", { width: 2, height: 3 })!;
    expect(a.file).toMatchObject({ name: "pasted.png", contentType: "image/png", meta: { kind: "image", width: 2, height: 3, bytes: 5 } });
    expect(a.file.data).toBeInstanceOf(ArrayBuffer);
  });

  it("ignores what isn't a picture", () => {
    expect(fileFromDataUri("data:text/html;base64,PGI+")).toBeNull();
    expect(fileFromDataUri("nope")).toBeNull();
  });
});

describe("drafts", () => {
  afterEach(() => vi.useRealTimers());

  it("has one key per person, conversation and thread", () => {
    expect(draftKey("u1", "c1")).toBe("genesis-chat:draft:u1:c1");
    expect(draftKey("u1", "c1", "r1")).toBe("genesis-chat:draft:u1:c1:r1");
    expect(draftKey("u2", "c1")).not.toBe(draftKey("u1", "c1"));
  });

  it("clears one person's drafts on sign-out and leaves everything else", async () => {
    const storage = memoryDraftStorage();
    await storage.setItem(draftKey("u1", "c1"), "{}");
    await storage.setItem(draftKey("u1", "c2", "r1"), "{}");
    await storage.setItem(draftKey("u10", "c1"), "{}");
    await storage.setItem("other-app-key", "x");
    expect(await clearDrafts(storage, "u1")).toBe(2);
    expect(await storage.getItem(draftKey("u1", "c1"))).toBeNull();
    expect(await storage.getItem(draftKey("u1", "c2", "r1"))).toBeNull();
    expect(await storage.getItem(draftKey("u10", "c1"))).toBe("{}");
    expect(await storage.getItem("other-app-key")).toBe("x");
  });

  it("says so, and clears nothing, when the storage can't list its keys", async () => {
    const onError = vi.fn();
    const { getAllKeys: _, ...noList } = memoryDraftStorage();
    expect(await clearDrafts(noList, "u1", onError)).toBe(0);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("saves after typing stops, flushes at once, removes when empty", async () => {
    vi.useFakeTimers();
    const storage = memoryDraftStorage();
    const saver = createDraftSaver(storage, "k", 400);
    saver.save({ text: "h" });
    saver.save({ text: "hello" });
    expect(await storage.getItem("k")).toBeNull();
    await vi.advanceTimersByTimeAsync(400);
    expect(await loadDraft(storage, "k")).toEqual({ text: "hello" });
    saver.save({ text: "  " });
    saver.flush();
    await Promise.resolve();
    expect(await storage.getItem("k")).toBeNull();
    saver.save({ text: "again" });
    saver.clear();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await storage.getItem("k")).toBeNull();
  });

  it("reads a broken draft as none", async () => {
    const storage = memoryDraftStorage();
    await storage.setItem("k", "{oops");
    expect(await loadDraft(storage, "k")).toBeNull();
  });
});
