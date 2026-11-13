import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";
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
  const [provider] = useState(() => createMockProvider({ tasks: seed() }));
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
      <ResourceView view={tasksView} />
    </WithTasks>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText("Draft the brief")).toBeInTheDocument());
    expect(canvas.getByTestId("view-segment-open")).toBeInTheDocument();
    expect(canvas.getByTestId("view-type-board")).toBeInTheDocument();
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
