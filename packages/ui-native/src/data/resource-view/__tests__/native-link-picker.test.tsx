// @feat:resource-view-links
/**
 * A link's picker in NativeResourceView's form sheet: the linked rows through the provider, under
 * the linked view's scope and default filter; the picked key saved; None clears to null; a link
 * the screen's filter pins stays read-only.
 */
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, ViewerScope, type DataProvider, type FilterParam, type ListParams } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { formFieldsFor, NativeResourceView, useNativeResourceView, writableValues } from "..";

type Task = { id: string; org_id: string; title: string; owner_id: string; reviewer_id: string | null };
type Person = { id: string; org_id: string; full_name: string; active: boolean };

const tasks = defineResource<Task>()({
  name: "tasks",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "org_id", type: "string" },
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
  fields: { owner_id: { label: "Owner", link: { view: peopleView } }, reviewer_id: { label: "Reviewer", link: { view: peopleView } } },
});

const PEOPLE: Person[] = [
  { id: "ada", org_id: "o1", full_name: "Ada Lovelace", active: true },
  { id: "grace", org_id: "o1", full_name: "Grace Hopper", active: true },
  { id: "gone", org_id: "o1", full_name: "Former Person", active: false },
  { id: "other", org_id: "o2", full_name: "Elsewhere Person", active: true },
];
const TASK: Task = { id: "t1", org_id: "o1", title: "Write", owner_id: "ada", reviewer_id: "grace" };

const matches = (row: Record<string, unknown>, f: FilterParam) =>
  f.operator === "eq" ? row[f.field] === f.value : f.operator === "in" ? (f.value as unknown[]).includes(row[f.field]) : true;

function setup() {
  const getList = vi.fn(async (resource: string, params: ListParams) => {
    if (resource === "tasks") return { data: [TASK], total: 1 };
    let rows = PEOPLE.filter((p) => (params.filters ?? []).every((f) => matches(p, f)));
    if (params.search?.query) rows = rows.filter((p) => p.full_name.toLowerCase().includes(params.search!.query.toLowerCase()));
    return { data: rows, total: rows.length };
  });
  const provider: DataProvider = {
    getList: getList as unknown as DataProvider["getList"],
    getOne: vi.fn(async () => ({ data: TASK })) as DataProvider["getOne"],
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(async (_r, { data }) => ({ data: { id: "new", ...(data as object) } })) as DataProvider["create"],
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
  const peopleLists = () => getList.mock.calls.filter(([r, p]) => r === "people" && !(p.filters ?? []).some((f) => f.field === "id"));
  return { Wrapper, provider, peopleLists };
}

const field = (key: string) => `native-resource-view-form-field-${key}`;

describe("a link's picker in the native form sheet", () => {
  it("is a picker, not a typed id", () => {
    const fields = formFieldsFor(tasksView, "create");
    expect(fields.find((f) => f.key === "owner_id")).toMatchObject({ kind: "link", readOnly: false, required: true });
    expect(fields.find((f) => f.key === "reviewer_id")).toMatchObject({ kind: "link", required: false });
  });

  it("lists the linked rows through the provider under the linked view's scope and default filter, and saves the picked key", async () => {
    const { Wrapper, provider, peopleLists } = setup();
    render(<NativeResourceView view={tasksView} />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByTestId("native-resource-view-create"));
    const form = await screen.findByTestId("native-resource-view-form");
    fireEvent.change(within(form).getByTestId(field("title")).querySelector("input")!, { target: { value: "Ship" } });
    expect(peopleLists()).toHaveLength(0);
    fireEvent.click(within(form).getByTestId(`${field("owner_id")}-trigger`));
    await waitFor(() => expect(within(form).getByTestId(`${field("owner_id")}-option-grace`)).toBeTruthy());
    expect(peopleLists()[0]![1].filters).toEqual([
      { field: "org_id", operator: "eq", value: "o1" },
      { field: "active", operator: "eq", value: true },
    ]);
    expect(within(form).queryByTestId(`${field("owner_id")}-option-gone`)).toBeNull();
    expect(within(form).queryByTestId(`${field("owner_id")}-option-other`)).toBeNull();
    // A required link has no None.
    expect(within(form).queryByTestId(`${field("owner_id")}-none`)).toBeNull();
    fireEvent.click(within(form).getByTestId(`${field("owner_id")}-option-grace`));
    await waitFor(() => expect(within(form).getByTestId(`${field("owner_id")}-trigger`).textContent).toContain("Grace Hopper"));
    fireEvent.click(within(form).getByTestId("native-resource-view-form-save"));
    await waitFor(() => expect(provider.create).toHaveBeenCalled());
    expect((provider.create as ReturnType<typeof vi.fn>).mock.calls[0]![1].data).toMatchObject({ title: "Ship", owner_id: "grace" });
  });

  it("clears an optional link to null with None", () => {
    const fields = formFieldsFor(tasksView, "edit");
    expect(writableValues(tasksView, "edit", fields, { ...TASK, reviewer_id: null }, new Set(["reviewer_id"]))).toEqual({ reviewer_id: null });
  });

  it("offers None for an optional link, and saves null", async () => {
    const { Wrapper, provider } = setup();
    render(<NativeResourceView view={tasksView} />, { wrapper: Wrapper });
    const row = await screen.findByTestId("native-resource-view-row-t1");
    act(() => {
      row.dispatchEvent(new CustomEvent("accessibilityaction", { detail: "edit" }));
    });
    const form = await screen.findByTestId("native-resource-view-form");
    const trigger = await within(form).findByTestId(`${field("reviewer_id")}-trigger`);
    await waitFor(() => expect(trigger.textContent).toContain("Grace Hopper"));
    fireEvent.click(trigger);
    fireEvent.click(await within(form).findByTestId(`${field("reviewer_id")}-none`));
    fireEvent.click(within(form).getByTestId("native-resource-view-form-save"));
    await waitFor(() => expect(provider.update).toHaveBeenCalled());
    expect((provider.update as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toEqual({ id: "t1", data: { reviewer_id: null } });
  });

  it("keeps a link the screen's filter pins read-only on edit, and never sends it", async () => {
    const { Wrapper, provider } = setup();
    const { result } = renderHook(() => useNativeResourceView(tasksView, { filter: { owner_id: "ada" } }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.formFields("create").map((f) => f.key)).toEqual(["title", "reviewer_id"]);
    expect(result.current.formFields("edit").find((f) => f.key === "owner_id")).toMatchObject({ readOnly: true });
    await act(async () => {
      await result.current.save("edit", { ...TASK, owner_id: "grace", title: "Changed" }, TASK, new Set(["owner_id", "title"]));
    });
    expect((provider.update as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toEqual({ id: "t1", data: { title: "Changed" } });
  });

  it("draws each choice as a radio, checked when it's the link's row", async () => {
    const { Wrapper } = setup();
    render(<NativeResourceView view={tasksView} />, { wrapper: Wrapper });
    const row = await screen.findByTestId("native-resource-view-row-t1");
    act(() => {
      row.dispatchEvent(new CustomEvent("accessibilityaction", { detail: "edit" }));
    });
    const form = await screen.findByTestId("native-resource-view-form");
    fireEvent.click(await within(form).findByTestId(`${field("owner_id")}-trigger`));
    const ada = await within(form).findByTestId(`${field("owner_id")}-option-ada`);
    const grace = within(form).getByTestId(`${field("owner_id")}-option-grace`);
    expect(ada.getAttribute("role")).toBe("radio");
    expect(ada.getAttribute("aria-checked")).toBe("true");
    expect(grace.getAttribute("aria-checked")).toBe("false");
  });

  it("announces an error: in the trigger's label and as an alert", async () => {
    const { Wrapper } = setup();
    render(<NativeResourceView view={tasksView} />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByTestId("native-resource-view-create"));
    const form = await screen.findByTestId("native-resource-view-form");
    fireEvent.change(within(form).getByTestId(field("title")).querySelector("input")!, { target: { value: "Ship" } });
    fireEvent.click(within(form).getByTestId("native-resource-view-form-save"));
    const error = await within(form).findByTestId(`${field("owner_id")}-error`);
    expect(error.getAttribute("role")).toBe("alert");
    expect(within(form).getByTestId(`${field("owner_id")}-trigger`).getAttribute("aria-label")).toContain(error.textContent!);
  });

  it("offers only the rows of a list (in) filter on the link", () => {
    const fields = formFieldsFor(tasksView, "edit", { within: { owner_id: ["ada", "gone"] } });
    const owner = fields.find((f) => f.key === "owner_id")!;
    expect(owner.link!.filters({ orgId: "o1" })).toEqual([
      { field: "org_id", operator: "eq", value: "o1" },
      { field: "active", operator: "eq", value: true },
      { field: "id", operator: "in", value: ["ada", "gone"] },
    ]);
    expect(owner.link!.labelField).toBe("full_name");
    // Other links are as they were.
    expect(fields.find((f) => f.key === "reviewer_id")!.link!.filters({ orgId: "o1" })).toHaveLength(2);
  });

  it('lists the rows in the linked view\'s order with orderBy: "view", held to a list filter too', async () => {
    const ranked = defineView(people, { scope: ["org_id"], orderBy: { field: "full_name", direction: "desc" } });
    const v = defineView(tasks, { scope: ["org_id"], form: ["title", "owner_id"], fields: { owner_id: { label: "Owner", link: { view: ranked, orderBy: "view" } } } });
    expect(formFieldsFor(v, "edit", { within: { owner_id: ["ada"] } }).find((f) => f.key === "owner_id")!.link!.orderBy).toEqual({
      field: "full_name",
      direction: "desc",
    });
    const { Wrapper, peopleLists } = setup();
    render(<NativeResourceView view={v} />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByTestId("native-resource-view-create"));
    const form = await screen.findByTestId("native-resource-view-form");
    fireEvent.click(within(form).getByTestId(`${field("owner_id")}-trigger`));
    await waitFor(() => expect(peopleLists().length).toBeGreaterThan(0));
    expect(peopleLists()[0]![1].sort).toEqual({ field: "full_name", order: "desc" });
  });

  it("holds the picker to a screen's list filter", async () => {
    const { Wrapper } = setup();
    const { result } = renderHook(() => useNativeResourceView(tasksView, { filter: { owner_id: ["ada", "grace"] } }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    const owner = result.current.formFields("create").find((f) => f.key === "owner_id")!;
    expect(owner.link!.filters({ orgId: "o1" }).at(-1)).toEqual({ field: "id", operator: "in", value: ["ada", "grace"] });
  });
});
