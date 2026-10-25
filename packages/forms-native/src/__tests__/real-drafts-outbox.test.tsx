// @feat:forms-native
// The seams with genesis-forms' real draft store and outbox, and genesis-forms-react's
// useFormDraft: what an app wires, end to end, with storage in memory.
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { createDraftStore, createSubmitOutbox, defineForm, f, memoryStorage, type KeyValueStorage, type SubmitOutbox } from "@marktiderman/genesis-forms";
import { useFormDraft, type FormDraftState } from "@marktiderman/genesis-forms-react";
import { FormFocus, type FormDraftLike, type OutboxLike } from "../index";
import { byTestId, flush, next, press, queryTestId, screen, type } from "./helpers";

const form = defineForm({
  id: "check-in",
  title: "Check-in",
  layout: { mode: "focus" },
  blocks: [f.shortText("name", { label: "Name", required: true }), f.yesNo("trained", { label: "Trained?" }), f.shortText("notes", { label: "Notes" })],
}).definition;

// The real types fit the seams as they are.
const fitsDraft = (d: FormDraftState): FormDraftLike => d;
const fitsOutbox = (o: SubmitOutbox): OutboxLike => o;
void fitsDraft;
void fitsOutbox;

/** AsyncStorage-like: every call answers with a promise. */
function asyncStorage(inner = memoryStorage()): KeyValueStorage & { keys(): string[] } {
  return {
    getItem: async (k) => inner.getItem(k),
    setItem: async (k, v) => inner.setItem(k, v),
    removeItem: async (k) => inner.removeItem(k),
    keys: () => inner.keys(),
  };
}

function CheckIn({ storage, outbox }: { storage: KeyValueStorage; outbox?: SubmitOutbox }) {
  const draft = useFormDraft(form, { store: createDraftStore(storage), respondent: "member-1", delayMs: 0 });
  return <FormFocus draft={draft} outbox={outbox} createKey={() => "key-0000000000000009"} autoAdvance={false} />;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("with useFormDraft and createSubmitOutbox", () => {
  it("loads an async draft, resumes it, and queues offline, clearing the draft", async () => {
    const storage = asyncStorage();
    const first = render(<CheckIn storage={storage} />);
    await vi.waitFor(() => expect(queryTestId("form-name")).not.toBeNull());
    type("form-name", "Ada");
    next();
    await flush();
    // The draft is saved asynchronously: wait for it to land rather than a fixed delay (slow CI runners).
    await vi.waitFor(() => expect(storage.keys().some((k) => k.includes("check-in"))).toBe(true));
    first.unmount();
    await wait(20);
    expect(storage.keys().some((k) => k.includes("check-in"))).toBe(true);

    const send = vi.fn(async () => ({ ok: true, id: "r1", receivedAt: new Date(0).toISOString() }));
    const outbox = createSubmitOutbox({ storage: asyncStorage(), send, online: false, createKey: () => "unused-key-000000001" });
    await outbox.ready;
    render(<CheckIn storage={storage} outbox={outbox} />);
    // Loading while the async store reads, then the step the respondent reached.
    expect(queryTestId("form-loading")).not.toBeNull();
    await vi.waitFor(() => expect(queryTestId("form-trained-option-yes")).not.toBeNull());
    screen.getByText("We kept your answers from last time.");
    press("form-trained-option-yes");
    next();
    type("form-notes", "Good week");
    next();
    await vi.waitFor(() => expect(queryTestId("form-ending")).not.toBeNull());
    expect(byTestId("form-status").textContent).toContain("Saved on this device");
    expect(outbox.getSnapshot().items.map((i) => i.id)).toEqual(["key-0000000000000009"]);
    await vi.waitFor(() => expect(storage.keys().some((k) => k.includes("check-in"))).toBe(false));
    expect(send).not.toHaveBeenCalled();
    // Back online: it is sent and leaves the outbox.
    outbox.start();
    outbox.setOnline(true);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(byTestId("form-status").textContent).toContain("Your answers were sent."));
    outbox.stop();
  });
});
