/**
 * useResourceTable: ResourcePage's behaviour without its markup. A custom
 * layout gets search, selection and the open record from the same hook.
 */
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { GenesisProvider } from "../../../provider";
import { useResourceTable } from "../ResourcePage";

interface Row {
  [key: string]: unknown;
  id: string;
  name: string;
}
const rows: Row[] = [
  { id: "1", name: "Ada" },
  { id: "2", name: "Bo" },
  { id: "3", name: "Cy" },
];

beforeEach(() => localStorage.clear());

const wrapper = ({ children }: { children: ReactNode }) => <GenesisProvider mock={{ datasets: {} }}>{children}</GenesisProvider>;

describe("useResourceTable", () => {
  it("searches the rows it is given", () => {
    const { result } = renderHook(() => useResourceTable<Row>({ data: rows, title: "People", columns: ["name"], searchFields: ["name"] }), {
      wrapper,
    });
    expect(result.current.page.data).toHaveLength(3);
    act(() => result.current.handleSearchChange("bo"));
    expect(result.current.page.data.map((r) => r.name)).toEqual(["Bo"]);
  });

  it("drives selection and the open record for a custom layout", () => {
    function Cards() {
      const t = useResourceTable<Row>({ data: rows, title: "People", columns: ["name"], titleField: "name" });
      return (
        <div>
          {t.page.data.map((row) => (
            <article key={row.id}>
              <button type="button" onClick={() => t.handleRowClick(row)}>
                {row.name}
              </button>
              <input
                type="checkbox"
                aria-label={`select ${row.name}`}
                checked={t.selectedIds.has(t.keyOf(row))}
                onChange={() => t.handleToggleSelect(t.keyOf(row))}
              />
            </article>
          ))}
          <p data-testid="open">{t.detailOpen ? t.detailTitle : "none"}</p>
          <p data-testid="count">{t.selectedIds.size}</p>
        </div>
      );
    }
    render(<Cards />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "Bo" }));
    expect(screen.getByTestId("open").textContent).toBe("Bo");
    fireEvent.click(screen.getByLabelText("select Ada"));
    fireEvent.click(screen.getByLabelText("select Cy"));
    expect(screen.getByTestId("count").textContent).toBe("2");
  });
});
