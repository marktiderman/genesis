// @feat:forms-native
import { describe, expect, it, vi } from "vitest";
import { defineForm, f, type FormDefinition } from "@marktiderman/genesis-forms";
import { byTestId, press, queryTestId, renderForm, screen, type } from "./helpers";

/** A one-question form, so its question is the step on screen. */
const one = (block: Parameters<typeof defineForm>[0]["blocks"][number]): FormDefinition =>
  defineForm({ id: "one", title: "One", layout: { mode: "focus" }, blocks: [block, f.shortText("after", { label: "After" })] }).definition;

describe("field kinds", () => {
  it("short text: the question names the input, which takes the next key", () => {
    const { engine } = renderForm(one(f.shortText("name", { label: "Your name", required: true, description: "As on your card" })));
    const input = byTestId("form-name");
    expect(input.getAttribute("aria-label")).toBe("Your name, required");
    expect(input.getAttribute("aria-describedby")).toBe("As on your card");
    expect(input.getAttribute("data-return-key")).toBe("next");
    type("form-name", "Ada");
    expect(engine.getState().values[engine.idOf("name")]).toBe("Ada");
  });

  it("long text is multi-line, and its return key makes a new line", () => {
    renderForm(one(f.longText("notes", { label: "Notes" })));
    const input = byTestId("form-notes");
    expect(input.tagName).toBe("TEXTAREA");
    expect(input.getAttribute("data-return-key")).toBe("default");
  });

  it("email and phone get their keyboards and autofill hints", () => {
    renderForm(one(f.email("email", { label: "Email" })));
    expect(byTestId("form-email").getAttribute("data-keyboard")).toBe("email-address");
    expect(byTestId("form-email").getAttribute("data-content-type")).toBe("emailAddress");
    screen.getByText("One");
  });

  it("phone", () => {
    renderForm(one(f.phone("phone", { label: "Phone" })));
    expect(byTestId("form-phone").getAttribute("data-keyboard")).toBe("phone-pad");
    expect(byTestId("form-phone").getAttribute("data-autocomplete")).toBe("tel");
  });

  it("number keeps what is typed and stores a number once it is one", () => {
    const { engine } = renderForm(one(f.number("weight", { label: "Weight", min: 0, max: 300 })));
    const id = engine.idOf("weight");
    expect(byTestId("form-weight").getAttribute("data-keyboard")).toBe("number-pad");
    screen.getByText("From 0 to 300");
    type("form-weight", "72,5");
    expect(engine.getState().values[id]).toBe(72.5);
    type("form-weight", "7x");
    expect(engine.getState().values[id]).toBe("7x");
    type("form-weight", "");
    expect(engine.getState().values[id]).toBeUndefined();
  });

  it("date shapes typed digits as YYYY-MM-DD and reads a whole date back", () => {
    const { engine } = renderForm(one(f.date("day", { label: "Day" })));
    type("form-day", "20261024");
    expect(engine.getState().values[engine.idOf("day")]).toBe("2026-10-24");
    expect((byTestId("form-day") as HTMLInputElement).value).toBe("2026-10-24");
  });

  it("single choice: options are radios with their state, description and picture", () => {
    const { engine } = renderForm(
      one(
        f.singleChoice("gym", {
          label: "Which gym?",
          options: [
            { value: "riverside", label: "Riverside Gym", description: "12 Mill Lane", image: "https://example.com/r.png" },
            { value: "hilltop", label: "Hilltop Gym" },
          ],
        }),
      ),
    );
    const riverside = byTestId("form-gym-option-riverside");
    expect(riverside.getAttribute("role")).toBe("radio");
    expect(riverside.getAttribute("aria-label")).toBe("Riverside Gym, 12 Mill Lane");
    expect(riverside.getAttribute("aria-checked")).toBe("false");
    // The https picture is drawn beside the label (the hilltop option has none).
    expect(riverside.querySelector("img")).not.toBeNull();
    expect(byTestId("form-gym-option-hilltop").querySelector("img")).toBeNull();
    screen.getByText("12 Mill Lane");
    press("form-gym-option-riverside");
    expect(engine.getState().values[engine.idOf("gym")]).toBe("riverside");
    expect(byTestId("form-gym-option-riverside").getAttribute("aria-checked")).toBe("true");
  });

  it("multiple choice toggles checkboxes", () => {
    const { engine } = renderForm(one(f.multiChoice("goals", { label: "Goals", options: [{ value: "strength" }, { value: "sleep" }] })));
    press("form-goals-option-strength");
    press("form-goals-option-sleep");
    press("form-goals-option-strength");
    expect(engine.getState().values[engine.idOf("goals")]).toEqual(["sleep"]);
    expect(byTestId("form-goals-option-sleep").getAttribute("role")).toBe("checkbox");
  });

  it("dropdown is drawn as a single choice list", () => {
    const { engine } = renderForm(one(f.dropdown("size", { label: "Size", options: [{ value: "s" }, { value: "m" }] })));
    press("form-size-option-m");
    expect(engine.getState().values[engine.idOf("size")]).toBe("m");
  });

  it("rating: numbered radios, or stars named n of max", () => {
    const { engine } = renderForm(one(f.rating("energy", { label: "Energy", max: 5 })));
    press("form-energy-option-4");
    expect(engine.getState().values[engine.idOf("energy")]).toBe(4);
    expect(byTestId("form-energy-option-4").getAttribute("aria-checked")).toBe("true");
  });

  it("rating as stars", () => {
    renderForm(one(f.rating("mood", { label: "Mood", max: 5, display: "stars" })));
    expect(byTestId("form-mood-option-3").getAttribute("aria-label")).toBe("3 of 5 stars");
  });

  it("NPS runs 0 to 10 with its end labels read on the ends", () => {
    renderForm(one(f.nps("recommend", { label: "Recommend us?" })));
    expect(queryTestId("form-recommend-option-0")).not.toBeNull();
    expect(queryTestId("form-recommend-option-10")).not.toBeNull();
    expect(byTestId("form-recommend-option-0").getAttribute("aria-describedby")).toContain("Not likely");
    expect(byTestId("form-recommend-option-10").getAttribute("aria-describedby")).toContain("Very likely");
  });

  it("yes/no stores a boolean", () => {
    const { engine } = renderForm(one(f.yesNo("slept", { label: "Slept well?" })));
    press("form-slept-option-no");
    expect(engine.getState().values[engine.idOf("slept")]).toBe(false);
  });

  it("consent is one checkbox with the field's words", () => {
    const { engine } = renderForm(one(f.consent("ok", { label: "Terms", text: "I agree to the terms" })));
    screen.getByText("I agree to the terms");
    press("form-ok-option-agree");
    expect(engine.getState().values[engine.idOf("ok")]).toBe(true);
  });

  it("photo says photos can't be added without a host", () => {
    renderForm(one(f.photo("progress", { label: "A progress photo" })));
    screen.getByText("Photos can't be added here.");
    expect(byTestId("form-progress-choose").getAttribute("aria-disabled")).toBe("true");
  });

  it("photo: picks through the host, checks the type, and keeps the reference", async () => {
    const pick = vi.fn(async () => [
      { uri: "file:///a.jpg", name: "a.jpg", type: "image/jpeg", size: 1000 },
      { uri: "file:///b.gif", name: "b.gif", type: "image/gif", size: 1000 },
    ]);
    const upload = vi.fn(async (file: { name: string; type: string; size: number }) => ({ id: `id-${file.name}`, name: file.name, type: file.type, size: file.size }));
    const { engine } = renderForm(one(f.photo("progress", { label: "A progress photo" })), { photos: { pick, upload } });
    press("form-progress-choose");
    await vi.waitFor(() => expect(engine.getState().values[engine.idOf("progress")]).toEqual([{ id: "id-a.jpg", name: "a.jpg", type: "image/jpeg", size: 1000 }]));
    expect(upload).toHaveBeenCalledTimes(1);
    screen.getByText(/Use a JPEG/);
    screen.getByLabelText("Remove a.jpg");
  });

  it("a kind with no native renderer shows a note instead of a blank step", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderForm(one(f.list("items", { label: "Items" })));
    screen.getByText("This question can't be answered in the app yet.");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"list"'));
    warn.mockRestore();
  });

  it("a host's renderer, registered by kind with a higher rank, replaces a built-in", async () => {
    const { defaultRegistry } = await import("../index");
    const registry = defaultRegistry.extend([{ type: "short-text", rank: 10, Component: () => <span data-testid="mine" /> }]);
    renderForm(one(f.shortText("name", { label: "Name" })), { registry });
    expect(queryTestId("mine")).not.toBeNull();
  });
});
