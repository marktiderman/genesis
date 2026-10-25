// @feat:forms-native
// Regressions for the adversarial review's findings.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { defineForm, f } from "@marktiderman/genesis-forms";
import { announcements } from "../../test-utils/rn-mock";
import { FormFocus, randomKey, type OutboxEnqueueLike, type OutboxLike } from "../index";
import { act, byTestId, flush, next, press, queryTestId, renderForm, screen, type } from "./helpers";

beforeEach(() => {
  announcements.length = 0;
});

const abc = defineForm({
  id: "abc",
  title: "ABC",
  layout: { mode: "focus" },
  blocks: [f.shortText("a", { label: "A", required: true }), f.shortText("b", { label: "B" }), f.shortText("c", { label: "C", required: true })],
}).definition;

describe("the error summary's links", () => {
  it("go forward to a later question, stopping at one that still needs an answer", () => {
    const { engine } = renderForm(abc, { autoAdvance: false });
    type("form-a", "x");
    next();
    next();
    // Both a and c are wanting; the send moves to a, the first.
    act(() => engine.setValue(engine.idOf("a"), ""));
    next();
    expect(engine.getState().current).toBe(engine.idOf("a"));
    expect(byTestId("form-error-summary").textContent).toContain("2 answers need attention.");
    // c is later: the engine never skips the unanswered a, so the link stays on a and says why.
    press(`form-error-${engine.idOf("c")}`);
    expect(engine.getState().current).toBe(engine.idOf("a"));
    expect(announcements).toContain("This question needs an answer.");
    // Once a is answered, the link reaches c.
    type("form-a", "y");
    press(`form-error-${engine.idOf("c")}`);
    expect(engine.getState().current).toBe(engine.idOf("c"));
  });
});

describe("queueing", () => {
  it("makes a key even without crypto, and a throwing onQueued neither fails the send nor queues it twice", async () => {
    const crypto = globalThis.crypto;
    vi.stubGlobal("crypto", undefined);
    const queued: OutboxEnqueueLike[] = [];
    const snapshot = { online: false, items: [] };
    const outbox: OutboxLike = {
      enqueue: vi.fn(async (input: OutboxEnqueueLike) => {
        queued.push(input);
        return { id: input.idempotencyKey ?? "none", state: "pending" as const };
      }),
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <FormFocus
        form={abc}
        outbox={outbox}
        autoAdvance={false}
        onQueued={() => {
          throw new Error("host bug");
        }}
      />,
    );
    type("form-a", "x");
    next();
    next();
    type("form-c", "z");
    next();
    await flush();
    expect(queued).toHaveLength(1);
    expect(queued[0]!.idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(queryTestId("form-ending")).not.toBeNull();
    warn.mockRestore();
    vi.stubGlobal("crypto", crypto);
  });

  it("randomKey fits the outbox's key pattern", () => {
    expect(randomKey()).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
  });
});

describe("a failed send", () => {
  it("is spoken, not only shown", async () => {
    render(<FormFocus form={abc} onSubmit={() => Promise.reject(new Error("down"))} autoAdvance={false} />);
    type("form-a", "x");
    next();
    next();
    type("form-c", "z");
    next();
    await flush();
    screen.getByText(/We couldn't send your answers/);
    expect(announcements.some((a) => a.startsWith("We couldn't send your answers"))).toBe(true);
  });
});

describe("number keypads", () => {
  it("have a decimal point unless a whole-number step is set", () => {
    const def = defineForm({
      id: "pads",
      title: "Pads",
      layout: { mode: "focus" },
      blocks: [f.number("kg", { label: "Kg", min: 0 }), f.number("reps", { label: "Reps", min: 0, step: 1 })],
    }).definition;
    renderForm(def, { autoAdvance: false });
    expect(byTestId("form-kg").getAttribute("data-keyboard")).toBe("decimal-pad");
    type("form-kg", "72.5");
    next();
    expect(byTestId("form-reps").getAttribute("data-keyboard")).toBe("number-pad");
  });
});

describe("testIDs", () => {
  it("are all prefixed with the form's testID", () => {
    renderForm(abc, { autoAdvance: false, testID: "weekly" });
    expect(queryTestId("weekly-next")).not.toBeNull();
    expect(queryTestId("weekly-progress")).not.toBeNull();
    expect(queryTestId("weekly-a")).not.toBeNull();
    expect(queryTestId("form-next")).toBeNull();
  });
});

describe("return keys", () => {
  it("say Send on the last question, and a bar above a pad with no return key carries Next", () => {
    const def = defineForm({
      id: "keys",
      title: "Keys",
      layout: { mode: "focus" },
      blocks: [f.number("n", { label: "N", min: 0 }), f.shortText("last", { label: "Last" })],
    }).definition;
    const { engine } = renderForm(def, { autoAdvance: false });
    expect(byTestId("form-n").getAttribute("data-accessory-id")).toBe("form-n-keys");
    type("form-n", "3");
    press("form-n-keys-next");
    expect(engine.getState().current).toBe(engine.idOf("last"));
    expect(byTestId("form-last").getAttribute("data-return-key")).toBe("send");
  });
});
