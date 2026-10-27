/**
 * Relation labels: a link cell shows the linked row's words, fetched once per linked resource for
 * the whole page (never per cell), and the id when there are none.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, type DataProvider, type ListParams } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { ResourceView } from "../resource-view";

type Task = { id: string; title: string; owner_id: string | null; reviewer_id: string | null };

const tasks = defineResource<Task>()({
  name: "tasks",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "owner_id", type: "string", nullable: true, references: { resource: "people", field: "id" } },
    { name: "reviewer_id", type: "string", nullable: true, references: { resource: "people", field: "id" } },
  ],
});

const TASKS: Task[] = [
  { id: "t1", title: "Write", owner_id: "u1", reviewer_id: "u2" },
  { id: "t2", title: "Ship", owner_id: "u1", reviewer_id: "gone" },
  { id: "t3", title: "Rest", owner_id: null, reviewer_id: null },
];
const PEOPLE = [
  { id: "u1", full_name: "Ada Lovelace", nickname: "Ada" },
  { id: "u2", full_name: "Grace Hopper", nickname: "Amazing Grace" },
];

function setup(describe?: DataProvider["describe"], peopleFail = false) {
  const getList = vi.fn(async (resource: string, params: ListParams) => {
    if (resource === "tasks") return { data: TASKS, total: TASKS.length };
    if (peopleFail) throw new Error("permission denied");
    const ids = (params.filters?.[0] as { value: string[] }).value;
    return { data: PEOPLE.filter((p) => ids.includes(p.id)), total: -1 };
  });
  const provider: DataProvider = {
    getList: getList as unknown as DataProvider["getList"],
    getOne: vi.fn(),
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(),
    update: vi.fn(),
    deleteOne: vi.fn(),
    ...(describe ? { describe } : {}),
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={provider} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
  const peopleCalls = () => getList.mock.calls.filter(([r]) => r === "people");
  return { Wrapper, peopleCalls };
}

const cellsOf = async (title: string) => (await screen.findByText(title)).closest("tr")!;

describe("relation labels", () => {
  it("shows the linked row's words, with one query for every link to the same resource", async () => {
    localStorage.clear();
    const { Wrapper, peopleCalls } = setup(async () => ({
      name: "people",
      key: "id",
      labelField: "full_name",
      fields: [
        { name: "id", type: "string" },
        { name: "full_name", type: "string" },
      ],
    }));
    const view = defineView(tasks, { columns: { default: ["title", "owner_id", "reviewer_id"] } });
    render(<ResourceView view={view} mode="table" detail="none" />, { wrapper: Wrapper });
    const first = await cellsOf("Write");
    await waitFor(() => expect(within(first).getByText("Grace Hopper")).toBeTruthy());
    expect(within(first).getByText("Ada Lovelace")).toBeTruthy();
    // Owner and reviewer both point at people: one request for the page, each id once.
    expect(peopleCalls()).toHaveLength(1);
    const [, params] = peopleCalls()[0]!;
    expect(params.filters).toEqual([{ field: "id", operator: "in", value: expect.arrayContaining(["u1", "u2", "gone"]) }]);
    expect((params.filters![0] as { value: string[] }).value).toHaveLength(3);
    expect(params.select).toBe("id,full_name");
    // A row the viewer can't see (or that's gone) shows words, never its id.
    const second = screen.getByText("Ship").closest("tr")!;
    expect(within(second).getByText("Not available")).toBeTruthy();
    expect(within(second).queryByText("gone")).toBeNull();
  });

  it("uses the view's labelField over the linked resource's", async () => {
    localStorage.clear();
    const { Wrapper, peopleCalls } = setup();
    const view = defineView(tasks, {
      fields: { owner_id: { labelField: "nickname" } },
      columns: { default: ["title", "owner_id"] },
    });
    render(<ResourceView view={view} mode="table" detail="none" />, { wrapper: Wrapper });
    const first = await cellsOf("Write");
    await waitFor(() => expect(within(first).getByText("Ada")).toBeTruthy());
    expect(peopleCalls()[0]![1].select).toBe("id,nickname");
  });

  it("guesses a name-like field when nothing says, without describe", async () => {
    localStorage.clear();
    const { Wrapper, peopleCalls } = setup();
    const view = defineView(tasks, { columns: { default: ["title", "owner_id"] } });
    render(<ResourceView view={view} mode="table" detail="none" />, { wrapper: Wrapper });
    const first = await cellsOf("Write");
    await waitFor(() => expect(within(first).getByText("Ada Lovelace")).toBeTruthy());
    // No naming field known: the whole row, and the name read from it.
    expect(peopleCalls()[0]![1].select).toBeUndefined();
  });

  it("shows the view's missingLabel for a hidden row", async () => {
    localStorage.clear();
    const { Wrapper } = setup();
    const view = defineView(tasks, {
      fields: { reviewer_id: { missingLabel: "Someone you can't see" } },
      columns: { default: ["title", "reviewer_id"] },
    });
    render(<ResourceView view={view} mode="table" detail="none" />, { wrapper: Wrapper });
    const second = await cellsOf("Ship");
    await waitFor(() => expect(within(second).getByText("Someone you can't see")).toBeTruthy());
  });

  it("shows words, not the id, when the label query fails", async () => {
    localStorage.clear();
    const { Wrapper, peopleCalls } = setup(undefined, true);
    const view = defineView(tasks, { columns: { default: ["title", "owner_id"] } });
    render(<ResourceView view={view} mode="table" detail="none" />, { wrapper: Wrapper });
    const first = await cellsOf("Write");
    await waitFor(() => expect(peopleCalls()).toHaveLength(1));
    await waitFor(() => expect(within(first).getByText("Not available")).toBeTruthy());
    expect(within(first).queryByText("u1")).toBeNull();
  });

  it("matches numeric ids as numbers, and keeps each request within the provider's page limit", async () => {
    localStorage.clear();
    type Line = { id: string; label: string; item_id: number };
    const lines = defineResource<Line>()({
      name: "lines",
      key: "id",
      labelField: "label",
      fields: [
        { name: "id", type: "string", hasDefault: true },
        { name: "label", type: "string" },
        { name: "item_id", type: "number", references: { resource: "items", field: "id" } },
      ],
    });
    const LINES = Array.from({ length: 5 }, (_, i) => ({ id: `l${i}`, label: `Line ${i}`, item_id: i + 1 }));
    const asked: unknown[][] = [];
    const getList = vi.fn(async (resource: string, params: ListParams) => {
      if (resource === "lines") return { data: LINES, total: LINES.length };
      const ids = (params.filters![0] as { value: unknown[] }).value;
      asked.push(ids);
      // Strict, as the mock provider's `in` is: "1" never matches 1.
      return { data: ids.filter((id) => typeof id === "number").map((id) => ({ id, name: `Item ${String(id)}` })), total: -1 };
    });
    const p: DataProvider = {
      getList: getList as unknown as DataProvider["getList"],
      getOne: vi.fn(),
      getMany: vi.fn(async () => ({ data: [] })),
      create: vi.fn(),
      update: vi.fn(),
      deleteOne: vi.fn(),
      capabilities: async () => ({ maxPerPage: 2 }) as never,
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = defineView(lines, { columns: { default: ["label", "item_id"] } });
    render(
      <GenesisProvider provider={p} queryClient={queryClient}>
        <ResourceView view={view} mode="table" detail="none" />
      </GenesisProvider>,
    );
    const last = await cellsOf("Line 4");
    await waitFor(() => expect(within(last).getByText("Item 5")).toBeTruthy());
    expect(asked.map((ids) => ids.length)).toEqual([2, 2, 1]);
    // Sent as numbers, as the cells hold them.
    expect(asked.flat().every((id) => typeof id === "number")).toBe(true);
    for (const call of getList.mock.calls.filter(([r]) => r === "items")) expect(call[1].pagination!.perPage).toBe(2);
  });
});
