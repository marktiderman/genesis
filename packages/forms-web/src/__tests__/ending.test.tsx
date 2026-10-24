// @feat:forms-web
import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { defineForm, f } from "@marktiderman/genesis-forms";
import { DefaultEnding, Form } from "../index";

const note = defineForm({
  id: "note",
  title: "A note",
  layout: { mode: "classic" },
  blocks: [f.shortText("note", { label: "Anything else?" })],
  endings: [{ id: "default", title: "Thanks." }],
});

const send = () => fireEvent.submit(screen.getByRole("button", { name: /Send/ }).closest("form")!);

describe("ending actions", () => {
  for (const presentation of ["page", "embedded"] as const) {
    it(`shows actions passed through slotProps under the ${presentation} ending`, async () => {
      render(
        <Form
          form={note}
          presentation={presentation}
          onSubmit={async () => {}}
          slotProps={{
            ending: {
              actions: (
                <>
                  <button type="button">Send another response</button>
                  <a href="/f/note?edit=t">Change your answers</a>
                </>
              ),
            },
          }}
        />,
      );
      await act(async () => send());
      const heading = screen.getByRole("heading", { name: "Thanks." });
      const another = screen.getByRole("button", { name: "Send another response" });
      const row = another.parentElement!;
      expect(row.className).toBe("mt-4 flex flex-wrap justify-center gap-2");
      expect(row.contains(screen.getByRole("link", { name: "Change your answers" }))).toBe(true);
      expect(heading.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  }

  it("has no action row without actions, and can be wrapped by a custom ending", () => {
    const { container } = render(<DefaultEnding title="Done" />);
    expect(container.querySelector(".mt-4")).toBeNull();
    render(<DefaultEnding title="Done again" actions={<button type="button">Next person</button>} />);
    expect(screen.getByRole("button", { name: "Next person" })).toBeTruthy();
  });
});
