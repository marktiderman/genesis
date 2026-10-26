// @feat:data-provider
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

describe("useResource defaultPage / defaultSearch", () => {
  it("starts on the given page and search (e.g. restored from the URL)", () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useResource("tasks", { defaultPage: 3, defaultSearch: "wri", searchFields: ["title"] }),
      { wrapper },
    );
    expect(result.current.params.pagination?.page).toBe(3);
    expect(result.current.params.search).toEqual({ query: "wri", fields: ["title"] });
  });
});

describe("useResourceForm — an edit never blanks what it didn't load", () => {
  const fields = [
    { key: "title", type: "text" as const },
    { key: "notes", type: "text" as const },
  ];
  const edit = (updates?: "loaded" | "all") => {
    const update = vi.fn(async (_r: string, { id, data }: { id: string | number; data: unknown }) => ({ data: { id, ...(data as object) } }));
    const { wrapper } = setup({ update: update as unknown as DataProvider["update"] });
    // A list row that didn't load `notes`.
    const { result } = renderHook(
      () => useResourceForm({ resource: "tasks", action: "edit", id: "t1", initialData: { id: "t1", title: "Write" }, fields, ...(updates ? { updates } : {}) }),
      { wrapper },
    );
    return { result, update };
  };

  it("leaves out a field the record didn't carry and nobody touched", async () => {
    const { result, update } = edit();
    await act(async () => {
      await result.current.handleSave({ title: "Rewrite", notes: "" });
    });
    expect(update.mock.calls[0]![1].data).toEqual({ title: "Rewrite" });
  });

  it("sends that field once the person changes it", async () => {
    const { result, update } = edit();
    act(() => {
      result.current.form.setValue("notes", "Mine");
    });
    await act(async () => {
      await result.current.handleSave({ title: "Write", notes: "Mine" });
    });
    expect(update.mock.calls[0]![1].data).toEqual({ title: "Write", notes: "Mine" });
  });

  it('`updates: "all"` sends every field, as before', async () => {
    const { result, update } = edit("all");
    await act(async () => {
      await result.current.handleSave({ title: "Rewrite", notes: "" });
    });
    expect(update.mock.calls[0]![1].data).toEqual({ title: "Rewrite", notes: "" });
  });
});

