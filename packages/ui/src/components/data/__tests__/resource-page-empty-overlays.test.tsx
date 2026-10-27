/**
 * ResourcePage's overlays (the built-in form, the peek and the delete dialog) mount beside the
 * shell, not inside it: the shell swaps its children for the empty state, and New on an empty
 * list must still open the form.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { GenesisProvider } from "../../../provider";
import { DataPageShell } from "../DataPageShell";
import { ResourcePage, type ResourcePageProps } from "../ResourcePage";

interface Note {
  [key: string]: unknown;
  id: string;
  title: string;
}

beforeEach(() => localStorage.clear());

function renderEmpty(extra: Partial<ResourcePageProps<Note>> = {}) {
  return render(
    <GenesisProvider mock={{ datasets: { notes: [] } }}>
      <ResourcePage<Note>
        resource="notes"
        title="Notes"
        columns={["title"]}
        titleField="title"
        createLabel="New note"
        emptyMessage="No notes yet"
        formFields={[{ key: "title", label: "Note title", type: "text", required: true }]}
        allowCreate
        keyboardNavigation={false}
        {...extra}
      />
    </GenesisProvider>,
  );
}

async function openNew() {
  await screen.findByText("No notes yet");
  fireEvent.click(screen.getByRole("button", { name: /new note/i }));
  return screen.findByRole("dialog");
}

describe("ResourcePage on an empty list", () => {
  it("opens the form from New on a page", async () => {
    renderEmpty();
    const dialog = await openNew();
    expect(within(dialog).getByLabelText(/note title/i)).toBeTruthy();
  });

  it("opens the form from New when embedded", async () => {
    renderEmpty({ variant: "embedded" });
    const dialog = await openNew();
    expect(within(dialog).getByLabelText(/note title/i)).toBeTruthy();
  });

  it("shows the new row once the form saves", async () => {
    renderEmpty();
    const dialog = await openNew();
    fireEvent.change(within(dialog).getByLabelText(/note title/i), { target: { value: "First" } });
    fireEvent.submit(within(dialog).getByLabelText(/note title/i).closest("form")!);
    expect(await screen.findByText("First")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("No notes yet")).toBeNull());
  });

  it("still mounts the form beside a custom shell", async () => {
    // A shell of the app's own that draws only the header and the empty state.
    function BareShell(props: ComponentProps<typeof DataPageShell>) {
      return <DataPageShell {...props} />;
    }
    renderEmpty({ slots: { shell: BareShell } });
    const dialog = await openNew();
    expect(within(dialog).getByLabelText(/note title/i)).toBeTruthy();
  });
});
