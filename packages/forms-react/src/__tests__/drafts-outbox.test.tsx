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
import {
  outboxSubmit,
  useFormController,
  useFormDraft,
  useSubmitOutbox,
  type FormController,
  type FormDraftState,
  type SubmitOutboxState,
} from "../index";
import type { FormEngine, OutboxItem, SubmitOutbox } from "@marktiderman/genesis-forms";

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

  it("says error when the draft can't be read, and leaves the stored one alone", async () => {
    const storage = memoryStorage();
    const good = createDraftStore(storage);
    await good.set({
      formId: "checkin",
      version: "v1",
      respondent: "session-1",
      values: { [id("name")]: "Riley" },
      types: { [id("name")]: "short-text" },
      resumeAt: null,
      savedAt: Date.now(),
    });
    const broken: DraftStore = { ...good, get: () => Promise.reject(new Error("storage busy")) };
    let state!: FormDraftState;
    const errors: unknown[] = [];
    function Broken() {
      state = useFormDraft(def, { store: broken, respondent: "session-1", version: "v1", delayMs: 10, onError: (e) => errors.push(e) });
      return null;
    }
    render(<Broken />);
    await waitFor(() => expect(state.draft).toBe("error"));
    act(() => state.engine!.next());
    await new Promise((r) => setTimeout(r, 50));
    expect(errors).toHaveLength(1);
    expect(await good.get({ formId: "checkin", version: "v1", respondent: "session-1" })).not.toBeNull();
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

describe("outboxSubmit with useFormController", () => {
  const classic = defineForm({ id: "note", title: "Note", blocks: [f.shortText("text", { label: "Text" })] })
    .definition as FormDefinition;
  const textId = classic.blocks[0]!.id;

  function Filled({ engine, outbox, clear, onController }: {
    engine: FormEngine;
    outbox: SubmitOutbox;
    clear: () => Promise<void>;
    onController: (c: FormController) => void;
  }) {
    onController(useFormController(engine, { onSubmit: outboxSubmit(outbox, { formId: "note", clearDraft: clear }) }));
    return null;
  }
  function Page({ outbox, store, onController }: { outbox: SubmitOutbox; store: DraftStore; onController: (c: FormController) => void }) {
    const { engine, clear } = useFormDraft(classic, { store, respondent: "s", version: "v1", delayMs: 10 });
    return engine ? <Filled engine={engine} outbox={outbox} clear={clear} onController={onController} /> : null;
  }

  it("queues the submission, clears the draft and shows the ending while offline", async () => {
    const draftStorage = memoryStorage();
    const store = createDraftStore(draftStorage);
    const send = vi.fn(async () => ({ ok: true, id: "r", receivedAt: "t" }));
    const outbox = createSubmitOutbox({ storage: memoryStorage(), send, online: false, log: () => {} });
    let controller!: FormController;
    render(<Page outbox={outbox} store={store} onController={(c) => (controller = c)} />);
    act(() => controller.engine.setValue(textId, "hello"));
    await waitFor(() => expect(draftStorage.keys()).toHaveLength(1));
    await act(async () => controller.submit());
    await waitFor(() => expect(controller.showEnding).toBe(true));
    expect(outbox.getSnapshot().items[0]!.request.events).toEqual(controller.engine.getState().events);
    expect(draftStorage.keys()).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it("fails the send and keeps the draft when the outbox can't store it", async () => {
    const draftStorage = memoryStorage();
    const store = createDraftStore(draftStorage);
    const full: KeyValueStorage = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); }, removeItem: () => {} };
    const outbox = createSubmitOutbox({ storage: full, send: async () => ({}), online: false, log: () => {} });
    let controller!: FormController;
    render(<Page outbox={outbox} store={store} onController={(c) => (controller = c)} />);
    act(() => controller.engine.setValue(textId, "hello"));
    await waitFor(() => expect(draftStorage.keys()).toHaveLength(1));
    await act(async () => controller.submit());
    await waitFor(() => expect(controller.phase).toBe("failed"));
    expect(controller.showEnding).toBe(false);
    expect(draftStorage.keys()).toHaveLength(1);
  });
});

describe("outboxSubmit", () => {
  it("queues hidden inputs with the event log, and leaves them out when there are none", async () => {
    const enqueue = vi.fn(async (_input: unknown) => ({ id: "q" }) as unknown as OutboxItem);
    const outbox = { enqueue } as unknown as SubmitOutbox;
    const engineWith = (hidden: Record<string, string>) =>
      ({ getState: () => ({ events: [], hidden }) }) as unknown as FormEngine;

    await outboxSubmit(outbox, { formId: "f" })(engineWith({ gym: "hilltop" }));
    expect(enqueue.mock.calls[0]![0]).toMatchObject({ submission: { events: [], hidden: { gym: "hilltop" } } });

    await outboxSubmit(outbox, { formId: "f" })(engineWith({}));
    expect(enqueue.mock.calls[1]![0]).toEqual(expect.objectContaining({ submission: { events: [] } }));
  });
});
