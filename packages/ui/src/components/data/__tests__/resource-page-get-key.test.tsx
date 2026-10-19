/**
 * ResourcePage `getKey` — row identity for rows not keyed by `id`, such as a
 * junction table with a composite key. Without it every such row keys as ""
 * and bulk selection selects all of them at once.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GenesisProvider } from "../../../provider";
import { ResourcePage } from "../ResourcePage";

interface Membership {
  [key: string]: unknown;
  coach_id: string;
  client_id: string;
  label: string;
}

const rows: Membership[] = [
  { coach_id: "c1", client_id: "u1", label: "primary" },
  { coach_id: "c1", client_id: "u2", label: "backup" },
];

describe("ResourcePage getKey", () => {
  it("selects rows by the key it returns", () => {
    const onAction = vi.fn();
    render(
      <GenesisProvider mock={{ datasets: {} }}>
        <ResourcePage<Membership>
          title="Memberships"
          data={rows}
          total={rows.length}
          columns={["label"]}
          detail="none"
          getKey={(r) => JSON.stringify([r.coach_id, r.client_id])}
          bulkActions={[{ label: "Export", onAction, testId: "export" }]}
        />
      </GenesisProvider>,
    );
    const boxes = screen.getAllByRole("checkbox");
    // [select-all, row 1, row 2]
    fireEvent.click(boxes[2]!);
    fireEvent.click(screen.getByTestId("export"));
    expect(onAction).toHaveBeenCalledWith(['["c1","u2"]']);
  });

  it("passes `editable` through from a column definition to the table", () => {
    const onSave = vi.fn();
    render(
      <GenesisProvider mock={{ datasets: {} }}>
        <ResourcePage<Membership>
          title="Memberships"
          data={rows}
          total={rows.length}
          detail="none"
          getKey={(r) => `${r.coach_id}/${r.client_id}`}
          columns={[{ key: "label", editable: { type: "text", onSave } }]}
        />
      </GenesisProvider>,
    );
    fireEvent.click(screen.getByText("backup"));
    const input = screen.getByDisplayValue("backup");
    fireEvent.change(input, { target: { value: "standby" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSave).toHaveBeenCalledWith(rows[1], "standby");
  });
});
