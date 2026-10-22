/** ResourcePage `can(action, item)`: one permission check, with the old predicates still honoured. */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { GenesisProvider } from "../../../provider";
import { ResourcePage, type ResourcePageProps } from "../ResourcePage";

interface Note {
  [key: string]: unknown;
  id: string;
  title: string;
  mine: boolean;
}

const notes: Note[] = [
  { id: "1", title: "Mine", mine: true },
  { id: "2", title: "Theirs", mine: false },
];

beforeEach(() => localStorage.clear());

function renderNotes(extra: Partial<ResourcePageProps<Note>>) {
  return render(
    <GenesisProvider mock={{ datasets: {} }}>
      <ResourcePage<Note>
        data={notes}
        title="Notes"
        columns={["title"]}
        titleField="title"
        keyboardNavigation={false}
        onCreate={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        {...extra}
      />
    </GenesisProvider>,
  );
}

const open = (title: string) => fireEvent.click(screen.getByText(title));
const edit = () => screen.queryByTestId("detail-panel-edit");
const del = () => screen.queryByTestId("detail-panel-delete");

describe("ResourcePage can", () => {
  it("gates Edit and Delete per row and action", () => {
    renderNotes({ can: (action, item) => action === "create" || !!item?.mine || action === "delete" });
    open("Theirs");
    expect(edit()).toBeNull();
    expect(del()).toBeTruthy();
  });

  it("allows everything on a row it approves", () => {
    renderNotes({ can: (_action, item) => !item || item.mine });
    open("Mine");
    expect(edit()).toBeTruthy();
    expect(del()).toBeTruthy();
  });

  it('hides the New button when can("create") is false', () => {
    renderNotes({ can: (action) => action !== "create", createLabel: "New note" });
    expect(screen.queryByRole("button", { name: /new note/i })).toBeNull();
  });

  it("still honours the deprecated predicates alongside can", () => {
    renderNotes({ can: () => true, canEditItem: (n) => n.mine });
    open("Theirs");
    expect(edit()).toBeNull();
    expect(del()).toBeNull();
  });
});
