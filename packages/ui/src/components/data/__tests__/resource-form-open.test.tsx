/**
 * ResourceForm as it opens and closes:
 *
 * (a) opening a form that was mounted closed logs no "Cannot update a component while rendering
 *     a different component" error (react-hook-form's dirty state was corrected while a field
 *     registered, during render);
 * (b) closing it hands focus back to what had it when it opened (the host's own New or Edit
 *     button), not to the page body;
 * (c) `submitLabel` and `description` replace "Create" / "Save" and the default description.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GenesisProvider, createMockProvider } from "../../../provider";
import { ResourceForm, type ResourceFormProps } from "../ResourceForm";
import type { ResourceFormFieldDef } from "../ResourceFormField";

const fields: ResourceFormFieldDef[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "notes", label: "Notes", type: "textarea", required: false },
  { key: "subject_id", label: "Subject", type: "hidden", defaultValue: "s1" },
];

afterEach(() => vi.restoreAllMocks());

/** A host with its own New button, as ResourcePage and most screens open a form. */
function Host(props: Partial<ResourceFormProps>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        New thing
      </button>
      <ResourceForm resource="things" action="create" open={open} onOpenChange={setOpen} fields={fields} {...props} />
    </>
  );
}

function renderHost(props: Partial<ResourceFormProps> = {}) {
  return render(
    <GenesisProvider provider={createMockProvider({ things: [] })}>
      <Host {...props} />
    </GenesisProvider>,
  );
}

const renderWarning = (calls: unknown[][]) =>
  calls.some((args) => args.some((a) => typeof a === "string" && a.includes("while rendering a different component")));

describe("ResourceForm — opening", () => {
  for (const layout of ["dialog", "sheet"] as const) {
    it(`logs no setState-in-render error when a closed ${layout} form opens`, async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      renderHost({ layout });
      fireEvent.click(screen.getByRole("button", { name: "New thing" }));
      await screen.findByLabelText(/Name/);
      expect(renderWarning(error.mock.calls)).toBe(false);
    });
  }

  it("keeps the fields' defaults once open", async () => {
    const onSuccess = vi.fn();
    renderHost({ onSuccess });
    fireEvent.click(screen.getByRole("button", { name: "New thing" }));
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "First" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onSuccess.mock.calls[0]![0]).toMatchObject({ name: "First", subject_id: "s1" });
  });

  it("server-renders a page form with its fields, not a spinner", () => {
    const html = renderToString(
      <GenesisProvider provider={createMockProvider({ things: [] })}>
        <ResourceForm resource="things" action="create" open onOpenChange={() => {}} fields={fields} layout="page" />
      </GenesisProvider>,
    );
    expect(html).toContain("Name");
    expect(html).toContain('type="submit"');
  });
});

describe("ResourceForm — focus on close", () => {
  for (const layout of ["dialog", "sheet"] as const) {
    it(`returns focus to the button that opened the ${layout}`, async () => {
      renderHost({ layout });
      const opener = screen.getByRole("button", { name: "New thing" });
      opener.focus();
      fireEvent.click(opener);
      await screen.findByLabelText(/Name/);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(opener));
    });
  }

  it("returns focus after a save, too", async () => {
    renderHost();
    const opener = screen.getByRole("button", { name: "New thing" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "First" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});

describe("ResourceForm — words", () => {
  it("keeps Create and the default description without the props", async () => {
    renderHost();
    fireEvent.click(screen.getByRole("button", { name: "New thing" }));
    await screen.findByLabelText(/Name/);
    expect(screen.getByRole("button", { name: "Create" })).toBeTruthy();
    expect(screen.getByRole("dialog").getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText(/Fill in the details to create a new thing record\./)).toBeTruthy();
  });

  it("uses submitLabel and description", async () => {
    renderHost({ submitLabel: "Post", description: "Say what's on your mind." });
    fireEvent.click(screen.getByRole("button", { name: "New thing" }));
    await screen.findByLabelText(/Name/);
    expect(screen.getByRole("button", { name: "Post" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
    expect(screen.getByRole("dialog").textContent).toContain("Say what's on your mind.");
  });

  it("uses submitLabel on an edit, over Save", async () => {
    render(
      <GenesisProvider provider={createMockProvider({ things: [{ id: "1", name: "A" }] })}>
        <ResourceForm
          resource="things"
          action="edit"
          item={{ id: "1", name: "A" }}
          open
          onOpenChange={() => {}}
          fields={fields}
          submitLabel="Update"
        />
      </GenesisProvider>,
    );
    await screen.findByLabelText(/Name/);
    expect(screen.getByRole("button", { name: "Update" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});
