// @feat:forms-native
// Regressions for the adversarial review's findings.
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { setErrorReporter } from "@marktiderman/genesis-core/errors";
import { createForm, defineForm, f } from "@marktiderman/genesis-forms";
import { KeyboardScrollProvider, type KeyboardToolbarProps } from "@marktiderman/genesis-ui-native/layouts";
import { announcements } from "../../test-utils/rn-mock";
import { FormFocus, randomKey, type OutboxEnqueueLike, type OutboxLike } from "../index";
import { act, byTestId, fireEvent, flush, next, press, queryTestId, renderForm, screen, type } from "./helpers";
import { keyboardLacksReturnKey } from "../context";

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
    const reporter = vi.fn();
    const restore = setErrorReporter(reporter);
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
    // The host's bug is reported through genesis-core's seam (the app's crash reporter).
    expect(reporter).toHaveBeenCalledWith(expect.objectContaining({ message: "host bug" }), { source: "forms-native:on-queued" });
    restore();
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
  const def = defineForm({
    id: "keys",
    title: "Keys",
    layout: { mode: "focus" },
    blocks: [f.number("n", { label: "N", min: 0 }), f.shortText("last", { label: "Last" })],
  }).definition;

  // The app's KeyboardToolbar (react-native-keyboard-controller), as GenesisNativeApp provides it.
  const toolbarProps: KeyboardToolbarProps[] = [];
  // Whether each press let the toolbar close the keyboard (KeyboardToolbar does unless prevented).
  const dismissedKeyboard: boolean[] = [];
  function FakeToolbar(props: KeyboardToolbarProps) {
    toolbarProps.push(props);
    return (
      <button
        data-testid="keyboard-toolbar-done"
        onClick={() => {
          let prevented = false;
          props.onDoneCallback?.({ preventDefault: () => (prevented = true) });
          dismissedKeyboard.push(!prevented);
        }}
      >
        {props.doneText}
      </button>
    );
  }
  function FakeScroll({ children }: { children?: ReactNode }) {
    return <div>{children}</div>;
  }

  it("say Send on the last question, and the keyboard toolbar above a pad with no return key carries Next", () => {
    const engine = createForm(def);
    render(
      <KeyboardScrollProvider component={FakeScroll} toolbar={FakeToolbar}>
        <FormFocus engine={engine} autoAdvance={false} />
      </KeyboardScrollProvider>,
    );
    // No InputAccessoryView (deprecated in React Native 0.88): the app's toolbar instead, while the pad is up.
    expect(byTestId("form-n").getAttribute("data-accessory-id")).toBeNull();
    expect(queryTestId("keyboard-toolbar-done")).toBeNull();
    act(() => {
      fireEvent.focus(byTestId("form-n"));
    });
    expect(toolbarProps.at(-1)).toMatchObject({ showArrows: false, doneText: "Next" });
    type("form-n", "3");
    press("keyboard-toolbar-done");
    expect(engine.getState().current).toBe(engine.idOf("last"));
    // Next kept the keyboard up for the next answer.
    expect(dismissedKeyboard).toEqual([false]);
    // A text keyboard has its own return key (Send here): no bar repeating it.
    expect(byTestId("form-last").getAttribute("data-return-key")).toBe("send");
    expect(queryTestId("keyboard-toolbar-done")).toBeNull();
  });

  it("know which keyboards lack a return key: iOS's pads before iOS 26 only", () => {
    expect(keyboardLacksReturnKey("number-pad", "ios", "18.6")).toBe(true);
    expect(keyboardLacksReturnKey("phone-pad", "ios", "17.0")).toBe(true);
    expect(keyboardLacksReturnKey("number-pad", "ios", "26.0")).toBe(false);
    expect(keyboardLacksReturnKey("default", "ios", "18.6")).toBe(false);
    expect(keyboardLacksReturnKey("number-pad", "android", 35)).toBe(false);
    expect(keyboardLacksReturnKey(undefined, "ios", "18.6")).toBe(false);
  });

  it("without the app's toolbar, a pad still moves on with the form's own Next", () => {
    const { engine } = renderForm(def, { autoAdvance: false });
    expect(queryTestId("keyboard-toolbar-done")).toBeNull();
    type("form-n", "3");
    next();
    expect(engine.getState().current).toBe(engine.idOf("last"));
  });
});
