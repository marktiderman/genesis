import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { defineForm, f, when } from "@marktiderman/genesis-forms";
import { Form, useFormPresentation } from "../index";

const eventFeedback = defineForm({
  id: "event-feedback",
  title: "How was the event?",
  layout: { mode: "focus" },
  blocks: [
    f.rating("overall", { label: "How was today's event?", required: true }),
    f.singleChoice("plan", {
      label: "Which plan?",
      options: [
        { value: "basic", label: "Basic" },
        { value: "plus", label: "Plus" },
        { value: "pro", label: "Pro" },
      ],
    }),
    f.longText("improve", { label: "Anything we could do better?" }),
    f.yesNo("contact_me", { label: "Want someone to follow up?" }),
  ],
  logic: [when("overall").lessThan(1).hide("plan")],
  endings: [{ id: "default", title: "Thanks, see you next time." }],
});

const brand = { name: "Acme Events" };
const submit = () => fireEvent.submit(document.querySelector("form")!);
const liveRegion = () => document.querySelector("[data-gf-live]")!;

afterEach(() => vi.useRealTimers());

describe('<Form presentation="page">', () => {
  it("fills the viewport with a thin progress bar, no card chrome, and the brand", () => {
    render(<Form form={eventFeedback} presentation="page" brand={brand} autoAdvance={false} />);
    const form = document.querySelector("form")!;
    expect(form.dataset.presentation).toBe("page");
    expect(form.className).toMatch(/min-h-dvh/);
    expect(form.className).not.toMatch(/\b(border|shadow|rounded)/);

    const bar = screen.getByRole("progressbar", { name: "Progress" });
    expect(bar.getAttribute("aria-valuetext")).toBe("Question 1 of 4");
    // Empty on the first question, pinned to the top edge, no "Question N of M" text.
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
    expect(bar.closest("[data-gf-progress]")!.className).toMatch(/fixed/);
    expect(screen.queryByText(/Question 1 of 4/)).toBeNull();

    // The brand shows its initials (decorative) and its name.
    const brandEl = document.querySelector("[data-gf-brand]")!;
    expect(brandEl.textContent).toContain("Acme Events");
    expect(brandEl.textContent).toContain("AE");

    // The form title is introduced once, then kept for assistive tech only.
    const title = screen.getByRole("heading", { level: 1, name: "How was the event?" });
    expect(title.closest(".sr-only")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    submit();
    expect(screen.getByRole("heading", { level: 1, name: "How was the event?" }).closest(".sr-only")).not.toBeNull();
    expect(document.querySelector("[data-gf-brand]")).not.toBeNull();
  });

  it("keeps the embedded look by default", () => {
    render(<Form form={eventFeedback} autoAdvance={false} />);
    expect(document.querySelector("form")!.dataset.presentation).toBe("embedded");
    expect(screen.getByText("Question 1 of 4")).toBeTruthy();
    expect(screen.getByRole("button", { name: "OK" })).toBeTruthy();
  });

  it("keeps radio semantics, moves focus to each question, and announces a failed OK", () => {
    render(<Form form={eventFeedback} presentation="page" brand={brand} autoAdvance={false} />);
    expect(screen.getByRole("group", { name: /How was today's event\?/ })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: /How was today's event\?/ })).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(5);

    submit();
    expect(liveRegion().textContent).toMatch(/needs an answer/);

    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    submit();
    const legend = screen.getByText("Which plan?");
    expect(document.activeElement).toBe(legend);
    expect(screen.getByRole("radiogroup", { name: "Which plan?" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Plus" })).toBeTruthy();

    submit();
    expect(document.activeElement).toBe(screen.getByLabelText("Anything we could do better?"));

    // Back is a quiet icon button with a name.
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(document.activeElement).toBe(screen.getByText("Which plan?"));
  });

  it("picks an option with its letter key while focus is in the group", () => {
    render(<Form form={eventFeedback} presentation="page" autoAdvance={false} />);
    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    submit();
    const basic = screen.getByRole("radio", { name: "Basic" });
    basic.focus();
    fireEvent.keyDown(basic, { key: "c" });
    expect(screen.getByRole("radio", { name: "Pro" }).getAttribute("aria-checked")).toBe("true");
  });

  it("never auto-submits from the last question; the ending is centred with the brand", async () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn();
    render(<Form form={eventFeedback} presentation="page" brand={brand} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(screen.getByRole("radio", { name: "Plus" }));
    act(() => vi.advanceTimersByTime(300));
    submit();
    // Last question: a pick doesn't submit.
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }));
    act(() => vi.advanceTimersByTime(1000));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();

    await act(async () => submit());
    expect(onSubmit).toHaveBeenCalledOnce();
    const heading = screen.getByRole("heading", { name: /Thanks, see you next time/ });
    expect(document.activeElement).toBe(heading);
    expect(document.querySelector("[data-presentation=page] [data-gf-brand]")).not.toBeNull();
  });

  it("shows the continue hint, and Ctrl/Cmd+Enter in long text", () => {
    render(<Form form={eventFeedback} presentation="page" autoAdvance={false} />);
    expect(document.querySelector("[data-gf-key-hint]")!.textContent).toMatch(/Enter ↵/);
    expect(document.querySelector("[data-gf-key-hint]")!.className).toMatch(/pointer-fine:inline/);
    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    submit();
    submit();
    expect(document.querySelector("[data-gf-key-hint]")!.textContent).toMatch(/(Ctrl|⌘) \+ Enter/);
  });

  it("lays classic out as sections on one page, and lets slots read the presentation", () => {
    function Header() {
      const { presentation, layout } = useFormPresentation();
      return <h1>{`${presentation} ${layout}`}</h1>;
    }
    render(<Form form={eventFeedback} presentation="page" layout="classic" slots={{ header: Header }} />);
    expect(screen.getByRole("heading", { name: "page classic" })).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(document.querySelectorAll("[data-block]").length).toBe(4);
    for (const block of Array.from(document.querySelectorAll("[data-block]"))) expect(block.className).toMatch(/bg-card/);
    submit();
    expect(document.activeElement?.hasAttribute("data-gf-error-summary")).toBe(true);
  });
});
