/**
 * @vitest-environment happy-dom
 * @feat:chat
 */
import { describe, expect, it } from "vitest";
import type { ChatAttachment } from "../core/types";
import { toAttachmentView } from "../web/attachments";

const attachment = (over: Partial<ChatAttachment>): ChatAttachment => ({ id: "a", kind: "image", provider: "storage", path: null, url: null, name: "a.png", ...over }) as ChatAttachment;

describe("toAttachmentView", () => {
  it("draws a signed picture", () => {
    expect(toAttachmentView(attachment({ path: "p/a.png" }), { "p/a.png": "https://signed.test/a.png" })).toMatchObject({ kind: "image", url: "https://signed.test/a.png" });
  });

  it("makes a picture from outside storage a link naming its host", () => {
    expect(toAttachmentView(attachment({ provider: "external", url: "https://elsewhere.test/b.png" }), {})).toMatchObject({ kind: "file", url: "https://elsewhere.test/b.png", name: "a.png (elsewhere.test)" });
  });

  it("does the same for video and voice from outside storage", () => {
    for (const kind of ["video", "voice"] as const) {
      expect(toAttachmentView(attachment({ kind, provider: "external", url: "https://elsewhere.test/b.mp4" }), {})).toMatchObject({ kind: "file", name: "a.png (elsewhere.test)" });
    }
  });

  it("gives a stored file that didn't sign no URL, whatever the message carries", () => {
    expect(toAttachmentView(attachment({ provider: "external", path: "x", url: "https://elsewhere.test/b.png" }), {})).toMatchObject({ url: null });
  });

  it("keeps a link's own address", () => {
    expect(toAttachmentView(attachment({ kind: "link", url: "https://example.test/" }), {})).toMatchObject({ kind: "link", url: "https://example.test/" });
  });
});
