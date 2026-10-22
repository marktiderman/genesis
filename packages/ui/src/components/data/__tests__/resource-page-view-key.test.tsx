/** Each data-mode ResourcePage remembers its own table/cards choice. */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { GenesisProvider } from "../../../provider";
import { ResourcePage } from "../ResourcePage";

const rows = [{ id: "1", name: "Ada" }];

beforeEach(() => localStorage.clear());

function Page({ title, viewSettingsKey }: { title: string; viewSettingsKey?: string }) {
  return (
    <section aria-label={title}>
      <ResourcePage data={rows} title={title} columns={["name"]} defaultView="table" {...(viewSettingsKey ? { viewSettingsKey } : {})} />
    </section>
  );
}

describe("ResourcePage view choice key", () => {
  it("doesn't carry one page's cards choice over to another", () => {
    const { unmount } = render(
      <GenesisProvider mock={{ datasets: {} }}>
        <Page title="Clients" viewSettingsKey="clients" />
      </GenesisProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Grid view" }));
    unmount();
    render(
      <GenesisProvider mock={{ datasets: {} }}>
        <Page title="Users" viewSettingsKey="users" />
        <Page title="Clients" viewSettingsKey="clients" />
      </GenesisProvider>,
    );
    expect(within(screen.getByRole("region", { name: "Users" })).getByRole("table")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Clients" })).queryByRole("table")).toBeNull();
  });
});
