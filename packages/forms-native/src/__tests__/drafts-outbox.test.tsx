// @feat:forms-native
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { createForm, defineForm, f, type FormEngine } from "@marktiderman/genesis-forms";
import { appStateListeners } from "../../test-utils/rn-mock";
import { FormFocus, submissionStatus, type FormDraftLike, type OutboxEnqueueLike, type OutboxItemLike, type OutboxLike, type OutboxSnapshotLike } from "../index";
import { act, byTestId, flush, next, press, queryTestId, screen, type } from "./helpers";

const form = defineForm({
  id: "check-in",
  title: "Check-in",
  layout: { mode: "focus" },
  blocks: [f.shortText("name", { label: "Name", required: true }), f.yesNo("trained", { label: "Trained?" }), f.longText("notes", { label: "Notes" })],
}).definition;

function fakeDraft(engine: FormEngine | null, draft: FormDraftLike["draft"] = "restored") {
  return { engine, draft, flush: vi.fn(async () => {}), clear: vi.fn(async () => {}) } satisfies FormDraftLike;
}

/** An outbox that stores in memory and sends when told to. */
function fakeOutbox(online = false) {
  let snapshot: OutboxSnapshotLike = { online, items: [] };
  const listeners = new Set<() => void>();
  const set = (next: OutboxSnapshotLike) => {
    snapshot = next;
    for (const l of listeners) l();
  };
  const queued: OutboxEnqueueLike[] = [];
  const outbox = {
    enqueue: vi.fn(async (input: OutboxEnqueueLike): Promise<OutboxItemLike> => {
      queued.push(input);
      const item: OutboxItemLike = { id: input.idempotencyKey ?? `k${queued.length}`, state: "pending", sending: false, lastError: null };
      if (!snapshot.items.some((i) => i.id === item.id)) set({ ...snapshot, items: [...snapshot.items, item] });
      return item;
    }),
    getSnapshot: () => snapshot,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    retry: vi.fn(async () => {}),
  } satisfies OutboxLike;
  return { outbox, queued, set, get: () => snapshot };
}

function answerAll() {
  type("form-name", "Ada");
  next();
  press("form-trained-option-yes");
  next();
  type("form-notes", "Felt strong.");
  next();
}

describe("drafts", () => {
  it("shows a loading screen while the draft is read, then the form", () => {
    const view = render(<FormFocus draft={fakeDraft(null, "loading")} />);
    expect(queryTestId("form-loading")).not.toBeNull();
    const engine = createForm(form);
    view.rerender(<FormFocus draft={fakeDraft(engine, "none")} />);
    expect(queryTestId("form-loading")).toBeNull();
    expect(queryTestId("form-name")).not.toBeNull();
  });

  it("resumes from a draft where the respondent got to, and says so", () => {
    const engine = createForm(form, { initialValues: { [form.blocks[0]!.id]: "Ada" }, resumeAt: form.blocks[1]!.id });
    render(<FormFocus draft={fakeDraft(engine)} autoAdvance={false} />);
    expect(engine.getState().current).toBe(engine.idOf("trained"));
    screen.getByText("We kept your answers from last time.");
    press("form-back");
    expect((byTestId("form-name") as HTMLInputElement).value).toBe("Ada");
  });

  it("says when a draft no longer fits the form", () => {
    render(<FormFocus draft={fakeDraft(createForm(form), "discarded")} />);
    screen.getByText("This form changed since you started it, so it starts again.");
  });

  it("saves the draft when the app goes to the background", () => {
    const draft = fakeDraft(createForm(form));
    render(<FormFocus draft={draft} />);
    act(() => {
      for (const l of appStateListeners) l("background");
    });
    expect(draft.flush).toHaveBeenCalledTimes(1);
  });

  it("clears the draft only once the submission is safe", async () => {
    const draft = fakeDraft(createForm(form), "none");
    let resolve!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    render(<FormFocus draft={draft} onSubmit={onSubmit} autoAdvance={false} />);
    answerAll();
    await flush();
    expect(draft.clear).not.toHaveBeenCalled();
    await act(async () => resolve());
    await flush();
    expect(draft.clear).toHaveBeenCalledTimes(1);
  });

  it("keeps the draft when sending fails", async () => {
    const draft = fakeDraft(createForm(form), "none");
    render(<FormFocus draft={draft} onSubmit={() => Promise.reject(new Error("down"))} autoAdvance={false} />);
    answerAll();
    await flush();
    expect(draft.clear).not.toHaveBeenCalled();
    screen.getByText(/We couldn't send your answers/);
  });
});

describe("the offline outbox", () => {
  it("queues the answers with a stable key, clears the draft, and shows the ending with its status", async () => {
    const { outbox, queued, set, get } = fakeOutbox(false);
    const engine = createForm(form);
    const draft = fakeDraft(engine, "none");
    const onQueued = vi.fn();
    render(<FormFocus draft={draft} outbox={outbox} createKey={() => "key-0000000000000001"} onQueued={onQueued} autoAdvance={false} />);
    answerAll();
    await flush();
    expect(queued).toHaveLength(1);
    expect(queued[0]!.formId).toBe("check-in");
    expect(queued[0]!.idempotencyKey).toBe("key-0000000000000001");
    expect(queued[0]!.submission.events).toEqual(engine.getState().events);
    expect(queued[0]!.meta).toEqual({ title: "Check-in" });
    expect(draft.clear).toHaveBeenCalledTimes(1);
    expect(onQueued).toHaveBeenCalledWith(expect.objectContaining({ id: "key-0000000000000001" }), engine);
    expect(byTestId("form-status").textContent).toContain("Saved on this device. Your answers send when you're back online.");
    act(() => set({ ...get(), online: true, items: get().items.map((i) => ({ ...i, sending: true })) }));
    expect(byTestId("form-status").textContent).toContain("Sending your answers…");
    act(() => set({ ...get(), items: [] }));
    expect(byTestId("form-status").textContent).toContain("Your answers were sent.");
  });

  it("offers a retry for a submission that failed", async () => {
    const { outbox, set, get } = fakeOutbox(true);
    render(<FormFocus form={form} outbox={outbox} createKey={() => "key-0000000000000002"} autoAdvance={false} />);
    answerAll();
    await flush();
    act(() => set({ ...get(), items: get().items.map((i) => ({ ...i, state: "failed" as const, lastError: "The form is closed." })) }));
    expect(byTestId("form-status").textContent).toContain("The form is closed.");
    press("form-status-retry");
    expect(outbox.retry).toHaveBeenCalledWith("key-0000000000000002");
  });

  it("keeps the answers and the draft when the device can't store them, and stores the same submission on Try again", async () => {
    const { outbox, queued } = fakeOutbox(false);
    outbox.enqueue.mockRejectedValueOnce(new Error("storage full"));
    const draft = fakeDraft(createForm(form), "none");
    render(<FormFocus draft={draft} outbox={outbox} createKey={(() => { let n = 0; return () => `key-000000000000000${++n}`; })()} autoAdvance={false} />);
    answerAll();
    await flush();
    screen.getByText(/We couldn't save your answers on this device/);
    expect(draft.clear).not.toHaveBeenCalled();
    next();
    await flush();
    expect(outbox.enqueue).toHaveBeenCalledTimes(2);
    expect(queued[0]!.idempotencyKey).toBe("key-0000000000000001");
    expect(draft.clear).toHaveBeenCalledTimes(1);
    expect(queryTestId("form-ending")).not.toBeNull();
  });
});

describe("submissionStatus", () => {
  it("reads where a submission stands", () => {
    const item = { id: "a", state: "pending" as const, sending: false, lastError: null };
    expect(submissionStatus({ online: false, items: [item] }, "a").status).toBe("waiting");
    expect(submissionStatus({ online: true, items: [item] }, "a").status).toBe("sending");
    expect(submissionStatus({ online: true, items: [] }, "a").status).toBe("sent");
    expect(submissionStatus({ online: true, items: [{ ...item, state: "failed", lastError: "x" }] }, "a")).toEqual({ status: "failed", error: "x" });
  });
});
