import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createForm, defineForm, f, getFieldType, registerFieldType, when } from "@marktiderman/genesis-forms";
import { Form } from "../index";

const eventFeedback = defineForm({
  id: "event-feedback",
  title: "How was the event?",
  layout: { mode: "focus" },
  hidden: { owner: f.hidden.string({ source: "server" }) },
  blocks: [
    f.rating("overall", { label: "How was today's event?", required: true }),
    f.longText("improve", { label: "Anything we could do better?" }),
    f.yesNo("contact_me", { label: "Want {{hidden:owner|someone}} to follow up with you?" }),
    f.email("email", { label: "Best email to reach you", required: true }),
  ],
  logic: [when("contact_me").isNot(true).hide("email")],
  endings: [{ id: "default", title: "Thanks, see you next time." }],
});

const choices = defineForm({
  id: "choices",
  title: "Choices",
  layout: { mode: "focus" },
  blocks: [
    f.singleChoice("plan", { label: "Which plan?", options: [{ value: "basic", label: "Basic" }, { value: "plus", label: "Plus" }, { value: "pro", label: "Pro" }], required: true }),
    f.multiChoice("days", { label: "Which days?", options: [{ value: "mon", label: "Mon" }, { value: "tue", label: "Tue" }] }),
    f.nps("nps", { label: "Recommend us?" }),
  ],
});

const submit = () => fireEvent.submit(screen.getByRole("button", { name: /OK|Submit|Try again/ }).closest("form")!);
const liveRegion = () => document.querySelector("[data-gf-live]")!;

afterEach(() => vi.useRealTimers());

describe("<Form> introduction", () => {
  it("recalls hidden inputs in the description, like endings", () => {
    const intro = defineForm({
      id: "intro",
      title: "Hi",
      description: "Hosted by {{hidden:owner|us}}",
      layout: { mode: "classic" },
      hidden: { owner: f.hidden.string({ source: "server" }) },
      blocks: [f.shortText("x", { label: "X" })],
    });
    render(<Form form={intro} options={{ hidden: { owner: "Sam" } }} />);
    expect(screen.getByText("Hosted by Sam")).toBeTruthy();
  });

  it("updates a description that recalls an answer as it changes", () => {
    const intro = defineForm({
      id: "intro-recall",
      title: "Hi",
      description: "Hello {{field:name|there}}",
      layout: { mode: "classic" },
      blocks: [f.shortText("name", { label: "Name" })],
    });
    render(<Form form={intro} />);
    expect(screen.getByText("Hello there")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: "Ana" } });
    expect(screen.getByText("Hello Ana")).toBeTruthy();
  });
});

describe("<Form> focus layout", () => {
  it("never shows \"Question 1 of 0\" for a form with nothing to ask", () => {
    const empty = defineForm({ id: "empty", title: "Empty", layout: { mode: "focus" }, blocks: [] });
    render(<Form form={empty} />);
    expect(screen.queryByText(/of 0/)).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("walks one question at a time, showing progress and moving focus", async () => {
    const onSubmit = vi.fn();
    render(<Form form={eventFeedback} autoAdvance={false} onSubmit={onSubmit} options={{ hidden: { owner: "Sam" } }} />);

    // Rating is a real group: fieldset + legend, and a radiogroup named by it.
    expect(screen.getByRole("group", { name: /How was today's event\?/ })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: /How was today's event\?/ })).toBeTruthy();
    expect(screen.getByText("Question 1 of 3")).toBeTruthy();

    submit();
    expect(liveRegion().textContent).toMatch(/needs an answer/);

    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    submit();
    expect(screen.getByLabelText("Anything we could do better?")).toBeTruthy();

    submit();
    expect(screen.getByRole("group", { name: "Want Sam to follow up with you?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    expect(screen.getByText("Question 3 of 3")).toBeTruthy();

    await act(async () => submit());
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: /Thanks, see you next time/ })).toBeTruthy();
  });

  it("goes back along the path", () => {
    render(<Form form={eventFeedback} autoAdvance={false} />);
    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    submit();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("group", { name: /How was today's event\?/ })).toBeTruthy();
  });

  it("moves on by itself after a single pick", () => {
    vi.useFakeTimers();
    render(<Form form={eventFeedback} />);
    fireEvent.click(screen.getByRole("radio", { name: "3" }));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByLabelText("Anything we could do better?")).toBeTruthy();
  });
});

describe("<Form> focus management", () => {
  it("focuses a text field's input, and a group's visible question, never a hidden heading", () => {
    render(<Form form={eventFeedback} autoAdvance={false} />);
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    submit();
    expect(document.activeElement).toBe(screen.getByLabelText("Anything we could do better?"));
    submit();
    const legend = screen.getByText(/to follow up with you\?/);
    expect(legend.tagName).toBe("LEGEND");
    expect(document.activeElement).toBe(legend);
    expect(legend.getAttribute("tabindex")).toBe("-1");
    expect(legend.className).toMatch(/focus-visible:ring/);
    expect(screen.queryByText(/^Question \d+$/)).toBeNull();
  });

  it("announces progress once: the counter is not a live region", () => {
    render(<Form form={eventFeedback} />);
    expect(screen.getByText("Question 1 of 3").closest("[aria-live]")).toBeNull();
  });

  it("doesn't steal focus on first mount under StrictMode", () => {
    render(
      <StrictMode>
        <Form form={eventFeedback} />
      </StrictMode>,
    );
    expect(document.activeElement).toBe(document.body);
  });

  it("focuses the ending heading, and keeps one live region from the form to the ending", async () => {
    render(<Form form={eventFeedback} autoAdvance={false} />);
    const live = liveRegion();
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    submit();
    submit();
    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    await act(async () => submit());
    const heading = screen.getByRole("heading", { name: /Thanks, see you next time/ });
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(liveRegion()).toBe(live);
  });
});

describe("<Form> auto-advance", () => {
  it("never auto-advances from the last question: the respondent presses Submit", async () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn();
    render(<Form form={eventFeedback} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    act(() => vi.advanceTimersByTime(300));
    submit();
    fireEvent.click(screen.getByRole("radio", { name: "No" })); // hides email: this is now the last question
    await act(async () => vi.advanceTimersByTime(1000));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Submit" })).toBeTruthy();
  });

  it("cancels a pending auto-advance on Back", () => {
    vi.useFakeTimers();
    render(<Form form={eventFeedback} />);
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    act(() => vi.advanceTimersByTime(300));
    submit();
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByLabelText("Anything we could do better?")).toBeTruthy();
  });

  it("doesn't advance when arrow keys move the choice; a click still does", async () => {
    render(<Form form={choices} />);
    const basic = screen.getByRole("radio", { name: "Basic" });
    await act(async () => {
      basic.focus();
      fireEvent.keyDown(basic, { key: "ArrowDown" });
      await new Promise((r) => setTimeout(r, 20));
      fireEvent.keyUp(document.activeElement!, { key: "ArrowDown" });
    });
    expect(screen.getByRole("radio", { name: "Plus" }).getAttribute("aria-checked")).toBe("true");
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(screen.getByRole("radiogroup", { name: /Which plan\?/ })).toBeTruthy();

    fireEvent.pointerDown(screen.getByRole("radio", { name: "Pro" }));
    fireEvent.click(screen.getByRole("radio", { name: "Pro" }));
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(screen.getByRole("group", { name: "Which days?" })).toBeTruthy();
  });

  it("selects a rating with arrow keys without advancing", async () => {
    render(<Form form={eventFeedback} />);
    const three = screen.getByRole("radio", { name: "3" });
    await act(async () => {
      three.focus();
      fireEvent.keyDown(three, { key: "ArrowRight" });
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByRole("radio", { name: "4" }).getAttribute("aria-checked")).toBe("true");
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(screen.getByRole("radiogroup", { name: /How was today's event\?/ })).toBeTruthy();
  });

  it("advances when the already-selected rating is picked again after Back", () => {
    vi.useFakeTimers();
    render(<Form form={eventFeedback} />);
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("radio", { name: "4" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByLabelText("Anything we could do better?")).toBeTruthy();
  });

  it("continues on Enter from a radio, like the OK button", () => {
    render(<Form form={eventFeedback} autoAdvance={false} />);
    fireEvent.click(screen.getByRole("radio", { name: "2" }));
    fireEvent.keyDown(screen.getByRole("radio", { name: "2" }), { key: "Enter" });
    expect(screen.getByLabelText("Anything we could do better?")).toBeTruthy();
  });
});

describe("<Form> field semantics", () => {
  it("puts aria-describedby on the group, and aria-required and aria-invalid on the radiogroup", () => {
    render(<Form form={eventFeedback} />);
    submit();
    const group = screen.getByRole("group", { name: /How was today's event\?/ });
    expect(group.tagName).toBe("FIELDSET");
    // ARIA 1.2 doesn't allow aria-invalid on a group; the radiogroup carries it.
    expect(group.hasAttribute("aria-invalid")).toBe(false);
    const error = document.getElementById(group.getAttribute("aria-describedby")!);
    expect(error?.textContent).toMatch(/needs an answer/);
    const radios = screen.getByRole("radiogroup", { name: /How was today's event\?/ });
    expect(radios.getAttribute("aria-required")).toBe("true");
    expect(radios.getAttribute("aria-invalid")).toBe("true");
  });

  it("announces a failed Next exactly once, through the live region", () => {
    render(<Form form={eventFeedback} />);
    submit();
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect(liveRegion().textContent).toMatch(/needs an answer/);
    const first = liveRegion().textContent;
    submit();
    expect(liveRegion().textContent).not.toBe(first); // changed, so it is read again
    expect(liveRegion().textContent?.trim()).toBe(first?.trim());
  });

  it("gives multi-choice no role-less wrapper with aria-describedby, and makes each row the label", () => {
    vi.useFakeTimers();
    const { container } = render(<Form form={choices} layout="classic" />);
    expect(container.querySelector("div[aria-describedby]")).toBeNull();
    for (const control of [
      screen.getByRole("radio", { name: "Basic" }),
      screen.getByRole("checkbox", { name: "Mon" }),
    ]) {
      const row = control.closest("label")!;
      expect(row).toBeTruthy();
      expect(row.className).toMatch(/min-h-11/);
      expect(row.className).toMatch(/w-full/);
    }
  });

  it("reads the NPS end labels with the first and last score", () => {
    render(<Form form={choices} layout="classic" />);
    const zero = screen.getByRole("radio", { name: "0" });
    const ten = screen.getByRole("radio", { name: "10" });
    expect(document.getElementById(zero.getAttribute("aria-describedby")!)?.textContent).toBe("Not likely");
    expect(document.getElementById(ten.getAttribute("aria-describedby")!)?.textContent).toBe("Very likely");
    expect(screen.getByText("Not likely").closest("[aria-hidden]")).toBeNull();
  });

  it("keeps ids unique with two forms on a page", () => {
    const { container } = render(
      <>
        <Form form={eventFeedback} layout="classic" />
        <Form form={eventFeedback} layout="classic" />
      </>,
    );
    const ids = Array.from(container.querySelectorAll("[id]"), (e) => e.id);
    expect(ids.length).toBeGreaterThan(4);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("respects reduced motion on the progress bar and the spinner", () => {
    render(<Form form={eventFeedback} />);
    expect(screen.getByRole("progressbar").className).toMatch(/motion-reduce:/);
    expect(screen.getByRole("button", { name: "OK" }).className).toMatch(/motion-reduce:/);
  });
});

describe("<Form> classic layout and slots", () => {
  it("shows every visible question and a focused error summary above them, linking to each field", () => {
    render(<Form form={eventFeedback} layout="classic" />);
    expect(screen.queryByLabelText("Best email to reach you")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }));
    expect(screen.getByLabelText(/Best email to reach you/)).toBeTruthy();
    fireEvent.submit(screen.getByRole("button", { name: "Submit" }).closest("form")!);

    const summary = screen.getByRole("group", { name: "2 answers need attention." });
    expect(document.activeElement).toBe(summary);
    expect(summary.getAttribute("tabindex")).toBe("-1");
    const firstField = screen.getByRole("group", { name: /How was today's event\?/ });
    const order = Array.from(document.querySelectorAll("[data-gf-error-summary], fieldset"));
    expect(order.indexOf(summary)).toBeLessThan(order.indexOf(firstField));
    const links = Array.from(summary.querySelectorAll("a"));
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(/^#/);
      expect(document.getElementById(link.getAttribute("href")!.slice(1))).toBeTruthy();
    }
    fireEvent.click(links[1]!);
    expect(document.activeElement).toBe(screen.getByLabelText(/Best email to reach you/));
    // Per-field errors are not alerts: the summary is the one announcement.
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
  });

  it("lets slots replace and eject parts, and slotProps feed them", () => {
    render(
      <Form
        form={eventFeedback}
        slots={{ header: null, ending: ({ title }) => <p>custom: {title}</p> }}
        slotProps={{ navigation: { nextLabel: "Next" } }}
        autoAdvance={false}
      />,
    );
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
  });
});

describe("<Form> submission", () => {
  it("shows the ending only after onSubmit resolves, and offers a retry when it fails", async () => {
    let attempts = 0;
    const onSubmit = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw new Error("offline");
    });
    render(<Form form={eventFeedback} layout="classic" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    await act(async () => submit());
    expect(screen.queryByRole("heading", { name: /Thanks/ })).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't send/);
    await act(async () => submit());
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { name: /Thanks, see you next time/ })).toBeTruthy();
  });

  it("after a failed send, shows the answers read-only, hides Back and offers Try again", async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error("offline");
    });
    render(<Form form={eventFeedback} autoAdvance={false} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    submit();
    submit();
    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    await act(async () => submit());

    expect(screen.getByRole("alert").textContent).toMatch(/kept here.*Try again/);
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    const no = screen.getByRole("radio", { name: "No" }) as HTMLButtonElement;
    expect(no.closest("fieldset:disabled")).toBeTruthy();
    expect(no.closest("fieldset")?.closest("fieldset[disabled]")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    await act(async () => submit());
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
});

describe("<Form> engines", () => {
  it("uses the engine it's given without building one from `form`", () => {
    const engine = createForm(eventFeedback.definition);
    // A bogus `form` would throw if <Form> built its own engine from it.
    render(<Form form={{} as never} engine={engine} />);
    expect(screen.getByRole("group", { name: /How was today's event\?/ })).toBeTruthy();
  });

  it("starts over when the engine changes", async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error("offline");
    });
    const first = createForm(eventFeedback.definition);
    const { rerender } = render(<Form form={eventFeedback} engine={first} layout="classic" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    await act(async () => submit());
    expect(screen.getByRole("alert")).toBeTruthy();

    rerender(<Form form={eventFeedback} engine={createForm(eventFeedback.definition)} layout="classic" onSubmit={onSubmit} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("radio", { name: "5" }).getAttribute("aria-checked")).toBe("false");
  });

  it("builds a new engine when the `form` definition changes", () => {
    const other = defineForm({ id: "other", title: "Another form", blocks: [f.shortText("name", { label: "Name" })] });
    const { rerender } = render(<Form form={eventFeedback} layout="classic" />);
    rerender(<Form form={other} layout="classic" />);
    expect(screen.getByRole("heading", { name: "Another form" })).toBeTruthy();
    expect(screen.getByLabelText("Name")).toBeTruthy();
  });
});

describe("phone renderer", () => {
  it("renders a tel input with the same chrome and aria wiring as email", () => {
    // The engine's `phone` type may not be on this base yet: register a minimal manifest.
    if (!getFieldType("phone")) {
      registerFieldType({
        type: "phone",
        label: "Phone",
        category: "text",
        value: { json: true },
        operators: [],
        a11y: { semantics: "control", autocomplete: "tel" },
      });
    }
    const form = defineForm({
      id: "phone",
      title: "Phone",
      layout: { mode: "focus" },
      blocks: [
        f.custom<"phone", string>("phone", "phone", { label: "Mobile number", required: true }),
        f.shortText("after", { label: "After" }),
      ],
    });
    render(<Form form={form} />);
    const input = screen.getByLabelText(/Mobile number/) as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
    expect(input.type).toBe("tel");
    expect(input.getAttribute("inputmode")).toBe("tel");
    expect(input.getAttribute("autocomplete")).toBe("tel");
    expect(input.getAttribute("aria-required")).toBe("true");
    expect(input.hasAttribute("data-gf-focus")).toBe(true);
    submit();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toMatch(/needs an answer/);
    fireEvent.change(input, { target: { value: "+1 555 0100" } });
    submit();
    expect(screen.getByLabelText("After")).toBeTruthy();
  });
});
