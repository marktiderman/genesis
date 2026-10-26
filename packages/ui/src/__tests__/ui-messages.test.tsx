/**
 * The UI message catalogue: English by default, any part replaceable through
 * `UiMessagesProvider` (nested providers build on each other), `{name}`
 * placeholders filled, and props that already name copy still winning.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { GenesisProvider } from "../provider";
import {
  fillMessage,
  resolveUiMessages,
  uiMessages,
  UiMessagesProvider,
  useUiMessages,
} from "../messages";
import { ConfirmDeleteDialog } from "../components/data/ConfirmDeleteDialog";
import { DataTable } from "../components/data/DataTable";
import { KanbanBoard } from "../components/data/KanbanBoard";
import { ResourcePage } from "../components/data/ResourcePage";

beforeEach(() => localStorage.clear());

describe("the catalogue", () => {
  it("merges overrides over the English, leaving the rest", () => {
    const m = resolveUiMessages({ page: { retry: "Erneut versuchen" } });
    expect(m.page.retry).toBe("Erneut versuchen");
    expect(m.page.errorTitle).toBe(uiMessages.page.errorTitle);
    expect(resolveUiMessages()).toEqual(uiMessages);
  });

  it("fills placeholders and leaves unknown ones as written", () => {
    expect(fillMessage("{name} moved to {column}.", { name: "Ana", column: "Done" })).toBe("Ana moved to Done.");
    expect(fillMessage("{n} of {total}", { n: 2 })).toBe("2 of {total}");
  });

  it("is English without a provider, and nested providers build on each other", () => {
    function Probe() {
      const m = useUiMessages();
      return <p>{`${m.common.cancel} / ${m.common.save}`}</p>;
    }
    const { unmount } = render(<Probe />);
    expect(screen.getByText("Cancel / Save")).toBeTruthy();
    unmount();
    render(
      <UiMessagesProvider messages={{ common: { cancel: "Abbrechen" } }}>
        <UiMessagesProvider messages={{ common: { save: "Speichern" } }}>
          <Probe />
        </UiMessagesProvider>
      </UiMessagesProvider>,
    );
    expect(screen.getByText("Abbrechen / Speichern")).toBeTruthy();
  });
});

describe("components read the catalogue", () => {
  const rows = [{ id: "1", name: "Ada" }];

  it("rewords a table's controls and empty state", () => {
    render(
      <UiMessagesProvider messages={{ table: { noRecords: "Nichts gefunden", columns: "Spalten" } }}>
        <DataTable items={[] as typeof rows} columns={[{ key: "name", header: "Name" }]} getKey={(r) => r.id} />
      </UiMessagesProvider>,
    );
    expect(screen.getByText("Nichts gefunden")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Spalten/ })).toBeTruthy();
  });

  it("rewords the page's error state and its create button, while props still win", () => {
    const { unmount } = render(
      <GenesisProvider mock={{ datasets: {} }}>
        <UiMessagesProvider messages={{ page: { errorTitle: "Etwas ist schiefgelaufen", create: "Neu" } }}>
          <ResourcePage data={rows} title="People" columns={["name"]} error onCreate={() => {}} />
        </UiMessagesProvider>
      </GenesisProvider>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Etwas ist schiefgelaufen");
    expect(screen.getAllByRole("button", { name: /Neu/ }).length).toBeGreaterThan(0);
    unmount();
    render(
      <GenesisProvider mock={{ datasets: {} }}>
        <UiMessagesProvider messages={{ page: { create: "Neu" } }}>
          <ResourcePage data={rows} title="People" columns={["name"]} onCreate={() => {}} createLabel="Add person" />
        </UiMessagesProvider>
      </GenesisProvider>,
    );
    expect(screen.getAllByRole("button", { name: /Add person/ }).length).toBeGreaterThan(0);
  });

  it("rewords the delete confirmation, unless the caller names it", () => {
    const { rerender } = render(
      <UiMessagesProvider messages={{ confirmDelete: { title: "Löschen?" }, common: { delete: "Löschen" } }}>
        <ConfirmDeleteDialog open onOpenChange={() => {}} onConfirm={() => {}} />
      </UiMessagesProvider>,
    );
    expect(screen.getByText("Löschen?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy();
    rerender(
      <UiMessagesProvider messages={{ confirmDelete: { title: "Löschen?" } }}>
        <ConfirmDeleteDialog open onOpenChange={() => {}} onConfirm={() => {}} title="Remove Ada?" />
      </UiMessagesProvider>,
    );
    expect(screen.getByText("Remove Ada?")).toBeTruthy();
  });

  it("announces Kanban moves in the catalogue's words", async () => {
    render(
      <UiMessagesProvider messages={{ kanban: { moved: "{name} → {column}", pickUp: "{name} aufnehmen" } }}>
        <KanbanBoard<{ id: string; name: string }>
          columns={[
            { key: "todo", label: "To do", items: [{ id: "a", name: "Ana" }] },
            { key: "done", label: "Done", items: [] },
          ]}
          getKey={(c) => c.id}
          getItemLabel={(c) => c.name}
          renderCard={(c) => <div>{c.name}</div>}
          onMoveItem={() => {}}
        />
      </UiMessagesProvider>,
    );
    const handle = screen.getByRole("button", { name: "Ana aufnehmen" });
    fireEvent.keyDown(handle, { key: "ArrowRight", altKey: true });
    await waitFor(() =>
      expect(document.querySelector('[aria-live="polite"]')!.textContent!.trim()).toBe("Ana → Done"),
    );
  });
});
