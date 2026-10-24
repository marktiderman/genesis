// @feat:forms-drafts
// Drafts on the device: saved as the respondent goes (debounced), put back on the next
// visit, refused whole when the form changed so they no longer fit.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDraftAutosave,
  createDraftStore,
  createForm,
  defineForm,
  draftOf,
  DRAFT_MAX_AGE_MS,
  f,
  memoryStorage,
  restoreDraft,
  webStorage,
  type DraftKey,
  type FieldBlock,
  type FormDefinition,
  type KeyValueStorage,
} from "../index";

const def = defineForm({
  id: "intake",
  title: "Intake",
  layout: { mode: "focus" },
  blocks: [
    f.shortText("name", { label: "Name" }),
    f.rating("energy", { label: "Energy?" }),
    f.shortText("id_number", { label: "ID number", sensitive: true }),
    f.longText("goals", { label: "Goals" }),
  ],
}).definition as FormDefinition;
const id = (key: string) => def.blocks.find((b): b is FieldBlock => b.kind === "field" && b.key === key)!.id;
const key: DraftKey = { formId: "intake", version: "v1", respondent: "session-1" };

describe("draftOf and restoreDraft", () => {
  it("saves the answers and where the respondent got to, without sensitive ones", () => {
    const engine = createForm(def);
    engine.setValue(id("name"), "Riley");
    engine.next();
    engine.setValue(id("energy"), 4);
    engine.next();
    engine.setValue(id("id_number"), "123-45");
    const draft = draftOf(engine, key, { now: () => 1000 })!;
    expect(draft).toMatchObject({
      ...key,
      values: { [id("name")]: "Riley", [id("energy")]: 4 },
      types: { [id("name")]: "short-text", [id("energy")]: "rating" },
      resumeAt: id("id_number"),
      savedAt: 1000,
    });
    expect(draftOf(engine, key, { keepSensitive: true })!.values[id("id_number")]).toBe("123-45");
  });

  it("is null when nothing is answered", () => {
    expect(draftOf(createForm(def), key)).toBeNull();
  });

  it("puts a draft back at the same version, where the respondent was", () => {
    const engine = createForm(def);
    engine.setValue(id("name"), "Riley");
    engine.next();
    const draft = draftOf(engine, key)!;
    const restored = restoreDraft(def, draft, { version: "v1" });
    expect(restored).toEqual({ ok: true, values: { [id("name")]: "Riley" }, resumeAt: id("energy") });
    if (!restored.ok) return;
    const again = createForm(def, { initialValues: restored.values, resumeAt: restored.resumeAt });
    expect(again.getState().current).toBe(id("energy"));
    expect(again.getState().values[id("name")]).toBe("Riley");
  });

  it("keeps a draft across a new version when every answer still fits", () => {
    const edited = { ...def, title: "Intake (new wording)" };
    const draft = { ...key, values: { [id("name")]: "Riley" }, types: { [id("name")]: "short-text" }, resumeAt: null, savedAt: Date.now() };
    expect(restoreDraft(edited, draft, { version: "v2" }).ok).toBe(true);
  });

  it("refuses the whole draft at a new version when an answer no longer fits", () => {
    const draft = {
      ...key,
      values: { [id("name")]: "Riley", [id("energy")]: 4 },
      types: { [id("name")]: "short-text", [id("energy")]: "rating" },
      resumeAt: null,
      savedAt: Date.now(),
    };
    // The question was removed.
    const removed = { ...def, blocks: def.blocks.filter((b) => b.id !== id("energy")) };
    expect(restoreDraft(removed, draft, { version: "v2" })).toEqual({ ok: false, reason: "version" });
    // It changed type.
    const retyped = { ...def, blocks: def.blocks.map((b) => (b.id === id("energy") ? { ...b, type: "short-text" } : b)) } as FormDefinition;
    expect(restoreDraft(retyped, draft, { version: "v2" })).toEqual({ ok: false, reason: "version" });
    // The answer isn't valid for it any more (a 1 to 3 scale now).
    const narrowed = {
      ...def,
      blocks: def.blocks.map((b) => (b.id === id("energy") ? { ...b, props: { ...(b as FieldBlock).props, max: 3 } } : b)),
    } as FormDefinition;
    expect(restoreDraft(narrowed, draft, { version: "v2" })).toEqual({ ok: false, reason: "version" });
    // The same version is trusted as it is.
    expect(restoreDraft(removed, draft, { version: "v1" }).ok).toBe(true);
  });

  it("refuses a draft older than maxAgeMs", () => {
    const draft = { ...key, values: { [id("name")]: "Riley" }, types: { [id("name")]: "short-text" }, resumeAt: null, savedAt: 0 };
    expect(restoreDraft(def, draft, { version: "v1", now: () => DRAFT_MAX_AGE_MS + 1 })).toEqual({ ok: false, reason: "expired" });
    expect(restoreDraft(def, draft, { version: "v1", now: () => 10, maxAgeMs: 100 }).ok).toBe(true);
  });
});

describe("createDraftStore", () => {
  it("keeps one draft per form and respondent, whatever the version", async () => {
    const storage = memoryStorage();
    const store = createDraftStore(storage);
    const draft = { ...key, values: { a: 1 }, types: { a: "rating" }, resumeAt: null, savedAt: 1 };
    await store.set(draft);
    expect(await store.get({ ...key, version: "v9" })).toEqual(draft);
    expect(await store.get({ ...key, respondent: "someone-else" })).toBeNull();
    expect(storage.keys()).toEqual(["genesis-forms:draft:intake:session-1"]);
    await store.remove(key);
    expect(await store.get(key)).toBeNull();
  });

  it("answers null for an entry that isn't a draft", async () => {
    const storage = memoryStorage();
    storage.setItem("genesis-forms:draft:intake:session-1", "{not json");
    expect(await createDraftStore(storage).get(key)).toBeNull();
    storage.setItem("genesis-forms:draft:intake:session-1", JSON.stringify({ formId: "intake", respondent: "session-1" }));
    expect(await createDraftStore(storage).get(key)).toBeNull();
  });

  it("works over an async store (AsyncStorage's shape)", async () => {
    const map = new Map<string, string>();
    const asyncStorage: KeyValueStorage = {
      getItem: async (k) => map.get(k) ?? null,
      setItem: async (k, v) => void map.set(k, v),
      removeItem: async (k) => void map.delete(k),
    };
    const store = createDraftStore(asyncStorage, { prefix: "app:" });
    const draft = { ...key, values: { a: 1 }, types: { a: "rating" }, resumeAt: null, savedAt: 1 };
    await store.set(draft);
    expect([...map.keys()]).toEqual(["app:intake:session-1"]);
    expect(await store.get(key)).toEqual(draft);
  });

  it("webStorage throws on use, not on creation, where there is no localStorage", () => {
    const storage = webStorage(() => undefined);
    expect(() => storage.getItem("x")).toThrow(/isn't available/);
  });
});

describe("createDraftAutosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves once, after the respondent pauses", async () => {
    const storage = memoryStorage();
    const set = vi.spyOn(storage, "setItem");
    const store = createDraftStore(storage);
    const engine = createForm(def);
    const saver = createDraftAutosave(engine, store, key, { delayMs: 500 });
    for (const text of ["R", "Ri", "Ril", "Riley"]) {
      engine.setValue(id("name"), text);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(set).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(set).toHaveBeenCalledTimes(1);
    expect((await store.get(key))!.values[id("name")]).toBe("Riley");
    await saver.dispose();
  });

  it("flushes what's waiting on dispose, and clear removes the draft and stops saving", async () => {
    const store = createDraftStore(memoryStorage());
    const engine = createForm(def);
    const saver = createDraftAutosave(engine, store, key);
    engine.setValue(id("name"), "Riley");
    await saver.dispose();
    expect((await store.get(key))!.values[id("name")]).toBe("Riley");

    const second = createDraftAutosave(engine, store, key);
    engine.setValue(id("name"), "Riley Q");
    await second.clear();
    await vi.advanceTimersByTimeAsync(5_000);
    engine.setValue(id("name"), "after clear");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await store.get(key)).toBeNull();
  });

  it("removes the draft when every answer is cleared", async () => {
    const store = createDraftStore(memoryStorage());
    const engine = createForm(def);
    const saver = createDraftAutosave(engine, store, key, { delayMs: 10 });
    engine.setValue(id("name"), "Riley");
    await vi.advanceTimersByTimeAsync(10);
    expect(await store.get(key)).not.toBeNull();
    engine.setValue(id("name"), "");
    await vi.advanceTimersByTimeAsync(10);
    expect(await store.get(key)).toBeNull();
    await saver.dispose();
  });

  it("never removes a stored draft it didn't write before anything is answered", async () => {
    const store = createDraftStore(memoryStorage());
    await store.set({ ...key, values: { [id("name")]: "Riley" }, types: { [id("name")]: "short-text" }, resumeAt: null, savedAt: 1 });
    // The read failed, so the form started empty: moving about must not wipe the stored draft.
    const engine = createForm(def);
    const saver = createDraftAutosave(engine, store, key, { delayMs: 10 });
    engine.next();
    engine.back();
    await vi.advanceTimersByTimeAsync(50);
    expect(await store.get(key)).not.toBeNull();
    await saver.dispose();

    // Restored (`stored: true`), and every answer cleared: removed.
    const restored = createForm(def, { initialValues: { [id("name")]: "Riley" } });
    const again = createDraftAutosave(restored, store, key, { delayMs: 10, stored: true });
    restored.setValue(id("name"), "");
    await vi.advanceTimersByTimeAsync(10);
    expect(await store.get(key)).toBeNull();
    await again.dispose();
  });

  it("reports a failed save and keeps going", async () => {
    const errors: unknown[] = [];
    let full = true;
    const storage = memoryStorage();
    const flaky: KeyValueStorage = {
      ...storage,
      setItem: (k, v) => {
        if (full) throw new Error("QuotaExceededError");
        return storage.setItem(k, v);
      },
    };
    const store = createDraftStore(flaky);
    const engine = createForm(def);
    const saver = createDraftAutosave(engine, store, key, { delayMs: 10, onError: (e) => errors.push(e) });
    engine.setValue(id("name"), "Riley");
    await vi.advanceTimersByTimeAsync(10);
    expect(errors).toHaveLength(1);
    full = false;
    engine.setValue(id("name"), "Riley Q");
    await vi.advanceTimersByTimeAsync(10);
    expect((await store.get(key))!.values[id("name")]).toBe("Riley Q");
    await saver.dispose();
  });
});
