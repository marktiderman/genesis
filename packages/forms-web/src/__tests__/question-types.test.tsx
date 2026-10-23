// @feat:forms-web
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createForm, defineForm, f, type FormEngine } from "@marktiderman/genesis-forms";
import { Form, themeColors, themeCss } from "../index";

const types = defineForm({
  id: "types",
  title: "Visit",
  layout: { mode: "classic" },
  blocks: [
    f.dropdown("class", { label: "Which class?", options: [{ value: "am", label: "6am" }, { value: "pm", label: "6pm" }] }),
    f.number("guests", { label: "Guests", min: 0, max: 10, step: 1 }),
    f.date("visit", { label: "Visit date", min: "2026-01-01" }),
    f.consent("terms", { label: "Terms", text: "I agree to the terms", required: true }),
    f.rating("overall", { label: "Overall", lowLabel: "Poor", highLabel: "Great" }),
    f.rating("stars", { label: "Stars", display: "stars", max: 5 }),
    f.nps("nps", { label: "Recommend us?" }),
  ],
});

function setup(props: Partial<Parameters<typeof Form>[0]> = {}) {
  const engine = createForm(types.definition);
  render(<Form form={types} engine={engine} {...props} />);
  return engine;
}
const answers = (engine: FormEngine) => engine.getState().values;

describe("new question types in <Form>", () => {
  it("dropdown: a labelled native select with a blank first choice", () => {
    const engine = setup();
    const select = screen.getByLabelText(/Which class/) as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(Array.from(select.options, (o) => o.textContent)).toEqual(["Choose…", "6am", "6pm"]);
    fireEvent.change(select, { target: { value: "pm" } });
    expect(answers(engine).class).toBe("pm");
    fireEvent.change(select, { target: { value: "" } });
    expect(answers(engine).class).toBeUndefined();
  });

  it("number: stores a number once it is one, and shows the range", () => {
    const engine = setup();
    const input = screen.getByLabelText(/Guests/) as HTMLInputElement;
    expect(input.getAttribute("inputmode")).toBe("numeric");
    fireEvent.change(input, { target: { value: "4" } });
    expect(answers(engine).guests).toBe(4);
    fireEvent.change(input, { target: { value: "4x" } });
    expect(answers(engine).guests).toBe("4x");
    expect(input.value).toBe("4x");
    fireEvent.change(input, { target: { value: "" } });
    expect(answers(engine).guests).toBeUndefined();
    expect(screen.getByText("From 0 to 10")).toBeTruthy();
  });

  it("date: a date input with its limits", () => {
    const engine = setup();
    const input = screen.getByLabelText(/Visit date/) as HTMLInputElement;
    expect(input.type).toBe("date");
    expect(input.min).toBe("2026-01-01");
    fireEvent.change(input, { target: { value: "2026-10-22" } });
    expect(answers(engine).visit).toBe("2026-10-22");
  });

  it("consent: one checkbox under the question, which must be checked to send", () => {
    const onSubmit = vi.fn();
    const engine = setup({ onSubmit });
    const group = screen.getByRole("group", { name: /Terms/ });
    const box = within(group).getByRole("checkbox", { name: "I agree to the terms" });
    fireEvent.submit(box.closest("form")!);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(engine.getState().errors.terms).toBeTruthy();
    fireEvent.click(box);
    expect(answers(engine).terms).toBe(true);
    fireEvent.click(box);
    expect(answers(engine).terms).toBeUndefined();
  });

  it("rating: end labels read with the end options", () => {
    setup();
    const group = screen.getByRole("radiogroup", { name: /Overall/ });
    const radios = within(group).getAllByRole("radio");
    const low = document.getElementById(radios[0]!.getAttribute("aria-describedby")!);
    const high = document.getElementById(radios[4]!.getAttribute("aria-describedby")!);
    expect(low?.textContent).toBe("Poor");
    expect(high?.textContent).toBe("Great");
    expect(radios[2]!.hasAttribute("aria-describedby")).toBe(false);
  });

  it("rating as stars: one radio per star, filled up to the pick", () => {
    const engine = setup();
    const group = screen.getByRole("radiogroup", { name: /Stars/ });
    expect(group.hasAttribute("data-gf-stars")).toBe(true);
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual(["1 of 5", "2 of 5", "3 of 5", "4 of 5", "5 of 5"]);
    fireEvent.click(radios[3]!);
    expect(answers(engine).stars).toBe(4);
    expect(group.querySelectorAll("svg.fill-primary").length).toBe(4);
  });

  it("NPS keeps its default end labels", () => {
    setup();
    expect(screen.getByText("Not likely")).toBeTruthy();
    expect(screen.getByText("Very likely")).toBeTruthy();
  });
});

describe("required note and send word", () => {
  it("shows * Required when any question is required, and Send in both layouts", () => {
    const { unmount } = render(<Form form={types} />);
    expect(document.querySelector("[data-gf-required-note]")?.textContent).toBe("* Required");
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
    unmount();
    const one = defineForm({ id: "one", title: "One", layout: { mode: "focus" }, blocks: [f.shortText("a", { label: "A", required: true })] });
    render(<Form form={one} presentation="page" />);
    expect(document.querySelector("[data-gf-required-note]")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
  });

  it("leaves the note out when nothing is required, and takes its own words", () => {
    const optional = defineForm({ id: "opt", title: "Opt", layout: { mode: "classic" }, blocks: [f.shortText("a", { label: "A" })] });
    const { unmount } = render(<Form form={optional} />);
    expect(document.querySelector("[data-gf-required-note]")).toBeNull();
    unmount();
    render(<Form form={types} requiredLabel="Needed" submitLabel="Submit answers" />);
    expect(document.querySelector("[data-gf-required-note]")?.textContent).toBe("* Needed");
    expect(screen.getByRole("button", { name: "Submit answers" })).toBeTruthy();
  });

  it("hides the note with requiredLabel={null}", () => {
    render(<Form form={types} requiredLabel={null} />);
    expect(document.querySelector("[data-gf-required-note]")).toBeNull();
  });
});

describe("theme", () => {
  it("applies the accent to the form only, and shows the header image", () => {
    render(<Form form={types} theme={{ accent: "#2563eb", headerImage: "/banner.jpg", headerImageAlt: "The gym" }} />);
    const form = document.querySelector("form")!;
    const id = form.getAttribute("data-gf-theme");
    expect(id).toBeTruthy();
    const css = document.querySelector("style")!.textContent!;
    expect(css).toContain(`[data-gf-theme="${id}"]`);
    expect(css).toMatch(/--primary: \d+ \d+% [\d.]+%/);
    expect(css).toContain(".dark");
    const img = screen.getByRole("img", { name: "The gym" }) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/banner.jpg");
  });

  it("ignores an accent it can't read", () => {
    render(<Form form={types} theme={{ accent: "url(javascript:alert(1))" }} />);
    expect(document.querySelector("form")!.hasAttribute("data-gf-theme")).toBe(false);
    expect(document.querySelector("style")).toBeNull();
    expect(themeCss({ accent: "red; } body { display: none" }, "x")).toBe("");
  });
});

describe("themeColors keeps contrast", () => {
  const rgb = (hsl: string) => {
    const [h, s, l] = hsl.split(" ").map((p) => parseFloat(p)) as [number, number, number];
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
    const k = (n: number) => (n + h / 30) % 12;
    const f = (n: number) => l / 100 - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)].map((x) => Math.round(x * 255));
  };
  const lum = (c: number[]) =>
    c.map((x) => x / 255).map((n) => (n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)).reduce((t, v, i) => t + v * [0.2126, 0.7152, 0.0722][i]!, 0);
  const ratio = (a: number[], b: number[]) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
    return (x + 0.05) / (y + 0.05);
  };

  for (const accent of ["#ffff00", "#fde68a", "#2563eb", "#111111", "#808080", "#0f0", "rgb(255, 120, 0)"]) {
    it(`${accent}: 3:1 with the page and 4.5:1 for its text, light and dark`, () => {
      const colors = themeColors(accent)!;
      const pages: [mode: "light" | "dark", page: number[]][] = [["light", [255, 255, 255]], ["dark", rgb("240 10% 3.9%")]];
      for (const [mode, page] of pages) {
        const c = colors[mode];
        expect(ratio(rgb(c.primary), page)).toBeGreaterThanOrEqual(2.95);
        expect(ratio(rgb(c.primary), rgb(c.primaryForeground))).toBeGreaterThanOrEqual(4.45);
      }
    });
  }

  it("leaves an accent that already contrasts unchanged", () => {
    expect(themeColors("#1d4ed8")!.light.primary).toBe("224 76% 48%");
  });
});
