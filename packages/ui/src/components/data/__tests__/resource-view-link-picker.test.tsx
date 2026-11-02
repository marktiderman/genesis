/**
 * A link's picker in a ResourceView form (docs/RESOURCE-VIEW.md, "Links in forms"):
 * - it lists the linked resource through the provider, under the linked view's scope and its
 *   default filter, a page at a time;
 * - it searches on the server;
 * - it saves the picked row's key, and None clears an optional link to null;
 * - a link the screen's filter pins stays out of the form and is filled hidden.
 */
// @feat:resource-view-links
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, ViewerScope, type DataProvider, type FilterParam, type ListParams } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { ResourceForm } from "../ResourceForm";
import { ResourceView, useResourceViewProps } from "../resource-view";

type Task = { id: string; org_id: string; title: string; owner_id: string; reviewer_id: string | null };
type Person = { id: string; org_id: string; full_name: string; active: boolean };

const tasks = defineResource<Task>()({
  name: "tasks",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "org_id", type: "string", references: { resource: "people_orgs", field: "id" } },
    { name: "title", type: "string" },
    { name: "owner_id", type: "string", references: { resource: "people", field: "id" } },
    { name: "reviewer_id", type: "string", nullable: true, references: { resource: "people", field: "id" } },
  ],
});
const people = defineResource<Person>()({
  name: "people",
  key: "id",
  labelField: "full_name",
  fields: [
    { name: "id", type: "string" },
    { name: "org_id", type: "string" },
    { name: "full_name", type: "string" },
    { name: "active", type: "boolean" },
  ],
});

const peopleView = defineView(people, { scope: ["org_id"], presets: { default: { filter: { active: true } } } });
const tasksView = defineView(tasks, {
  scope: ["org_id"],
  form: ["title", "owner_id", "reviewer_id"],
  fields: { owner_id: { label: "Owner", link: { view: peopleView } }, reviewer_id: { label: "Reviewer", link: { view: () => peopleView } } },
});

// 30 active people in o1 (two pages), one inactive, and one in another organization.
const PEOPLE: Person[] = [
  ...Array.from({ length: 30 }, (_, i) => ({ id: `p${i + 1}`, org_id: "o1", full_name: `Person ${String(i + 1).padStart(2, "0")}`, active: true })),
  { id: "gone", org_id: "o1", full_name: "Former Person", active: false },
  { id: "other", org_id: "o2", full_name: "Elsewhere Person", active: true },
  { id: "ada", org_id: "o1", full_name: "Ada Lovelace", active: true },
];

function matches(row: Record<string, unknown>, f: FilterParam): boolean {
  if (f.operator === "eq") return row[f.field] === f.value;
  if (f.operator === "in") return (f.value as unknown[]).includes(row[f.field]);
  if (f.operator === "is_null") return row[f.field] == null;
  return true;
}

function setup(scope: Record<string, unknown> = { orgId: "o1" }) {
  const getList = vi.fn(async (resource: string, params: ListParams) => {
    if (resource === "tasks") return { data: [], total: 0 };
    let rows = PEOPLE.filter((p) => (params.filters ?? []).every((f) => matches(p, f)));
    if (params.search?.query) {
      const q = params.search.query.toLowerCase();
      rows = rows.filter((p) => params.search!.fields.some((field) => String(p[field as keyof Person]).toLowerCase().includes(q)));
    }
    if (params.sort) rows = [...rows].sort((a, b) => String(a[params.sort!.field as keyof Person]).localeCompare(String(b[params.sort!.field as keyof Person])));
    const { page = 1, perPage = 25 } = params.pagination ?? {};
    return { data: rows.slice((page - 1) * perPage, page * perPage), total: rows.length };
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
      <ViewerScope viewer="u1" scope={scope} timeZone="UTC">
        {children}
      </ViewerScope>
    </GenesisProvider>
  );
  const peopleLists = () => getList.mock.calls.filter(([r, p]) => r === "people" && !(p.filters ?? []).some((f) => f.field === "id"));
  return { Wrapper, provider, peopleLists };
}

const openForm = async () => {
  fireEvent.click(await screen.findByRole("button", { name: /New/ }));
  return screen.findByRole("dialog");
};

const picker = (form: HTMLElement, label: string) => within(form).getByRole("button", { name: new RegExp(`^${label}`) });
const openPicker = async (form: HTMLElement, label: string) => {
  const trigger = picker(form, label);
  fireEvent.click(trigger);
  return screen.findByRole("listbox");
};

describe("a link's picker in a ResourceView form", () => {
  it("lists the linked rows through the provider, under the linked view's scope and default filter, a page at a time", async () => {
    localStorage.clear();
    const { Wrapper, peopleLists } = setup();
    render(<ResourceView view={tasksView} mode="table" detail="none" />, { wrapper: Wrapper });
    const form = await openForm();
    // Closed, the picker asks for nothing.
    expect(peopleLists()).toHaveLength(0);
    const list = await openPicker(form, "Owner");
    await waitFor(() => expect(within(list).getByText("Ada Lovelace")).toBeTruthy());
    const [, params] = peopleLists()[0]!;
    expect(params.filters).toEqual([
      { field: "org_id", operator: "eq", value: "o1" },
      { field: "active", operator: "eq", value: true },
    ]);
    expect(params.sort).toEqual({ field: "full_name", order: "asc" });
    expect(params.pagination).toMatchObject({ page: 1, perPage: 25 });
    expect(within(list).queryByText("Former Person")).toBeNull();
    expect(within(list).queryByText("Elsewhere Person")).toBeNull();
    // 31 match: one page shown, the rest on Show more.
    expect(within(list).queryByText("Person 30")).toBeNull();
    fireEvent.click(within(list).getByText("Show more"));
    await waitFor(() => expect(within(list).getByText("Person 30")).toBeTruthy());
    expect(peopleLists().at(-1)![1].pagination).toMatchObject({ page: 2 });
    // A required link has no None.
    expect(within(list).queryByText("None")).toBeNull();
  });

  it("searches on the server", async () => {
    localStorage.clear();
    const { Wrapper, peopleLists } = setup();
    render(<ResourceView view={tasksView} mode="table" detail="none" />, { wrapper: Wrapper });
    const list = await openPicker(await openForm(), "Owner");
    await waitFor(() => expect(within(list).getByText("Ada Lovelace")).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "ada" } });
    await waitFor(() => expect(peopleLists().some(([, p]) => p.search?.query === "ada")).toBe(true));
    expect(peopleLists().find(([, p]) => p.search?.query === "ada")![1].search).toEqual({ query: "ada", fields: ["full_name"] });
    await waitFor(() => expect(within(screen.getByRole("listbox")).queryByText("Person 01")).toBeNull());
    expect(within(screen.getByRole("listbox")).getByText("Ada Lovelace")).toBeTruthy();
  });

  it("saves the picked row's key, and shows its words", async () => {
    localStorage.clear();
    const { Wrapper, provider } = setup();
    render(<ResourceView view={tasksView} mode="table" detail="none" />, { wrapper: Wrapper });
    const form = await openForm();
    fireEvent.change(within(form).getByLabelText(/Title/), { target: { value: "Write" } });
    const list = await openPicker(form, "Owner");
    fireEvent.click(await within(list).findByText("Ada Lovelace"));
    await waitFor(() => expect(picker(form, "Owner").textContent).toContain("Ada Lovelace"));
    fireEvent.click(within(form).getByRole("button", { name: /Create|Save/ }));
    await waitFor(() => expect(provider.create).toHaveBeenCalled());
    const sent = (provider.create as ReturnType<typeof vi.fn>).mock.calls[0]![1].data as Record<string, unknown>;
    expect(sent).toMatchObject({ title: "Write", owner_id: "ada", org_id: "o1" });
    // The optional reviewer, left alone, isn't sent: its column's default (null) applies.
    expect(sent).not.toHaveProperty("reviewer_id");
  });

  it("clears an optional link to null with None", async () => {
    localStorage.clear();
    const { Wrapper, provider } = setup();
    const { result } = renderHook(() => useResourceViewProps({ view: tasksView }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.formFields).toBeTruthy());
    render(
      <ResourceForm
        resource="tasks"
        action="edit"
        open
        onOpenChange={() => {}}
        fields={result.current.formFields}
        item={{ id: "t1", org_id: "o1", title: "Write", owner_id: "p1", reviewer_id: "ada" }}
      />,
      { wrapper: Wrapper },
    );
    const form = await screen.findByRole("dialog");
    // The chosen row's words, before the picker opens.
    await waitFor(() => expect(picker(form, "Reviewer").textContent).toContain("Ada Lovelace"));
    const list = await openPicker(form, "Reviewer");
    fireEvent.click(await within(list).findByText("None"));
    await act(async () => {
      fireEvent.click(within(form).getByRole("button", { name: /Save|Update/ }));
    });
    await waitFor(() => expect(provider.update).toHaveBeenCalled());
    const sent = (provider.update as ReturnType<typeof vi.fn>).mock.calls[0]![1].data as Record<string, unknown>;
    expect(sent.reviewer_id).toBeNull();
  });

  it("keeps a link the screen's filter pins out of the form, and fills it hidden", async () => {
    const { Wrapper } = setup();
    const { result } = renderHook(() => useResourceViewProps({ view: tasksView, filter: { owner_id: "p1" } }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.formFields).toBeTruthy());
    const owner = result.current.formFields!.find((f) => f.key === "owner_id")!;
    expect(owner).toMatchObject({ type: "hidden", hidden: true, defaultValue: "p1", readOnlyOnEdit: true });
    expect(result.current.formFields!.find((f) => f.key === "reviewer_id")).toMatchObject({ type: "relation", required: false });
  });

  it("is a button that opens a listbox, so the search input is the only combobox, and reads the chosen row as selected", async () => {
    localStorage.clear();
    const { Wrapper } = setup();
    const { result } = renderHook(() => useResourceViewProps({ view: tasksView }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.formFields).toBeTruthy());
    render(
      <ResourceForm
        resource="tasks"
        action="edit"
        open
        onOpenChange={() => {}}
        fields={result.current.formFields}
        item={{ id: "t1", org_id: "o1", title: "Write", owner_id: "ada", reviewer_id: null }}
      />,
      { wrapper: Wrapper },
    );
    const form = await screen.findByRole("dialog");
    const trigger = picker(form, "Owner");
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.getAttribute("role")).toBeNull();
    expect(within(form).queryAllByRole("combobox")).toHaveLength(0);
    const list = await openPicker(form, "Owner");
    await waitFor(() => expect(within(list).getByText("Ada Lovelace")).toBeTruthy());
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    const chosen = within(list).getByText("Ada Lovelace").closest("[role=option]")!;
    expect(chosen.textContent).toContain("selected");
    expect(within(list).getByText("Person 01").closest("[role=option]")!.textContent).not.toContain("selected");
  });

  it("offers only the rows of a list (in) filter on the link, so a save never moves the row out of its list", async () => {
    localStorage.clear();
    const { Wrapper } = setup();
    const { result } = renderHook(() => useResourceViewProps({ view: tasksView, filter: { owner_id: ["p1", "ada"] } }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.formFields).toBeTruthy());
    const owner = result.current.formFields!.find((f) => f.key === "owner_id")!;
    expect(owner).toMatchObject({ type: "relation" });
    const filters = owner.relation!.filters as (values: Record<string, unknown>) => FilterParam[];
    expect(filters({})).toEqual([
      { field: "org_id", operator: "eq", value: "o1" },
      { field: "active", operator: "eq", value: true },
      { field: "id", operator: "in", value: ["p1", "ada"] },
    ]);
    render(
      <ResourceForm resource="tasks" action="create" open onOpenChange={() => {}} fields={result.current.formFields} />,
      { wrapper: Wrapper },
    );
    const form = await screen.findByRole("dialog");
    const list = await openPicker(form, "Owner");
    await waitFor(() => expect(within(list).getByText("Ada Lovelace")).toBeTruthy());
    expect(within(list).getByText("Person 01")).toBeTruthy();
    expect(within(list).queryByText("Person 02")).toBeNull();
    expect(within(list).getAllByRole("option")).toHaveLength(2);
  });
});
