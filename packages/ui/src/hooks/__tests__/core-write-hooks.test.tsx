/**
 * genesis-core's write hooks, driven through a real React tree (core has no
 * DOM test setup, so this lives with genesis-ui's happy-dom suite).
 *
 * - `useResource` and `useResourceForm` invalidate `[resource]`, the
 *   provider's `invalidates` keys and the caller's `invalidates` option.
 * - `useResourceForm` starts an edit form from `provider.toFormValues`.
 * - `GenesisProvider` uses a `queryClient` it is given instead of its own.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  GenesisProvider,
  createMockProvider,
  useResource,
  useResourceForm,
  type DataProvider,
} from "@marktiderman/genesis-core";

function setup(extra: Partial<DataProvider> = {}) {
  const base = createMockProvider({ tasks: [{ id: "t1", title: "Write", status: "done" }] }, { delay: 0 });
  const provider: DataProvider = {
    ...base,
    invalidates: (event) => (event.resource === "tasks" ? [["person", "p1"]] : []),
    ...extra,
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={provider} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
  const keys = () => invalidate.mock.calls.map(([filters]) => filters?.queryKey);
  return { wrapper, keys };
}

describe("useResource write invalidation", () => {
  it("invalidates the resource, the provider's keys and the caller's keys after an update", async () => {
    const { wrapper, keys } = setup();
    const { result } = renderHook(() => useResource("tasks", { invalidates: [["me"]] }), { wrapper });
    await act(() => result.current.update("t1", { title: "Edit" }));
    expect(keys()).toEqual([["tasks"], ["person", "p1"], ["me"]]);
  });

  it("does the same after a delete", async () => {
    const { wrapper, keys } = setup();
    const { result } = renderHook(() => useResource("tasks"), { wrapper });
    await act(() => result.current.remove("t1"));
    expect(keys()).toEqual([["tasks"], ["person", "p1"]]);
  });
});

describe("useResourceForm", () => {
  it("starts an edit form from provider.toFormValues and invalidates related keys on save", async () => {
    const toFormValues = vi.fn((_resource: string, row: Record<string, unknown>) => ({
      title: row["title"],
      done: row["status"] === "done",
    }));
    const { wrapper, keys } = setup({ toFormValues });
    const { result } = renderHook(
      () =>
        useResourceForm({
          resource: "tasks",
          action: "edit",
          id: "t1",
          initialData: { id: "t1", title: "Write", status: "done" },
          fields: [
            { key: "title", type: "text" },
            { key: "done", type: "switch" },
          ],
          invalidates: [["me"]],
        }),
      { wrapper },
    );
    expect(toFormValues).toHaveBeenCalledWith("tasks", { id: "t1", title: "Write", status: "done" });
    // Fields are unregistered until rendered (shouldUnregister), so read the defaults.
    expect(result.current.form.formState.defaultValues).toEqual({ title: "Write", done: true });

    await act(() => result.current.handleSave({ title: "Write more", done: true }));
    await waitFor(() => expect(keys()).toEqual([["tasks"], ["person", "p1"], ["me"]]));
  });
});
