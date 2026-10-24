// @feat:forms-drafts @feat:forms-outbox
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import {
  createDraftStore,
  createSubmitOutbox,
  defineForm,
  f,
  memoryStorage,
  type DraftStore,
  type FieldBlock,
  type FormDefinition,
  type KeyValueStorage,
} from "@marktiderman/genesis-forms";
import { useFormDraft, useSubmitOutbox, type FormDraftState, type SubmitOutboxState } from "../index";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const def = defineForm({
  id: "checkin",
  title: "Check-in",
  layout: { mode: "focus" },
  blocks: [f.shortText("name", { label: "Name" }), f.rating("energy", { label: "Energy?" })],
}).definition as FormDefinition;
const id = (key: string) => def.blocks.find((b): b is FieldBlock => b.kind === "field" && b.key === key)!.id;

function Host({ store, version, onState }: { store: DraftStore; version?: string; onState: (s: FormDraftState) => void }) {
  const state = useFormDraft(def, { store, respondent: "session-1", version, delayMs: 50 });
  onState(state);
  return null;
}

describe("useFormDraft", () => {
  it("restores a draft on the first render with a synchronous store, where the respondent was", async () => {
    const store = createDraftStore(memoryStorage());
    let state!: FormDraftState;
    const first = render(<Host store={store} version="v1" onState={(s) => (state = s)} />);
    expect(state.draft).toBe("none");
    act(() => {
      state.engine!.setValue(id("name"), "Riley");
      state.engine!.next();
    });
    await act(() => state.flush());
    first.unmount();

    render(<Host store={store} version="v1" onState={(s) => (state = s)} />);
    expect(state.draft).toBe("restored");
    expect(state.engine!.getState().values[id("name")]).toBe("Riley");
    expect(state.engine!.getState().current).toBe(id("energy"));
  });

  it("restores from an async store once it is read", async () => {
    const map = new Map<string, string>();
    const asyncStorage: KeyValueStorage = {
      getItem: async (k) => map.get(k) ?? null,
      setItem: async (k, v) => void map.set(k, v),
      removeItem: async (k) => void map.delete(k),
    };
    const store = createDraftStore(asyncStorage);
    await store.set({
      formId: "checkin",
      version: "v1",
      respondent: "session-1",
      values: { [id("name")]: "Riley" },
      types: { [id("name")]: "short-text" },
      resumeAt: null,
      savedAt: Date.now(),
    });
    let state!: FormDraftState;
    render(<Host store={store} version="v1" onState={(s) => (state = s)} />);
    expect(state.engine).toBeNull();
    expect(state.draft).toBe("loading");
    await waitFor(() => expect(state.engine).not.toBeNull());
    expect(state.draft).toBe("restored");
    expect(state.engine!.getState().values[id("name")]).toBe("Riley");
  });

  it("discards a draft that no longer fits a new version", async () => {
    const storage = memoryStorage();
    const store = createDraftStore(storage);
    await store.set({
      formId: "checkin",
      version: "v1",
      respondent: "session-1",
      values: { gone: "x" },
      types: { gone: "short-text" },
      resumeAt: null,
      savedAt: Date.now(),
    });
    let state!: FormDraftState;
    render(<Host store={store} version="v2" onState={(s) => (state = s)} />);
    expect(state.draft).toBe("discarded");
    expect(state.engine!.getState().values).toEqual({});
    expect(storage.keys()).toEqual([]);
  });

  it("saves as the respondent types, and clear removes it for good", async () => {
    const storage = memoryStorage();
    const store = createDraftStore(storage);
    let state!: FormDraftState;
    render(<Host store={store} version="v1" onState={(s) => (state = s)} />);
    act(() => state.engine!.setValue(id("name"), "Riley"));
    await waitFor(() => expect(state.savedAt).not.toBeNull());
    expect(storage.keys()).toHaveLength(1);
    await act(() => state.clear());
    act(() => state.engine!.setValue(id("name"), "Riley Q"));
    await new Promise((r) => setTimeout(r, 100));
    expect(storage.keys()).toEqual([]);
  });
});

describe("useSubmitOutbox", () => {
  it("shows what's waiting and follows the browser going offline and online", async () => {
    const send = vi.fn(async () => ({ ok: true, id: "resp-1", receivedAt: "t" }));
    const outbox = createSubmitOutbox({ storage: memoryStorage(), send, online: false, log: () => {} });
    let state!: SubmitOutboxState;
    function Status() {
      state = useSubmitOutbox(outbox, { trackOnline: true });
      return null;
    }
    Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => false });
    render(<Status />);
    await act(() => outbox.enqueue({ formId: "checkin", submission: { answers: {} } }).then(() => undefined));
    expect(state.pending).toBe(1);
    expect(state.online).toBe(false);
    expect(send).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(state.pending).toBe(0));
    expect(send).toHaveBeenCalledTimes(1);
    expect(state.online).toBe(true);
    outbox.stop();
  });
});
