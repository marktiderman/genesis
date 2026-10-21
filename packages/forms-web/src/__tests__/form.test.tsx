import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { defineForm, f, when } from "@marktiderman/genesis-forms";
import { Form } from "../index";

const afterClass = defineForm({
  id: "after-class",
  title: "How was class?",
  layout: { mode: "focus" },
  hidden: { coach: f.hidden.string({ source: "server" }) },
  blocks: [
    f.rating("overall", { label: "How was today's class?", required: true }),
    f.longText("improve", { label: "Anything we could do better?" }),
    f.yesNo("contact_me", { label: "Want {{hidden:coach|a coach}} to follow up with you?" }),
    f.email("email", { label: "Best email to reach you", required: true }),
  ],
  logic: [when("contact_me").isNot(true).hide("email")],
  endings: [{ id: "default", title: "Thanks, see you next class." }],
});

const submit = () => fireEvent.submit(screen.getByRole("button", { name: /OK|Submit/ }).closest("form")!);

describe("<Form> focus layout", () => {
  it("walks one question at a time, announcing progress and moving focus", async () => {
    const onSubmit = vi.fn();
    render(<Form form={afterClass} autoAdvance={false} onSubmit={onSubmit} options={{ hidden: { coach: "Sam" } }} />);

    // Rating is a real group: fieldset + legend.
    expect(screen.getByRole("group", { name: /How was today's class\?/ })).toBeTruthy();
    expect(screen.getByText("Question 1 of 3")).toBeTruthy();

    submit();
    expect(screen.getByRole("alert").textContent).toMatch(/needs an answer/);

    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    submit();
    expect(screen.getByLabelText("Anything we could do better?")).toBeTruthy();
    expect(document.activeElement?.id).toBe("gf-step-heading");

    submit();
    expect(screen.getByRole("group", { name: "Want Sam to follow up with you?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    expect(screen.getByText("Question 3 of 3")).toBeTruthy();

    await act(async () => submit());
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toMatch(/Thanks, see you next class/);
  });

  it("goes back along the path", () => {
    render(<Form form={afterClass} autoAdvance={false} />);
    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    submit();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("group", { name: /How was today's class\?/ })).toBeTruthy();
  });

  it("moves on by itself after a single pick", () => {
    vi.useFakeTimers();
    render(<Form form={afterClass} />);
    fireEvent.click(screen.getByRole("radio", { name: "3" }));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByLabelText("Anything we could do better?")).toBeTruthy();
    vi.useRealTimers();
  });
});

describe("<Form> classic layout and slots", () => {
  it("shows every visible question and an error summary", () => {
    render(<Form form={afterClass} layout="classic" />);
    expect(screen.queryByLabelText("Best email to reach you")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }));
    expect(screen.getByLabelText(/Best email to reach you/)).toBeTruthy();
    fireEvent.submit(screen.getByRole("button", { name: "Submit" }).closest("form")!);
    expect(screen.getAllByRole("alert").some((a) => /answers need attention/.test(a.textContent ?? ""))).toBe(true);
  });

  it("lets slots replace and eject parts, and slotProps feed them", () => {
    render(
      <Form
        form={afterClass}
        slots={{ header: null, ending: ({ title }) => <p>custom: {title}</p> }}
        slotProps={{ navigation: { nextLabel: "Next" } }}
        autoAdvance={false}
      />,
    );
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
  });
});
