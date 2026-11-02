/**
 * A standalone ResourceForm from a view, and a link picker in the view's order:
 * - `<ResourceForm view>` gets the fields ResourceView's own form gets (one builder), the view's
 *   noun and form words, and the viewer's scope filled hidden on create;
 * - `fields`, `title` and the other props still win;
 * - a link with `orderBy: "view"` lists its rows in the linked view's order, not by name.
 */
// @feat:resource-view-links
import { fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, ViewerScope, type DataProvider, type FilterParam, type ListParams } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { ResourceForm } from "../ResourceForm";
import { useResourceViewProps, useViewFormFields } from "../resource-view";

type Task = { id: string; org_id: string; title: string; status: "open" | "done"; stage_id: string; reviewer_id: string | null };
type Stage = { id: string; org_id: string; name: string; position: number };

const tasks = defineResource<Task>()({
  name: "tasks",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "org_id", type: "string" },
    { name: "title", type: "string" },
    { name: "status", type: "string", enumValues: ["open", "done"], hasDefault: true },
    { name: "stage_id", type: "string", references: { resource: "stages", field: "id" } },
    { name: "reviewer_id", type: "string", nullable: true, references: { resource: "stages", field: "id" } },
  ],
});
const stages = defineResource<Stage>()({
  name: "stages",
  key: "id",
  labelField: "name",
  fields: [
    { name: "id", type: "string" },
    { name: "org_id", type: "string" },
    { name: "name", type: "string" },
    { name: "position", type: "number" },
  ],
});

const stagesView = defineView(stages, { scope: ["org_id"], orderBy: { field: "position" } });
const tasksView = defineView(tasks, {
  scope: ["org_id"],
  copy: { noun: "task", form: { createSubmit: "Add task" } },
  form: ["title", "status", "stage_id", "reviewer_id"],
  fields: {
    stage_id: { label: "Stage", link: { view: stagesView, orderBy: "view" } },
    reviewer_id: { label: "Reviewer", link: { view: stagesView } },
  },
});

const STAGES: Stage[] = [
  { id: "s-won", org_id: "o1", name: "Won", position: 3 },
  { id: "s-lead", org_id: "o1", name: "Lead", position: 1 },
  { id: "s-call", org_id: "o1", name: "Call", position: 2 },
];

function matches(row: Record<string, unknown>, f: FilterParam): boolean {
  if (f.operator === "eq") return row[f.field] === f.value;
  if (f.operator === "in") return (f.value as unknown[]).includes(row[f.field]);
  return true;
}

function setup() {
  const getList = vi.fn(async (resource: string, params: ListParams) => {
    if (resource !== "stages") return { data: [], total: 0 };
    let rows = STAGES.filter((s) => (params.filters ?? []).every((f) => matches(s as unknown as Record<string, unknown>, f)));
    const by = params.sort?.field as keyof Stage | undefined;
    if (by) rows = [...rows].sort((a, b) => (a[by] < b[by] ? -1 : a[by] > b[by] ? 1 : 0) * (params.sort!.order === "desc" ? -1 : 1));
    return { data: rows, total: rows.length };
  });
  const provider: DataProvider = {
    getList: getList as unknown as DataProvider["getList"],
    getOne: vi.fn(),
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(async (_r, { data }) => ({ data: { id: "t-new", ...(data as object) } })) as DataProvider["create"],
    update: vi.fn(async (_r, { id, data }) => ({ data: { id, ...(data as object) } })) as DataProvider["update"],
    deleteOne: vi.fn(),
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={provider} queryClient={queryClient}>
      <ViewerScope viewer="u1" scope={{ orgId: "o1" }} timeZone="UTC">
        {children}
      </ViewerScope>
    </GenesisProvider>
  );
  const stageLists = () => getList.mock.calls.filter(([r, p]) => r === "stages" && !(p.filters ?? []).some((f) => f.field === "id"));
  return { Wrapper, provider, stageLists };
}

const picker = (form: HTMLElement, label: string) => within(form).getByRole("button", { name: new RegExp(`^${label}`) });

describe("ResourceForm from a view", () => {
  it("builds the same fields ResourceView's form does", async () => {
    const { Wrapper } = setup();
    const page = renderHook(() => useResourceViewProps({ view: tasksView }), { wrapper: Wrapper }).result.current.formFields!;
    const own = renderHook(() => useViewFormFields(tasksView), { wrapper: Wrapper }).result.current;
    const shape = (fields: typeof own) => fields.map((f) => ({ ...f, relation: f.relation ? { ...f.relation, filters: undefined } : undefined }));
    expect(shape(own)).toEqual(shape(page));
    expect(own.map((f) => f.key)).toEqual(["title", "status", "stage_id", "reviewer_id", "org_id"]);
    expect(own.find((f) => f.key === "org_id")).toMatchObject({ type: "hidden", hidden: true, defaultValue: "o1" });
  });

  it("opens with the view's noun and words, and saves what the view lets a writer send, with the scope", async () => {
    const { Wrapper, provider } = setup();
    render(<ResourceForm view={tasksView} action="create" open onOpenChange={() => {}} />, { wrapper: Wrapper });
    const form = await screen.findByRole("dialog");
    expect(within(form).getByRole("heading", { name: "New task" })).toBeTruthy();
    fireEvent.change(within(form).getByLabelText(/Title/), { target: { value: "Call back" } });
    fireEvent.click(picker(form, "Stage"));
    fireEvent.click(await within(await screen.findByRole("listbox")).findByText("Call"));
    await waitFor(() => expect(picker(form, "Stage").textContent).toContain("Call"));
    fireEvent.click(within(form).getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(provider.create).toHaveBeenCalled());
    const [resource, { data }] = (provider.create as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(resource).toBe("tasks");
    expect(data).toMatchObject({ title: "Call back", stage_id: "s-call", org_id: "o1" });
  });

  it("lets the caller's fields, title and filter win", async () => {
    const { Wrapper, provider } = setup();
    render(
      <ResourceForm
        view={tasksView}
        action="create"
        open
        onOpenChange={() => {}}
        title="Quick task"
        fields={[{ key: "title", label: "Title", type: "text" }]}
      />,
      { wrapper: Wrapper },
    );
    const form = await screen.findByRole("dialog");
    expect(within(form).getByRole("heading", { name: "Quick task" })).toBeTruthy();
    expect(within(form).queryByText("Stage")).toBeNull();
    fireEvent.change(within(form).getByLabelText(/Title/), { target: { value: "Only a title" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(provider.create).toHaveBeenCalled());
    expect((provider.create as ReturnType<typeof vi.fn>).mock.calls[0]![1].data).toEqual({ title: "Only a title" });
  });

  it("starts a new row in the filter's list, filled hidden", async () => {
    const { Wrapper } = setup();
    const own = renderHook(() => useViewFormFields(tasksView, { filter: { stage_id: "s-lead" }, defaults: { status: "done" } }), { wrapper: Wrapper }).result.current;
    // The link the filter pins is the list's own: no picker, filled hidden.
    expect(own.find((f) => f.key === "stage_id")).toMatchObject({ type: "hidden", defaultValue: "s-lead" });
    expect(own.find((f) => f.key === "status")).toMatchObject({ type: "select", defaultValue: "done" });
  });

  it("needs a resource or a view", () => {
    const { Wrapper } = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ResourceForm action="create" open onOpenChange={() => {}} />, { wrapper: Wrapper })).toThrow(/needs a resource or a view/);
    vi.restoreAllMocks();
  });
});

describe("a link's picker in the linked view's order", () => {
  it('lists the rows by the linked view\'s orderBy with orderBy: "view", and by name without it', async () => {
    const { Wrapper, stageLists } = setup();
    render(<ResourceForm view={tasksView} action="create" open onOpenChange={() => {}} />, { wrapper: Wrapper });
    const form = await screen.findByRole("dialog");
    fireEvent.click(picker(form, "Stage"));
    const list = await screen.findByRole("listbox");
    await waitFor(() => expect(within(list).getByText("Won")).toBeTruthy());
    expect(stageLists()[0]![1].sort).toEqual({ field: "position", order: "asc" });
    const names = within(list)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(names).toEqual(["Lead", "Call", "Won"]);
    fireEvent.keyDown(list, { key: "Escape" });

    // The reviewer's link didn't opt in: it keeps the naming field.
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    fireEvent.click(picker(form, "Reviewer"));
    await waitFor(() => expect(stageLists().some(([, p]) => p.sort?.field === "name")).toBe(true));
  });
});
