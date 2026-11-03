// @feat:data-offline
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { DataProvider } from "../../provider/types";
import type { ProviderCapabilities } from "../../schema/types";
import { resourceKeys } from "../../query-keys";
import { executeWrite, type SendContext } from "../mutation-mode";

const caps = (version?: ProviderCapabilities["version"]): ProviderCapabilities => ({
  search: true,
  sort: true,
  filterOperators: [],
  bulkWrites: false,
  versionedWrites: !!version,
  compositeKeys: false,
  ...(version ? { version } : {}),
});

function setup(version: ProviderCapabilities["version"] | null = { field: "version", kind: "integer" }) {
  const client = new QueryClient();
  const capabilities = vi.fn(async () => caps(version ?? undefined));
  const provider = { capabilities } as unknown as DataProvider;
  client.setQueryData(resourceKeys("tasks").detail("t1"), { id: "t1", title: "Old", version: 3 });
  client.setQueryData(resourceKeys("tasks").list({}), { data: [{ id: "t1", title: "Old", version: 3 }], total: 1 });
  return { client, provider, capabilities };
}

function update(
  client: QueryClient,
  provider: DataProvider,
  send: (ctx: SendContext) => Promise<{ record: Record<string, unknown> }>,
  mode: "pessimistic" | "optimistic" | "undoable" = "pessimistic",
  extra: { base?: Record<string, unknown>; kind?: "update" | "delete" } = {},
) {
  return executeWrite({
    queryClient: client,
    provider,
    resource: "tasks",
    kind: extra.kind ?? "update",
    id: "t1",
    ...(extra.kind === "delete" ? {} : { data: { title: "New" } }),
    ...(extra.base ? { base: extra.base as never } : {}),
    mode,
    undoDelayMs: 30,
    send: send as never,
    committed: () => {},
    failedLater: () => {},
  });
}

/** Someone else's save lands and this tab refetches: every cached copy is now at `version`. */
function refetched(client: QueryClient, version: number) {
  client.setQueryData(resourceKeys("tasks").detail("t1"), { id: "t1", title: "Theirs", version });
  client.setQueryData(resourceKeys("tasks").list({}), { data: [{ id: "t1", title: "Theirs", version }], total: 1 });
}

describe("versioned writes in the write hooks", () => {
  it("send the version the cached row was read at", async () => {
    const { client, provider } = setup();
    const send = vi.fn(async (_ctx: SendContext) => ({ record: { id: "t1", title: "New", version: 4 } }));
    await update(client, provider, send);
    expect(send.mock.calls[0]![0].expectedVersion).toBe("3");
  });

  it("put the new version into every cached copy, so the next write is checked against it", async () => {
    const { client, provider } = setup();
    const send = vi.fn(async (ctx: SendContext) => ({
      record: { id: "t1", title: "New", version: Number(ctx.expectedVersion) + 1 },
    }));
    await update(client, provider, send);
    expect(client.getQueryData<{ version: number }>(resourceKeys("tasks").detail("t1"))?.version).toBe(4);
    expect(
      client.getQueryData<{ data: { version: number }[] }>(resourceKeys("tasks").list({}))?.data[0]?.version,
    ).toBe(4);

    await update(client, provider, send);
    expect(send.mock.calls[1]![0].expectedVersion).toBe("4");
  });

  it("two optimistic edits in a row: the second is sent at the version the first left", async () => {
    const { client, provider } = setup();
    const sent: (string | undefined)[] = [];
    const send = vi.fn(async (ctx: SendContext) => {
      sent.push(ctx.expectedVersion);
      return { record: { id: "t1", title: "New", version: Number(ctx.expectedVersion) + 1 } };
    });
    await update(client, provider, send, "optimistic");
    await update(client, provider, send, "optimistic");
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(sent).toEqual(["3", "4"]);
  });

  it("send no version for a resource without one, or a row that isn't cached", async () => {
    const plain = setup(null);
    const send = vi.fn(async (_ctx: SendContext) => ({ record: { id: "t1", title: "New" } }));
    await update(plain.client, plain.provider, send);
    expect("expectedVersion" in send.mock.calls[0]![0]).toBe(false);

    const { client, provider } = setup();
    client.clear();
    await update(client, provider, send);
    expect("expectedVersion" in send.mock.calls[1]![0]).toBe(false);
  });

  it("ask the provider for its capabilities once, then reuse the answer", async () => {
    const { client, provider, capabilities } = setup();
    const send = vi.fn(async (ctx: SendContext) => ({ record: { id: "t1", version: Number(ctx.expectedVersion) + 1 } }));
    await update(client, provider, send);
    await update(client, provider, send);
    expect(capabilities).toHaveBeenCalledTimes(1);
  });

  it("a provider without capabilities sends writes unchecked, as before", async () => {
    const client = new QueryClient();
    client.setQueryData(resourceKeys("tasks").detail("t1"), { id: "t1", version: 3 });
    const send = vi.fn(async (_ctx: SendContext) => ({ record: { id: "t1" } }));
    await update(client, {} as DataProvider, send);
    expect("expectedVersion" in send.mock.calls[0]![0]).toBe(false);
  });

  it("an edit form's save is checked against the record it opened, even after the cache refetched a newer one", async () => {
    const { client, provider } = setup();
    const opened = client.getQueryData<Record<string, unknown>>(resourceKeys("tasks").detail("t1"))!;
    refetched(client, 4);
    const send = vi.fn(async (_ctx: SendContext) => ({ record: { id: "t1", version: 5 } }));
    await update(client, provider, send, "pessimistic", { base: opened });
    expect(send.mock.calls[0]![0].expectedVersion).toBe("3");
  });

  it("an undoable edit is checked against the row it was made on, not one refetched during its delay", async () => {
    const { client, provider } = setup();
    const send = vi.fn(async (_ctx: SendContext) => ({ record: { id: "t1", version: 5 } }));
    await update(client, provider, send, "undoable");
    refetched(client, 4);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]![0].expectedVersion).toBe("3");
  });

  it.each(["optimistic", "undoable", "pessimistic"] as const)("a %s delete from a list is checked", async (mode) => {
    const { client, provider } = setup();
    client.removeQueries({ queryKey: resourceKeys("tasks").detail("t1") });
    const send = vi.fn(async (_ctx: SendContext) => ({ record: undefined }));
    await update(client, provider, send as never, mode, { kind: "delete" });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]![0].expectedVersion).toBe("3");
  });

  it("a detail read with a select doesn't hold back the version: two saves in a row both pass", async () => {
    const { client, provider } = setup();
    // A record page reading a projection of the row; writes don't patch it.
    client.setQueryData(resourceKeys("tasks").detail("t1", "id, title, version"), { id: "t1", title: "Old", version: 3 });
    const send = vi.fn(async (ctx: SendContext) => ({ record: { id: "t1", version: Number(ctx.expectedVersion) + 1 } }));
    await update(client, provider, send);
    await update(client, provider, send);
    expect(send.mock.calls.map((c) => c[0].expectedVersion)).toEqual(["3", "4"]);
  });

  it("an optimistic edit patches the cache at once, without waiting for the capabilities answer", async () => {
    const client = new QueryClient();
    client.setQueryData(resourceKeys("tasks").detail("t1"), { id: "t1", title: "Old", version: 3 });
    let answer: (caps: ProviderCapabilities) => void = () => {};
    const provider = { capabilities: () => new Promise<ProviderCapabilities>((r) => (answer = r)) } as unknown as DataProvider;
    const send = vi.fn(async (_ctx: SendContext) => ({ record: { id: "t1", title: "New", version: 4 } }));
    await update(client, provider, send, "optimistic");
    expect(client.getQueryData<{ title: string }>(resourceKeys("tasks").detail("t1"))?.title).toBe("New");
    answer(caps({ field: "version", kind: "integer" }));
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]![0].expectedVersion).toBe("3");
  });

  it("warns once when a versioned resource's rows don't carry the version, and sends unchecked", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client, provider } = setup();
    client.setQueryData(resourceKeys("tasks").detail("t1"), { id: "t1", title: "Old" });
    client.removeQueries({ queryKey: resourceKeys("tasks").list({}) });
    const send = vi.fn(async (_ctx: SendContext) => ({ record: { id: "t1" } }));
    await update(client, provider, send);
    await update(client, provider, send);
    expect("expectedVersion" in send.mock.calls[0]![0]).toBe(false);
    expect(warn.mock.calls.filter((c) => String(c[1]).includes("don't carry it"))).toHaveLength(1);
    warn.mockRestore();
  });
});
