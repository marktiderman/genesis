/** @feat:chat */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatClient } from "../core/client";
import { randomId } from "../core/media";
import { createOutbox, memoryOutboxStore, type QueuedMessage } from "../core/outbox";

const tick = () => new Promise((r) => setTimeout(r, 0));

function fakeClient() {
  const sent: unknown[] = [];
  const client = {
    upload: vi.fn(async (_c: string, _u: string, _d: unknown, o: { name: string }) => `c1/me/${o.name}`),
    send: vi.fn(async (input: { clientId: string; conversationId: string }) => {
      sent.push(input);
      return { id: `m-${input.clientId}`, conversationId: input.conversationId, clientId: input.clientId, seq: sent.length } as never;
    }),
  } as unknown as ChatClient;
  return { client, sent };
}

describe("ids", () => {
  const original = globalThis.crypto;
  afterEach(() => Object.defineProperty(globalThis, "crypto", { value: original, configurable: true }));

  it("makes UUIDs where crypto.randomUUID is missing (some React Native runtimes)", () => {
    Object.defineProperty(globalThis, "crypto", { value: { getRandomValues: original.getRandomValues.bind(original) }, configurable: true });
    const id = randomId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    expect(randomId()).not.toBe(randomId());
  });

  it("uses the app's id maker when given one", async () => {
    const { client } = fakeClient();
    const outbox = createOutbox({ client, userId: "me", newId: () => "fixed-id" });
    expect(await outbox.send({ conversationId: "c1", body: "hi" })).toBe("fixed-id");
  });
});

describe("files across a relaunch", () => {
  it("says what each pending file is, so the bubble can draw it", async () => {
    const { client } = fakeClient();
    let release!: () => void;
    (client.upload as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise((r) => (release = () => r("c1/me/v.m4a"))));
    const outbox = createOutbox({ client, userId: "me" });
    await outbox.send({ conversationId: "c1" }, [{ data: new Blob(["x"]), name: "v.m4a", contentType: "audio/mp4", meta: { kind: "voice", durationMs: 4200 } }]);
    expect(outbox.pending("c1")[0]!.files).toEqual([{ name: "v.m4a", contentType: "audio/mp4", kind: "voice", meta: { kind: "voice", durationMs: 4200 } }]);
    release();
  });

  it("never sends a message without the pasted image it lost on a relaunch; it asks for it again", async () => {
    const store = memoryOutboxStore();
    const first = fakeClient();
    (first.client.upload as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));
    const before = createOutbox({ client: first.client, userId: "me", store });
    const id = await before.send({ conversationId: "c1", body: "look" }, [{ data: new Blob(["png"]), name: "paste.png", contentType: "image/png" }]);
    await tick();

    const again = fakeClient();
    const after = createOutbox({ client: again.client, userId: "me", store });
    await after.load();
    await after.retryAll();
    await tick();
    expect(again.client.send).not.toHaveBeenCalled();
    expect(after.pending("c1")[0]).toMatchObject({ status: "failed", error: "Attach the file again to send" });

    await after.reattach(id, [{ data: new Blob(["png"]), name: "paste.png", contentType: "image/png" }]);
    await tick();
    expect(again.sent).toHaveLength(1);
    expect(after.pending("c1")).toHaveLength(0);
  });

  it("keeps a pasted image across a relaunch when the app can save it", async () => {
    const store = memoryOutboxStore();
    const first = fakeClient();
    (first.client.upload as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));
    const persistFile = vi.fn(async () => "file:///cache/paste.png");
    const before = createOutbox({ client: first.client, userId: "me", store, persistFile });
    await before.send({ conversationId: "c1" }, [{ data: new Blob(["png"]), name: "paste.png", contentType: "image/png" }]);
    await tick();
    const saved = (await store.load()) as QueuedMessage[];
    expect(saved[0]!.files[0]!.data).toBe("file:///cache/paste.png");

    const again = fakeClient();
    const readFile = vi.fn(async () => new Blob(["png"]));
    const after = createOutbox({ client: again.client, userId: "me", store, readFile });
    await after.load();
    await after.retryAll();
    await tick();
    expect(readFile).toHaveBeenCalledWith("file:///cache/paste.png");
    expect(again.sent).toHaveLength(1);
  });
});
