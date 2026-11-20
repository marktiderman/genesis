import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { createMemoryStorageAdapter, defineResource } from "@marktiderman/genesis-core";
import { createLocalSavedViewStore, defineView } from "@marktiderman/genesis-core/resource-view";
import { ResourceView, ResourceViewDefaultsProvider } from "@marktiderman/genesis-ui/data";
import { GenesisProvider, createMockProvider } from "@marktiderman/genesis-ui/provider";

type Task = { id: string; title: string; stage: "todo" | "doing" | "done"; hours: number; urgent: boolean; due_on: string };

const tasks = defineResource<Task>()({
  name: "tasks",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "stage", type: "string", enumValues: ["todo", "doing", "done"] },
    { name: "hours", type: "number" },
    { name: "urgent", type: "boolean" },
    { name: "due_on", type: "datetime", dbType: "date" },
  ],
});

/** Lists v-next (ADR 0017): what the view declares, drawn by ResourceView with no screen code. */
const tasksView = defineView(tasks, {
  fields: {
    stage: { labels: { todo: "To do" }, tones: { doing: "info", done: "success" } },
    hours: { emphasis: "secondary", width: 96 },
  },
  segments: [
    { id: "open", label: "Open", where: { stage: ["todo", "doing"] }, count: true },
    { id: "all", label: "All", count: true },
  ],
  filters: [{ field: "stage" }, { field: "hours" }],
  actions: [{ name: "finish", label: "Finish", bulk: true, can: (t) => (t.stage === "done" ? "It's already done." : true) }],
  groupBy: "stage",
  totals: { hours: "sum" },
  rowTone: (t) => (t.urgent ? "danger" : undefined),
  export: true,
  board: { field: "stage" },
  calendar: { field: "due_on" },
  inbox: { preview: "stage", time: "due_on", unread: "urgent", badge: "stage" },
});

const seed = (): Task[] => [
  { id: "1", title: "Draft the brief", stage: "todo", hours: 2, urgent: true, due_on: "2026-11-10" },
  { id: "2", title: "Book the venue", stage: "todo", hours: 1, urgent: false, due_on: "2026-11-12" },
  { id: "3", title: "Review the copy", stage: "doing", hours: 3, urgent: false, due_on: "2026-11-05" },
  { id: "4", title: "Send invites", stage: "done", hours: 1, urgent: false, due_on: "2026-11-03" },
];

function WithTasks({ children }: { children: ReactNode }) {
  // The in-memory provider runs no actions of its own: Finish moves the task to done here, as an
  // app's provider or `onAction` would, so the row menu and the bulk bar offer it.
  const [provider] = useState(() => {
    const base = createMockProvider({ tasks: seed() });
    return {
      ...base,
      runAction: async (resource: string, { id, action }: { id: string | number; action: string }) => {
        if (action === "finish") await base.update(resource, { id, data: { stage: "done" } });
        return { data: null };
      },
    };
  });
  const [store] = useState(() => createLocalSavedViewStore({ storage: createMemoryStorageAdapter() }));
  return (
    <GenesisProvider provider={provider}>
      <ResourceViewDefaultsProvider savedViews={store} rowActions>
        {children}
      </ResourceViewDefaultsProvider>
    </GenesisProvider>
  );
}

const meta: Meta<typeof ResourceView> = {
  title: "Foundation/Data/ResourceView lists",
  component: ResourceView,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof ResourceView>;

/**
 * Segments with counts, the stage and hours filters, groups with their totals, an urgent row's
 * tone, a row menu whose refused action says why, bulk actions, saved views, Export CSV, and the
 * switcher to the board and the calendar.
 */
export const Declared: Story = {
  render: () => (
    <WithTasks>
      <ResourceView view={tasksView} groupBy={tasksView.definition.groupBy} />
    </WithTasks>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText("Draft the brief")).toBeInTheDocument());
    expect(canvas.getByTestId("view-segment-open")).toBeInTheDocument();
    expect(canvas.getByTestId("view-type-board")).toBeInTheDocument();
    // The groups, each with its total: To do holds 2 + 1 hours.
    await waitFor(() => expect(canvasElement.querySelector('[data-slot="table-group"][data-group="todo"]')?.textContent).toContain("Hours: 3"));
    // Finish is offered on the rows, and in the bulk bar once a row is chosen.
    await userEvent.click(canvas.getByLabelText("Select Draft the brief"));
    await waitFor(() => expect(canvas.getByTestId("bulk-finish")).toBeInTheDocument());
  },
};

/**
 * The same view as an inbox: its segments with their counts in the rail, the rows as messages
 * (urgent ones unread, in bold), and the open task's page beside them. j and k move.
 */
export const Inbox: Story = {
  render: () => (
    <WithTasks>
      <ResourceView view={tasksView} type="inbox" className="h-[36rem] rounded-lg border" />
    </WithTasks>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText("Draft the brief")).toBeInTheDocument());
    expect(canvas.getByTestId("resource-inbox-nothing")).toBeInTheDocument();
  },
};

/**
 * The responsive contract (docs/RESPONSIVE.md, rules 1 and 4): a list answers to its own width,
 * not the screen's. The same embedded list, with the app's narrow default (`phoneMode="list"`),
 * shows rows in a 360px side panel and a table in the wide column beside it, on one desktop-sized
 * screen. A cell the screen drew itself (Restore) stays in the narrow row.
 */
export const NarrowPanel: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <WithTasks>
      <ResourceViewDefaultsProvider phoneMode="list">
        {/* A fixed 72rem stage, scrolling inside its frame on a smaller screen, so the wide
            column stays over 40rem (a table). The frame says so (data-scroll-frame, rule 2). */}
        <div className="overflow-x-auto" data-scroll-frame>
        <div className="flex w-[72rem] gap-4 p-4">
          <section aria-label="Side panel" className="w-[360px] shrink-0 rounded-lg border p-3" data-testid="narrow-panel">
            <ResourceView
              view={tasksView}
              layout="embedded"
              // On the last column, past the three a row shows by default: it stays because the screen drew it.
              cells={{ due_on: (t) => <button type="button" className="text-primary underline">Restore {t.title}</button> }}
            />
          </section>
          <section aria-label="Main column" className="min-w-0 flex-1 rounded-lg border p-3" data-testid="wide-column">
            <ResourceView view={tasksView} layout="embedded" />
          </section>
        </div>
        </div>
      </ResourceViewDefaultsProvider>
    </WithTasks>
  ),
  play: async ({ canvasElement }) => {
    const narrow = within(within(canvasElement).getByTestId("narrow-panel"));
    const wide = within(within(canvasElement).getByTestId("wide-column"));
    await waitFor(() => expect(narrow.getAllByTestId("resource-list-row").length).toBeGreaterThan(0));
    expect(canvasElement.querySelector('[data-testid="narrow-panel"] table')).toBeNull();
    await waitFor(() => expect(canvasElement.querySelector('[data-testid="wide-column"] table')).not.toBeNull());
    expect(wide.queryAllByTestId("resource-list-row")).toHaveLength(0);
    expect(narrow.getByRole("button", { name: "Restore Draft the brief" })).toBeInTheDocument();
  },
};
