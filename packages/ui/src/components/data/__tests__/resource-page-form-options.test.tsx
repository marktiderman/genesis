/**
 * ResourcePage's opt-in form options, and the built-in form's words:
 *
 * - `emptyCreate` moves the create button into an empty, unfiltered list's empty state and drops
 *   the filter row; `emptyFiltered` (or any filter) keeps both where they were. Off by default.
 * - `createdToast` shows "Created {name}" with Open after a create and moves focus to Open. Off
 *   by default: no toast, focus back on New.
 * - `formTitles.createSubmit` / `createDescription` (and the edit pair) reach the form.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GenesisProvider } from "../../../provider";
import { Toaster, toast } from "../../ui/sonner";
import { ResourcePage, type ResourcePageProps } from "../ResourcePage";

interface Note {
  [key: string]: unknown;
  id: string;
  title: string;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  act(() => {
    toast.dismiss();
  });
});

function renderNotes(extra: Partial<ResourcePageProps<Note>> = {}, rows: Note[] = []) {
  return render(
    <GenesisProvider mock={{ datasets: { notes: rows } }}>
      <ResourcePage<Note>
        resource="notes"
        title="Notes"
        columns={["title"]}
        titleField="title"
        searchFields={["title"]}
        createLabel="New note"
        emptyMessage="No notes yet"
        formFields={[{ key: "title", label: "Note title", type: "text", required: true }]}
        allowCreate
        keyboardNavigation={false}
        {...extra}
      />
      <Toaster />
    </GenesisProvider>,
  );
}

/** Whether `el` comes after the empty state's title in the page, i.e. sits in the empty state. */
const afterEmptyTitle = (el: HTMLElement) =>
  !!(screen.getByText("No notes yet").compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("ResourcePage emptyCreate", () => {
  it("leaves the button in the header and the filter row without it", async () => {
    renderNotes();
    await screen.findByText("No notes yet");
    const buttons = screen.getAllByRole("button", { name: /new note/i });
    expect(buttons).toHaveLength(1);
    expect(afterEmptyTitle(buttons[0]!)).toBe(false);
    expect(screen.queryAllByRole("textbox")).toHaveLength(1);
  });

  it("puts the one create button in the empty state and drops the filter row", async () => {
    renderNotes({ emptyCreate: true });
    await screen.findByText("No notes yet");
    const buttons = screen.getAllByRole("button", { name: /new note/i });
    expect(buttons).toHaveLength(1);
    expect(afterEmptyTitle(buttons[0]!)).toBe(true);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    fireEvent.click(buttons[0]!);
    expect(within(await screen.findByRole("dialog")).getByLabelText(/note title/i)).toBeTruthy();
  });

  it("keeps the header button and filter row when the screen narrows the list", async () => {
    renderNotes({ emptyCreate: true, emptyFiltered: true });
    await screen.findByText("No notes yet");
    const buttons = screen.getAllByRole("button", { name: /new note/i });
    expect(buttons).toHaveLength(1);
    expect(afterEmptyTitle(buttons[0]!)).toBe(false);
    expect(screen.queryAllByRole("textbox")).toHaveLength(1);
  });

  it("keeps them while a search filters a list to nothing", async () => {
    renderNotes({ emptyCreate: true }, [{ id: "1", title: "First" }]);
    await screen.findByText("First");
    const search = screen.getByRole("textbox");
    fireEvent.change(search, { target: { value: "zzz" } });
    await waitFor(() => expect(screen.queryByText("First")).toBeNull());
    const buttons = screen.getAllByRole("button", { name: /new note/i });
    expect(buttons).toHaveLength(1);
    // Still in the header, above the search box, which stays.
    expect(screen.getByRole("textbox")).toBe(search);
    expect(buttons[0]!.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("leaves an emptyState action in place of the create button", async () => {
    renderNotes({ emptyCreate: true, emptyState: <button type="button">Import notes</button> });
    await screen.findByText("No notes yet");
    expect(screen.getByRole("button", { name: "Import notes" })).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: /new note/i });
    expect(buttons).toHaveLength(1);
    expect(afterEmptyTitle(buttons[0]!)).toBe(false);
  });

  it("changes nothing on a list with rows", async () => {
    renderNotes({ emptyCreate: true }, [{ id: "1", title: "First" }]);
    await screen.findByText("First");
    expect(screen.getAllByRole("button", { name: /new note/i })).toHaveLength(1);
    expect(screen.queryAllByRole("textbox")).toHaveLength(1);
  });
});

async function createNote(title: string) {
  const newButton = screen.getAllByRole("button", { name: /new note/i })[0]!;
  newButton.focus();
  fireEvent.click(newButton);
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText(/note title/i), { target: { value: title } });
  fireEvent.submit(within(dialog).getByLabelText(/note title/i).closest("form")!);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  return newButton;
}

describe("ResourcePage createdToast", () => {
  it("shows no toast by default, and focus goes back to New", async () => {
    renderNotes({}, [{ id: "1", title: "First" }]);
    await screen.findByText("First");
    const newButton = await createNote("Second");
    await waitFor(() => expect(document.activeElement).toBe(newButton));
    await new Promise((r) => setTimeout(r, 150));
    expect(screen.queryByText("Created Second")).toBeNull();
    expect(document.activeElement).toBe(newButton);
  });

  it("toasts the new row and moves focus to its Open", async () => {
    renderNotes({ createdToast: true }, [{ id: "1", title: "First" }]);
    await screen.findByText("First");
    await createNote("Second");
    const toastEl = (await screen.findByText("Created Second")).closest("[data-sonner-toast]") as HTMLElement;
    const open = within(toastEl).getByRole("button", { name: "Open" });
    await waitFor(() => expect(document.activeElement).toBe(open));
  });

  it("hands focus back to New when the toast goes", async () => {
    renderNotes({ createdToast: true }, [{ id: "a1", title: "First" }]);
    await screen.findByText("First");
    const newButton = await createNote("Second");
    const toastEl = (await screen.findByText("Created Second")).closest("[data-sonner-toast]") as HTMLElement;
    const open = within(toastEl).getByRole("button", { name: "Open" });
    await waitFor(() => expect(document.activeElement).toBe(open));
    act(() => {
      toast.dismiss();
    });
    await waitFor(() => expect(screen.queryByText("Created Second")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(newButton));
  });

  it("opens the new row from the toast", async () => {
    // The mock numbers new rows from 1, so the seeded row takes another id.
    renderNotes({ createdToast: true }, [{ id: "a1", title: "First" }]);
    await screen.findByText("First");
    await createNote("Second");
    const toastEl = (await screen.findByText("Created Second")).closest("[data-sonner-toast]") as HTMLElement;
    fireEvent.click(within(toastEl).getByRole("button", { name: "Open" }));
    const peek = await screen.findByRole("dialog");
    expect(within(peek).getAllByText("Second").length).toBeGreaterThan(0);
  });

  it("toasts without Open when the list doesn't open rows", async () => {
    renderNotes({ createdToast: true, detail: "none" }, [{ id: "1", title: "First" }]);
    await screen.findByText("First");
    const newButton = await createNote("Second");
    const toastEl = (await screen.findByText("Created Second")).closest("[data-sonner-toast]") as HTMLElement;
    expect(within(toastEl).queryByRole("button", { name: "Open" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(newButton));
  });

  it("never names the row by its key: the noun, else Untitled", async () => {
    const { unmount } = renderNotes({ createdToast: true, titleField: "id", noun: "note" }, [{ id: "a1", title: "First" }]);
    await screen.findByText("First");
    await createNote("Second");
    expect(await screen.findByText("Created the note")).toBeTruthy();
    act(() => {
      toast.dismiss();
    });
    unmount();
    renderNotes({ createdToast: true, titleField: "id" }, [{ id: "a1", title: "First" }]);
    await screen.findByText("First");
    await createNote("Third");
    expect(await screen.findByText("Created Untitled")).toBeTruthy();
  });
});

describe("ResourcePage formTitles words", () => {
  it("gives the create form its submit words and description", async () => {
    renderNotes(
      { formTitles: { create: "Write a note", createSubmit: "Post", createDescription: "Notes are shared with the team." } },
      [{ id: "1", title: "First" }],
    );
    await screen.findByText("First");
    fireEvent.click(screen.getByRole("button", { name: /new note/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Write a note")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Post" })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Create" })).toBeNull();
    expect(dialog.textContent).toContain("Notes are shared with the team.");
  });

  it("keeps Create without them", async () => {
    renderNotes({}, [{ id: "1", title: "First" }]);
    await screen.findByText("First");
    fireEvent.click(screen.getByRole("button", { name: /new note/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Create" })).toBeTruthy();
  });
});
