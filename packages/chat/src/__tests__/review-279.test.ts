/** @feat:chat Fixes from the review of release 279: upload refusals, and what app cards are told. */
import { describe, expect, it } from "vitest";
import { ChatError } from "../core/client";
import { sendBytes } from "../core/transfer";
import type { ChatAttachment } from "../core/types";
import type { ChatAttachmentKind, ChatCardContext } from "../react/index";
import { attachmentCardOf } from "../web/attachments";

const answering = (status: number) => (async () => new Response("", { status })) as unknown as typeof fetch;
const failure = (status: number) => sendBytes("https://x.test/a", new Blob(["x"]), { fetch: answering(status) }).then(
    () => { throw new Error("expected a failure"); },
    (e: ChatError) => e,
  );

describe("an upload's failed answer", () => {
  it("is retried on its own after a timeout or a server error", async () => {
    expect((await failure(408)).transient).toBe(true);
    expect((await failure(503)).transient).toBe(true);
  });
  it("waits when rate limited, without blocking the conversation as a refusal would", async () => {
    const e = await failure(429);
    expect(e.rateLimited).toBe(true);
    expect(e.permanent).toBe(false);
  });
  it("is a refusal for any other 4xx", async () => {
    expect((await failure(403)).permanent).toBe(true);
  });
});

describe("an app card on the web", () => {
  const checkIn: ChatAttachmentKind = {
    title: () => "Check-in",
    action: (_a, ctx?: ChatCardContext) => (ctx?.mine ? null : { label: "Answer", href: "https://app.test/check-in" }),
  };
  const a = { kind: "check_in", ref: {} } as unknown as ChatAttachment;

  it("is told whether it is on your own message", () => {
    expect(attachmentCardOf(checkIn, a, { mine: false })?.action?.label).toBe("Answer");
    expect(attachmentCardOf(checkIn, a, { mine: true })?.action).toBeNull();
  });
});
