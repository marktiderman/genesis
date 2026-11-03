import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";
import { defineResource, useDataProvider } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { KanbanBoard, ResourceBoard, ResourceView, useBoardColumns } from "@marktiderman/genesis-ui/data";
import { GenesisProvider, createMockProvider } from "@marktiderman/genesis-ui/provider";

type Task = { id: string; title: string; stage: "todo" | "doing" | "done" | null; due_on: string | null };

const tasks = defineResource<Task>()({
  name: "tasks",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "stage", type: "string", enumValues: ["todo", "doing", "done"], nullable: true },
    { name: "due_on", type: "datetime", dbType: "date", nullable: true },
  ],
});

const tasksView = defineView(tasks, {
  fields: { stage: { labels: { todo: "To do" }, tones: { doing: "info", done: "success" } } },
  board: { field: "stage", cardFields: ["due_on"], limits: { doing: 2 } },
});

const seed = (): Task[] => [
  { id: "1", title: "Draft the brief", stage: "todo", due_on: "2026-11-10" },
  { id: "2", title: "Book the venue", stage: "todo", due_on: null },
  { id: "3", title: "Review the copy", stage: "doing", due_on: "2026-11-05" },
  { id: "4", title: "Order the prints", stage: "doing", due_on: null },
  { id: "5", title: "Brief the team", stage: "doing", due_on: "2026-11-06" },
  { id: "6", title: "Send invites", stage: "done", due_on: null },
  { id: "7", title: "Find a photographer", stage: null, due_on: null },
];

/** A fresh in-memory provider per render, so moves don't leak between stories. */
function WithTasks({ children }: { children: ReactNode }) {
  const [provider] = useState(() => createMockProvider({ tasks: seed() }));
  return <GenesisProvider provider={provider}>{children}</GenesisProvider>;
}

const meta: Meta<typeof ResourceBoard> = {
  title: "Foundation/Data/ResourceBoard",
  component: ResourceBoard,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof ResourceBoard>;

/**
 * `<ResourceView mode="board">`: a column per value of the view's `board` field, in the contract's
 * order, then "No value". "Doing" is over its limit of 2. Move a card by dragging it, from its
 * handle with the keyboard, or from its "Move to" menu: the move is the resource's own update.
 */
export const FromAView: Story = {
  render: () => (
    <WithTasks>
      <ResourceView view={tasksView} mode="board" />
    </WithTasks>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("region", { name: "To do" })).toBeInTheDocument());
    await waitFor(() => expect(within(canvas.getByRole("region", { name: "Doing" })).getByText("Over limit of 2")).toBeInTheDocument());
    expect(canvas.getAllByRole("region").map((r) => r.getAttribute("aria-label"))).toEqual(["To do", "Doing", "Done", "No value"]);
  },
};

/** The screen narrows the columns and pages them two cards at a time. */
export const ScreenOverrides: Story = {
  render: () => (
    <WithTasks>
      <ResourceBoard view={tasksView} columns={["todo", "doing"]} perPage={2} limits={{}} title="This week" />
    </WithTasks>
  ),
};

/** `useBoardColumns` with `KanbanBoard`: a board over rows that aren't one view's, as Studio's board is. */
function LoaderBoard() {
  const provider = useDataProvider();
  const board = useBoardColumns<Task>({ provider, resource: "tasks", field: "stage", values: ["todo", "doing", "done"] });
  return (
    <KanbanBoard<Task>
      columns={board.columns.map((c) => ({ key: c.value, label: c.value, items: c.items, ...(c.total !== undefined ? { total: c.total } : {}) }))}
      getKey={(t) => t.id}
      renderCard={(t) => <div className="rounded-lg border bg-card p-3 text-sm">{t.title}</div>}
    />
  );
}

export const LoaderOnly: Story = {
  render: () => (
    <WithTasks>
      <LoaderBoard />
    </WithTasks>
  ),
};
