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
import { act, render, renderHook, waitFor } from "@testing-library/react";
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
import { blankValues } from "@marktiderman/genesis-core/hooks";

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

  it.each(["loaded", "all"] as const)("never sends a field read-only on edit, even loaded (updates: %s)", async (updates) => {
    const update = vi.fn(async (_r: string, { id, data }: { id: string | number; data: unknown }) => ({ data: { id, ...(data as object) } }));
    const create = vi.fn(async (_r: string, { data }: { data: unknown }) => ({ data: { id: "t9", ...(data as object) } }));
    const { wrapper } = setup({ update: update as unknown as DataProvider["update"], create: create as unknown as DataProvider["create"] });
    const locked = [...fields, { key: "owner_id", type: "text" as const, readOnlyOnEdit: true }];
    const { result } = renderHook(
      () => useResourceForm({ resource: "tasks", action: "edit", id: "t1", initialData: { id: "t1", title: "Write", owner_id: "u1" }, fields: locked, updates }),
      { wrapper },
    );
    await act(async () => {
      await result.current.handleSave({ title: "Rewrite", owner_id: "u1" });
    });
    expect(update.mock.calls[0]![1].data).not.toHaveProperty("owner_id");
    // A create still sends it.
    const { result: created } = renderHook(() => useResourceForm({ resource: "tasks", action: "create", fields: locked }), { wrapper });
    await act(async () => {
      await created.current.handleSave({ title: "New", owner_id: "u2" });
    });
    expect(create.mock.calls[0]![1].data).toMatchObject({ owner_id: "u2" });
  });

  it("sends nothing when an edit has only read-only fields left, and still succeeds", async () => {
    const update = vi.fn(async (_r: string, { id, data }: { id: string | number; data: unknown }) => ({ data: { id, ...(data as object) } }));
    const onSuccess = vi.fn();
    const { wrapper } = setup({ update: update as unknown as DataProvider["update"] });
    const { result } = renderHook(
      () =>
        useResourceForm({
          resource: "tasks",
          action: "edit",
          id: "t1",
          initialData: { id: "t1", owner_id: "u1" },
          fields: [{ key: "owner_id", type: "text" as const, readOnlyOnEdit: true }],
          onSuccess,
        }),
      { wrapper },
    );
    await act(async () => {
      await result.current.handleSave({ owner_id: "u1" });
    });
    expect(update).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith({ id: "t1", owner_id: "u1" });
  });

  // A form with its inputs mounted, as a screen has them (values without an input aren't kept).
  type FormOptions = Parameters<typeof useResourceForm>[0];
  function mountForm(wrapper: (p: { children: ReactNode }) => ReactNode, options: FormOptions) {
    const current: { form?: ReturnType<typeof useResourceForm> } = {};
    function Harness(props: FormOptions) {
      const state = useResourceForm(props);
      current.form = state;
      return (
        <>
          {state.resolvedFields.map((f) => (
            <input key={f.key} {...state.form.register(f.key)} />
          ))}
        </>
      );
    }
    const view = render(<Harness {...options} />, { wrapper });
    return { current, rerender: (next: FormOptions) => view.rerender(<Harness {...next} />) };
  }

  it("doesn't require a read-only-on-edit field the row didn't load", async () => {
    const update = vi.fn(async (_r: string, { id, data }: { id: string | number; data: unknown }) => ({ data: { id, ...(data as object) } }));
    const { wrapper } = setup({ update: update as unknown as DataProvider["update"] });
    const { current } = mountForm(wrapper, {
      resource: "tasks",
      action: "edit",
      id: "t1",
      initialData: { id: "t1", title: "Write", notes: "n" },
      fields: [...fields, { key: "owner_id", type: "text" as const, required: true, readOnlyOnEdit: true }],
    });
    act(() => {
      current.form!.form.setValue("title", "Rewrite", { shouldDirty: true });
    });
    // Through the resolver, as a submit button does.
    await act(async () => {
      await current.form!.form.handleSubmit(current.form!.handleSave)();
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]![1].data).not.toHaveProperty("owner_id");
  });

  it("never takes a hidden field from the URL", () => {
    const { wrapper } = setup();
    window.history.replaceState(null, "", "/?practice_id=p2&title=FromUrl");
    try {
      const { current } = mountForm(wrapper, {
        resource: "tasks",
        action: "create",
        fields: [...fields, { key: "practice_id", type: "hidden" as const, hidden: true, defaultValue: "p1" }],
      });
      expect(current.form!.form.getValues()).toMatchObject({ practice_id: "p1", title: "FromUrl" });
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("follows new screen defaults in a mounted create form, keeping what the person typed", () => {
    const { wrapper } = setup();
    const options = (scope: string): FormOptions => ({
      resource: "tasks",
      action: "create",
      fields: [...fields, { key: "practice_id", type: "hidden" as const, hidden: true, defaultValue: scope }],
    });
    const { current, rerender } = mountForm(wrapper, options("p1"));
    rerender(options("p2"));
    expect(current.form!.form.getValues("practice_id")).toBe("p2");
    act(() => {
      current.form!.form.setValue("title", "Mine", { shouldDirty: true });
    });
    rerender(options("p3"));
    expect(current.form!.form.getValues()).toMatchObject({ practice_id: "p3", title: "Mine" });
  });
});


describe("useResourceForm — an empty input is no value", () => {
  const fields = [
    { key: "title", type: "text" as const, required: true },
    { key: "due_on", type: "date" as const, nullable: true },
    { key: "points", type: "number" as const, nullable: true },
    { key: "stage", type: "select" as const, nullable: true, options: [{ value: "a", label: "A" }] },
    { key: "owner_id", type: "relation" as const, nullable: true },
    { key: "notes", type: "textarea" as const, nullable: true },
    { key: "created_by", type: "text" as const, nullable: false, hasDefault: true },
    { key: "code", type: "text" as const, nullable: false },
    // No column facts: as before.
    { key: "legacy", type: "text" as const },
    { key: "legacy_on", type: "date" as const },
    // The screen started it at "" (a filter or default): kept.
    { key: "started", type: "text" as const, nullable: true, defaultValue: "" },
  ];
  const blank = {
    title: "T", due_on: "", points: "", stage: "", owner_id: "", notes: "", created_by: "", code: "", legacy: "", legacy_on: "", started: "",
  };
  const asBefore = { code: "", legacy: "", legacy_on: "", started: "" };

  it("leaves blanks of known columns out of a create, so the columns' defaults apply", () => {
    expect(blankValues(blank, fields, "create")).toEqual({ title: "T", ...asBefore });
  });

  it("clears a known column the person emptied to null on an edit", () => {
    expect(blankValues(blank, fields, "edit", new Set(Object.keys(blank)))).toEqual({
      title: "T", due_on: null, points: null, stage: null, owner_id: null, notes: null, created_by: "", ...asBefore,
    });
  });

  it("leaves an edit's untouched fields as they were", () => {
    expect(blankValues(blank, fields, "edit", new Set(["due_on"]))).toEqual({ ...blank, due_on: null });
  });

  it("keeps every real value, falsy ones included", () => {
    const values = { title: "T", points: 0, notes: null, done: false, tags: [] };
    expect(blankValues(values, fields, "create")).toEqual(values);
  });

  it("sends a create without an empty nullable date, and an edit that empties it with null", async () => {
    const create = vi.fn(async (_r: string, { data }: { data: unknown }) => ({ data: { id: "t9", ...(data as object) } }));
    const update = vi.fn(async (_r: string, { id, data }: { id: string | number; data: unknown }) => ({ data: { id, ...(data as object) } }));
    const { wrapper } = setup({ create: create as unknown as DataProvider["create"], update: update as unknown as DataProvider["update"] });
    const dates = [
      { key: "title", type: "text" as const },
      { key: "due_on", type: "date" as const, nullable: true },
      { key: "notes", type: "text" as const, nullable: true },
    ];
    const { result: created } = renderHook(() => useResourceForm({ resource: "tasks", action: "create", fields: dates }), { wrapper });
    await act(async () => {
      await created.current.handleSave({ title: "New", due_on: "", notes: "" });
    });
    expect(create.mock.calls[0]![1].data).toEqual({ title: "New" });
    const { result: edited } = renderHook(
      () =>
        useResourceForm({
          resource: "tasks",
          action: "edit",
          id: "t1",
          initialData: { id: "t1", title: "W", due_on: "2026-01-01", notes: "" },
          fields: dates,
        }),
      { wrapper },
    );
    act(() => {
      edited.current.form.setValue("due_on", "");
    });
    await act(async () => {
      await edited.current.handleSave({ title: "W", due_on: "", notes: "" });
    });
    // The emptied date is null; the untouched "" note goes as it was.
    expect(update.mock.calls[0]![1].data).toEqual({ title: "W", due_on: null, notes: "" });
  });
});
