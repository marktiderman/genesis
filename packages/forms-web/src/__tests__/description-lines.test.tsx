// @feat:forms-web
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { defineForm, f } from "@marktiderman/genesis-forms";
import { DefaultEnding, Form } from "../index";

const formText = "Welcome to the survey.\n\nIt takes five minutes.\nAnswers are private.";
const fieldText = "First line\nSecond line <b>not bold</b>";

/** The rendered element whose text is exactly `text`, as typed. */
function byExactText(text: string): HTMLElement {
  const el = Array.from(document.querySelectorAll<HTMLElement>("p, div, span")).find((e) => e.textContent === text);
  if (!el) throw new Error(`No element with text ${JSON.stringify(text)}`);
  return el;
}

describe("descriptions keep their line breaks", () => {
  for (const mode of ["classic", "focus"] as const) {
    for (const presentation of ["embedded", "page"] as const) {
      it(`form and field descriptions, ${mode} ${presentation}`, () => {
        const form = defineForm({
          id: `lines-${mode}-${presentation}`,
          title: "Lines",
          description: formText,
          layout: { mode },
          blocks: [f.shortText("x", { label: "X", description: fieldText })],
        });
        render(<Form form={form} presentation={presentation} />);
        for (const text of [formText, fieldText]) {
          const el = byExactText(text);
          expect(el.className).toContain("whitespace-pre-line");
          // Text, never markup: the angle brackets stay characters.
          expect(el.querySelector("b")).toBeNull();
        }
      });
    }
  }
});

describe("ending descriptions keep their line breaks", () => {
  it("the default ending", () => {
    const text = "Thanks for your answers.\n\nWe will be in touch.";
    render(<DefaultEnding title="Done" description={text} />);
    expect(byExactText(text).className).toContain("whitespace-pre-line");
  });
});
