import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within, screen } from "storybook/test";
import { ResourcePage } from "@marktiderman/genesis-ui/data";
import { GenesisProvider, createMockProvider } from "@marktiderman/genesis-ui/provider";
import { Building2 } from "lucide-react";

interface Practice extends Record<string, unknown> {
  id: string;
  name: string;
  city: string;
  staff: number;
  locked: boolean;
}

const CITIES = ["Leeds", "York", "Hull", "Bath", "Derby"];

const seed = (): Practice[] =>
  Array.from({ length: 30 }, (_, i) => ({
    id: String(i + 1),
    name: `Practice ${String(i + 1).padStart(2, "0")}`,
    city: CITIES[i % CITIES.length]!,
    staff: (i % 6) + 1,
    locked: i % 4 === 3,
  }));

/** A fresh in-memory provider per story render, so deletes don't leak between stories. */
function WithPractices({ children }: { children: ReactNode }) {
  const [provider] = useState(() => createMockProvider({ practices: seed() }));
  return <GenesisProvider provider={provider}>{children}</GenesisProvider>;
}

const meta: Meta<typeof ResourcePage> = {
  title: "Data/ResourcePage",
  component: ResourcePage,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof ResourcePage>;

/**
 * A list embedded in a tab: `header="toolbar"` keeps the actions and drops
 * the title, the peek shows a computed subtitle, and Delete is confirmed and
 * gated per row (`canDelete`). `pagination="server"` pages the resource.
 */
export const EmbeddedWithConfirmedDelete: Story = {
  render: () => (
    <WithPractices>
      <section aria-labelledby="practices-tab">
        <h2 id="practices-tab" className="mb-4 text-lg font-semibold">
          Practices
        </h2>
        <ResourcePage<Practice>
          resource="practices"
          title="Practices"
          header="toolbar"
          icon={Building2}
          columns={["name", "city", "staff"]}
          titleField="name"
          getSubtitle={(p) => `${p.staff} staff · ${p.city}`}
          pagination="server"
          searchFields={["name", "city"]}
          allowDelete
          canDelete={(p) => !p.locked}
          confirmDelete={{ title: (p) => `Delete ${p.name}?` }}
          emptyTitle="No practices yet"
          emptyDescription="Add your first practice to start inviting staff."
          viewSettingsKey="story-practices-embedded"
          keyboardNavigation={false}
        />
      </section>
    </WithPractices>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Toolbar mode: the page's own <h2> is the only heading.
    await expect(canvas.queryByRole("heading", { level: 1 })).toBeNull();

    await userEvent.click(await canvas.findByText("Practice 01"));
    // The peek is portalled, so query the whole document.
    await expect(await screen.findByText("1 staff · Leeds")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("alertdialog");
    await expect(within(dialog).getByText("Delete Practice 01?")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(canvas.queryByText("Practice 01")).toBeNull());
  },
};

/** `pagination="server"`: row 26 onward is one click away, not unreachable. */
export const ServerPaging: Story = {
  render: () => (
    <WithPractices>
      <ResourcePage<Practice>
        resource="practices"
        title="Practices"
        columns={["name", "city", "staff"]}
        pagination="server"
        detail="none"
        viewSettingsKey="story-practices-paging"
        keyboardNavigation={false}
      />
    </WithPractices>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Showing 1-25 of 30")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /Next/ }));
    await expect(await canvas.findByText("Practice 26")).toBeInTheDocument();
    await expect(canvas.getByText("Page 2 of 2")).toBeInTheDocument();
  },
};

/**
 * `defaultView={{ mobile: "grid", desktop: "table" }}`: cards on a phone, a
 * table on a desktop, and nothing stored until the user picks a view. Resize
 * the canvas below 768px to see the cards.
 */
export const ResponsiveDefaultView: Story = {
  render: () => (
    <WithPractices>
      <ResourcePage<Practice>
        resource="practices"
        title="Practices"
        columns={["name", "city", "staff"]}
        defaultView={{ mobile: "grid", desktop: "table" }}
        viewSettingsKey="story-practices-responsive"
        keyboardNavigation={false}
      />
    </WithPractices>
  ),
};
