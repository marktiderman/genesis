import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DataProvider } from "../../provider/types";
import { resourceKeys } from "../../query-keys";
import { dropPendingWrites, executeWrite, flushPendingWrites, pendingWriteCount } from "../mutation-mode";
import { clearViewerCache } from "../viewer-scope";

afterEach(() => vi.useRealTimers());

/** An undoable update of t1's title, waiting out its delay. */
async function waitingEdit(client: QueryClient, send: ReturnType<typeof vi.fn>, failedLater = vi.fn()) {
  client.setQueryData(resourceKeys("tasks").detail("t1"), { id: "t1", title: "A's title" });
  await executeWrite({
    queryClient: client,
    provider: {} as DataProvider,
    resource: "tasks",
    kind: "update",
    id: "t1",
    data: { title: "A-private-edit" },
    undoDelayMs: 5000,
    mode: "undoable",
    send,
    committed: () => {},
    failedLater,
  } as never);
}

describe("a viewer switch and pending writes", () => {
  it("dropPendingWrites: A's unsent edit is never sent, re-applied or reported under B", async () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const send = vi.fn(async () => ({ record: { id: "t1", title: "A-private-edit" } }));
    const failedLater = vi.fn();
    await waitingEdit(client, send, failedLater);
    expect(client.getQueryData<{ title: string }>(resourceKeys("tasks").detail("t1"))?.title).toBe("A-private-edit");

    dropPendingWrites(client);
    client.clear();
    // B's own read of t1 arrives: A's patch must not land on it.
    client.setQueryData(resourceKeys("tasks").detail("t1"), { id: "t1", title: "B's title" });
    await vi.advanceTimersByTimeAsync(10_000);

    expect(send).not.toHaveBeenCalled();
    expect(failedLater).not.toHaveBeenCalled();
    expect(client.getQueryData<{ title: string }>(resourceKeys("tasks").detail("t1"))?.title).toBe("B's title");
    expect(pendingWriteCount(client, "tasks")).toBe(0);
  });

  it("clearViewerCache sends A's edit first, while the session is still A's", async () => {
    const client = new QueryClient();
    const send = vi.fn(async () => ({ record: { id: "t1", title: "A-private-edit" } }));
    await waitingEdit(client, send);
    await clearViewerCache(client);
    expect(send).toHaveBeenCalledTimes(1);
    expect(pendingWriteCount(client, "tasks")).toBe(0);
    expect(client.getQueryCache().findAll()).toHaveLength(0);
  });

  it("flushPendingWrites resolves once every write settled, and does nothing on an idle client", async () => {
    await flushPendingWrites(new QueryClient());
    const client = new QueryClient();
    let release!: () => void;
    const send = vi.fn(
      () => new Promise<{ record: { id: string } }>((resolve) => (release = () => resolve({ record: { id: "t1" } }))),
    );
    await waitingEdit(client, send);
    let done = false;
    const flushed = flushPendingWrites(client).then(() => (done = true));
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);
    release();
    await flushed;
    expect(done).toBe(true);
  });
});
