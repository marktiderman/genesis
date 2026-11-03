// @vitest-environment happy-dom
// @feat:data-offline
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ResourceFormFieldDef } from "../../form-types";
import { GenesisProvider } from "../../provider/context";
import type { DataProvider } from "../../provider/types";
import { DataWriteError } from "../../schema/write-outcome";
import { writeConflict } from "../../schema/write-state";
import { useResourceForm } from "../use-resource-form";

const fields: ResourceFormFieldDef[] = [
  { key: "title", label: "Title", type: "text" },
  { key: "notes", label: "Notes", type: "text", required: false },
];

/** A provider whose first update (or the first `failures`) meets someone else's change; later ones save. */
function setup(theirs: Record<string, unknown> = { id: "t1", title: "Theirs", notes: "same", version: 5 }, failures = 1) {
  const update = vi.fn(async (_resource: string, params: { data: Record<string, unknown>; expectedVersion?: string }) => {
    if (update.mock.calls.length <= failures) {
      throw new DataWriteError("conflict", "Someone else changed this task after you opened it.", { current: theirs, currentVersion: "5" });
    }
    return { data: { id: "t1", ...params.data, version: 6 } };
  });
  const provider = {
    update,
    capabilities: async () => ({
      search: false,
      sort: false,
      filterOperators: [],
      bulkWrites: false,
      versionedWrites: true,
      compositeKeys: false,
      version: { field: "version", kind: "integer" as const },
    }),
  } as unknown as DataProvider;
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={provider} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
  const initialData = { id: "t1", title: "Old", notes: "same", version: 3 };
  const hook = renderHook(() => useResourceForm({ resource: "tasks", action: "edit", id: "t1", initialData, fields }), { wrapper });
  return { hook, update, theirs };
}

async function saveMine(hook: ReturnType<typeof setup>["hook"]) {
  await act(async () => {
    await hook.result.current.handleSave({ title: "Mine", notes: "same" });
  });
}

describe("writeConflict", () => {
  it("offers only the fields this person changed, and counts a field their row lacks as different", () => {
    const error = new DataWriteError("conflict", "x", { current: { title: "T", notes: "theirs" }, currentVersion: "2" });
    const found = writeConflict(error, { title: "Mine", notes: "loaded", secret: "s" }, { changed: ["title", "secret"] });
    expect(found?.fields).toEqual(["title", "secret"]);
  });

  it("compares like a person would: empty is empty, numbers and their text, dates, key order", () => {
    const error = new DataWriteError("conflict", "x", {
      current: { a: null, b: 5, c: "2026-11-12T00:00:00+00:00", d: { x: 1, y: 2 }, e: true },
      currentVersion: "2",
    });
    expect(writeConflict(error, { a: "", b: "5", c: "2026-11-12", d: { y: 2, x: 1 }, e: true })?.fields).toEqual([]);
    expect(writeConflict(error, { a: "x", b: "6", e: false })?.fields).toEqual(["a", "b", "e"]);
  });

  it("compares in the form's shape when given a view", () => {
    const error = new DataWriteError("conflict", "x", { current: { status: "done" }, currentVersion: "2" });
    const found = writeConflict(error, { done: true }, { view: (row) => ({ done: row.status === "done" }) });
    expect(found?.fields).toEqual([]);
    expect(found?.theirs).toEqual({ done: true });
  });

  it("names the fields where mine and theirs differ, in mine's order", () => {
    const error = new DataWriteError("conflict", "x", { current: { id: 1, a: 1, b: "x", c: [1] }, currentVersion: "9" });
    expect(writeConflict(error, { c: [1], a: 2, b: "x" })).toEqual({
      theirs: { id: 1, a: 1, b: "x", c: [1] },
      mine: { c: [1], a: 2, b: "x" },
      fields: ["a"],
      currentVersion: "9",
    });
  });

  it("is null for anything but a conflict carrying the row", () => {
    expect(writeConflict(new DataWriteError("forbidden", "x"), {})).toBeNull();
    expect(writeConflict(new DataWriteError("conflict", "x"), {})).toBeNull();
    expect(writeConflict(new Error("x"), {})).toBeNull();
  });

  it("treats null and undefined as the same empty value", () => {
    const error = new DataWriteError("conflict", "x", { current: { a: null } });
    expect(writeConflict(error, { a: undefined })?.fields).toEqual([]);
  });
});

describe("useResourceForm on a conflict", () => {
  it("exposes the conflict: theirs beside what the form tried to save", async () => {
    const { hook } = setup();
    await saveMine(hook);
    expect(hook.result.current.conflict).toMatchObject({ fields: ["title"], currentVersion: "5" });
    expect(hook.result.current.conflict?.theirs.title).toBe("Theirs");
    expect(hook.result.current.conflict?.mine.title).toBe("Mine");
  });

  it("keep mine saves the same values again at the version the conflict reported", async () => {
    const { hook, update } = setup();
    await saveMine(hook);
    expect(update.mock.calls[0]![1].expectedVersion).toBe("3");
    await act(async () => {
      await hook.result.current.keepMine();
    });
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1]![1]).toMatchObject({ data: { title: "Mine" }, expectedVersion: "5" });
    expect(hook.result.current.conflict).toBeNull();
  });

  it("take theirs drops the form's values and shows their row", async () => {
    const { hook, update } = setup();
    await saveMine(hook);
    act(() => hook.result.current.takeTheirs());
    expect(hook.result.current.conflict).toBeNull();
    // Their row is the form's starting point now (its inputs register with it).
    await waitFor(() => expect(hook.result.current.form.formState.defaultValues?.title).toBe("Theirs"));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("dismissing keeps the form's values, unsaved", async () => {
    const { hook } = setup();
    act(() => hook.result.current.form.setValue("title", "Mine"));
    await saveMine(hook);
    act(() => hook.result.current.dismissConflict());
    expect(hook.result.current.conflict).toBeNull();
    expect(hook.result.current.form.getValues("title")).toBe("Mine");
  });

  it("keep mine never puts back a stale copy of a field only they changed", async () => {
    const { hook, update } = setup({ id: "t1", title: "Old", notes: "Their notes", version: 5 });
    await act(async () => {
      await hook.result.current.handleSave({ title: "Mine", notes: "same" });
    });
    // Only the title is this person's change; their notes aren't a choice.
    expect(hook.result.current.conflict?.fields).toEqual(["title"]);
    await act(async () => {
      await hook.result.current.keepMine();
    });
    expect(update.mock.calls[1]![1]).toMatchObject({ data: { title: "Mine", notes: "Their notes" }, expectedVersion: "5" });
  });

  it("after take theirs, the next save is checked against their version", async () => {
    const { hook, update } = setup();
    await saveMine(hook);
    act(() => hook.result.current.takeTheirs());
    await act(async () => {
      await hook.result.current.handleSave({ title: "Again", notes: "same" });
    });
    expect(update.mock.calls[1]![1].expectedVersion).toBe("5");
  });

  it("keep mine that meets another change shows the new conflict; the sheet isn't closed first", async () => {
    const { hook, update } = setup(undefined, 2);
    await saveMine(hook);
    const first = hook.result.current.conflict;
    await act(async () => {
      await hook.result.current.keepMine();
    });
    expect(update).toHaveBeenCalledTimes(2);
    expect(hook.result.current.conflict).not.toBeNull();
    expect(hook.result.current.conflict).not.toBe(first);
  });

  it("keep mine that fails for another reason rejects with why, and the conflict stays", async () => {
    const { hook, update } = setup();
    await saveMine(hook);
    update.mockImplementationOnce(async () => {
      throw new DataWriteError("error", "The server is down.");
    });
    let failure: unknown;
    await act(async () => {
      await hook.result.current.keepMine().catch((e: unknown) => (failure = e));
    });
    expect((failure as Error).message).toBe("The server is down.");
    expect(hook.result.current.conflict).not.toBeNull();
  });
});
