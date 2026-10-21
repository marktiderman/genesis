import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createForm, defineForm, f, when } from "@marktiderman/genesis-forms";
import { Inspector, decodeShare, encodeShare } from "../index";

const form = defineForm({
  id: "t",
  title: "T",
  hidden: { coach: f.hidden.string({ source: "server" }) },
  blocks: [
    f.rating("overall", { label: "Overall", required: true }),
    f.longText("improve", { label: "Improve" }),
    f.yesNo("contact_me", { label: "Contact?" }),
    f.email("email", { label: "Email", required: true }),
  ],
  logic: [when("contact_me").isNot(true).hide("email")],
});

describe("Inspector", () => {
  it("shows live path and values, and the server check", () => {
    const engine = createForm(form.definition, { clock: () => undefined });
    render(<Inspector engine={engine} context={{ coach: "Sam" }} />);
    expect(screen.getByTestId("devtools-state").textContent).toMatch(/overall → improve → contact_me/);
    act(() => engine.setValue("contact_me", true));
    expect(screen.getByTestId("devtools-state").textContent).toMatch(/contact_me → email/);
  });

  it("scrubs the timeline without touching the live form", () => {
    const engine = createForm(form.definition, { clock: () => undefined });
    act(() => {
      engine.setValue("overall", 5);
      engine.setValue("contact_me", true);
    });
    render(<Inspector engine={engine} defaultTab="timeline" />);
    expect(screen.getByText(/Event 2 of 2/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Step back" }));
    expect(screen.getByText(/Event 1 of 2/)).toBeTruthy();
    expect(screen.getByTestId("devtools-timeline").textContent).not.toMatch(/Path then:.*email/);
    expect(engine.getState().values.contact_me).toBe(true);
  });

  it("drops forged inputs in tamper mode", () => {
    const engine = createForm(form.definition, { clock: () => undefined });
    act(() => engine.setValue("overall", 4));
    render(<Inspector engine={engine} context={{ coach: "Sam" }} defaultTab="server" />);
    fireEvent.click(screen.getByRole("switch"));
    const text = screen.getByTestId("devtools-server").textContent ?? "";
    expect(text).toMatch(/hidden\.coach/);
    expect(text).toMatch(/__forged_field__/);
    expect(text).toMatch(/"coach": "Sam"/);
  });
});

describe("share links", () => {
  it("round-trips a definition and events", async () => {
    const hash = await encodeShare({ v: 1, definition: form.definition, events: [{ type: "answer", field: "overall", value: 3 }] });
    expect(hash).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = await decodeShare(`#d=${hash}`);
    expect(back?.definition.id).toBe("t");
    expect(back?.events?.[0]).toEqual({ type: "answer", field: "overall", value: 3 });
    expect(await decodeShare("garbage")).toBeNull();
  });
});
