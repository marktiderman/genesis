// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DataWriteError } from "../../schema/write-outcome";
import { WRITE_FAILED, useWrite } from "../use-write";

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useWrite", () => {
  it("runs one write at a time: a double click sends once", async () => {
    let release!: (v: string) => void;
    const write = vi.fn(() => new Promise<string>((resolve) => (release = resolve)));
    const { result } = renderHook(() => useWrite(write), { wrapper: wrapper(new QueryClient()) });
    let a!: Promise<string | undefined>, b!: Promise<string | undefined>;
    act(() => {
      a = result.current.fire(undefined);
      b = result.current.fire(undefined);
    });
    await waitFor(() => expect(result.current.pending).toBe(true));
    expect(write).toHaveBeenCalledTimes(1);
    await act(async () => release("sent"));
    expect(await a).toBe("sent");
    expect(await b).toBe("sent");
    // Once it settled, the next click is a new write.
    act(() => {
      void result.current.fire(undefined);
    });
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
  });

  it("shows a refusal in its own plain words, and anything else generically", async () => {
    const { result } = renderHook(
      () => useWrite(async (kind: string) => {
        throw kind === "refused" ? new DataWriteError("forbidden", "You can't send this lesson.") : new TypeError("boom");
      }),
      { wrapper: wrapper(new QueryClient()) },
    );
    await act(async () => void (await result.current.fire("refused")));
    await waitFor(() => expect(result.current.error).toBe("You can't send this lesson."));
    await act(async () => void (await result.current.fire("other")));
    await waitFor(() => expect(result.current.error).toBe(WRITE_FAILED));
    act(() => result.current.reset());
    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it("invalidates after a success, and a failing callback doesn't fail the write", async () => {
    const client = new QueryClient();
    await client.fetchQuery({ queryKey: ["tasks"], queryFn: () => 1, staleTime: Infinity });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(
      () =>
        useWrite(async () => "ok", {
          invalidates: [["tasks"]],
          onSuccess: () => {
            throw new Error("callback broke");
          },
        }),
      { wrapper: wrapper(client) },
    );
    let out: string | undefined;
    await act(async () => {
      out = await result.current.run(undefined);
    });
    expect(out).toBe("ok");
    expect(result.current.error).toBeNull();
    expect(client.getQueryState(["tasks"])?.isInvalidated).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
