// A starting point, not a template: the board preview built for #670. Replace all of it.
import { createRoot } from "react-dom/client";
import { defineResource } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { GenesisProvider } from "@marktiderman/genesis-ui/provider";
import { ResourceView } from "@marktiderman/genesis-ui/data";
import "./styles.css";

type Task = { id: string; title: string; stage: string; due_on: string; owner: string };

const tasksResource = defineResource<Task>()({
  name: "tasks",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "stage", type: "string", enumValues: ["todo", "doing", "review", "done"], hasDefault: true },
    { name: "due_on", type: "datetime", dbType: "date" },
    { name: "owner", type: "string" },
  ],
});

const tasksView = defineView(tasksResource, {
  fields: {
    stage: { labels: { todo: "To do", doing: "Doing", review: "In review", done: "Done" }, tones: { doing: "info", review: "warning", done: "success" } },
    due_on: { label: "Due" },
  },
  form: ["title", "stage", "due_on", "owner"],
  board: { field: "stage", cardFields: ["due_on", "owner"], limits: { doing: 3 } },
  orderBy: { field: "due_on" },
});

const t = (id: number, title: string, stage: string, due: string, owner: string): Task => ({ id: `t${id}`, title, stage, due_on: due, owner });
const tasks = [
  t(1, "Write the onboarding email", "todo", "2026-11-05", "Ada"),
  t(2, "Pick the launch date", "todo", "2026-11-06", "Sam"),
  t(3, "Price page copy", "todo", "2026-11-10", "Ravi"),
  t(4, "Fix the sign-in redirect", "doing", "2026-11-03", "Jane"),
  t(5, "Gallery upload limits", "doing", "2026-11-04", "Ada"),
  t(6, "Chat read receipts", "doing", "2026-11-04", "Sam"),
  t(7, "Calendar export", "review", "2026-11-02", "Ravi"),
  t(8, "Invoice PDF", "done", "2026-10-30", "Jane"),
  t(9, "Coach notes privacy", "done", "2026-10-31", "Ada"),
];

function Page() {
  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">genesis#670 · staging/resource-view-modes · real packages, mock data</p>
          <h1 className="text-2xl font-semibold">Board mode on ResourceView</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">One <code>board</code> block on the view (<code>field: "stage"</code>, <code>limits: {"{ doing: 3 }"}</code>) and <code>{'<ResourceView mode="board" />'}</code>. Every move goes through the resource's provider, the same as any edit.</p>
        </header>
        <ol className="text-sm grid gap-1 md:grid-cols-2 list-decimal pl-5 text-muted-foreground">
          <li>Drag a card from To do into Doing: the limit is 3, so the column goes over and says so.</li>
          <li>Tab to a card and use the keyboard to pick it up and move it.</li>
          <li>Open a card's "Move to…" menu and send it to Done.</li>
          <li>Click a card to open its peek.</li>
        </ol>
        <ResourceView view={tasksView} mode="board" />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <GenesisProvider mock={{ datasets: { tasks } }}>
    <Page />
  </GenesisProvider>,
);
