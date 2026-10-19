/**
 * ResourcePage `capabilities` — a control the data source can't serve is
 * hidden rather than left to error (DATA-STUDIO.md decision 9).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GenesisProvider } from "../../../provider";
import { ResourcePage } from "../ResourcePage";

const rows = [{ id: "1", name: "Ana" }];

function renderPage(capabilities?: { search?: boolean; sort?: boolean }) {
  return render(
    <GenesisProvider mock={{ datasets: {} }}>
      <ResourcePage title="People" data={rows} total={1} columns={["name"]} detail="none" capabilities={capabilities} />
    </GenesisProvider>,
  );
}

describe("ResourcePage capabilities", () => {
  it("shows search and sort by default", () => {
    renderPage();
    expect(screen.getByPlaceholderText(/search/i)).toBeTruthy();
    expect(screen.getByText("Sort by...")).toBeTruthy();
  });

  it("hides the search box and the sort select a provider can't serve", () => {
    renderPage({ search: false, sort: false });
    expect(screen.queryByPlaceholderText(/search/i)).toBeNull();
    expect(screen.queryByText("Sort by...")).toBeNull();
  });
});
