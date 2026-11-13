// @feat:view-filters @feat:native-components
/**
 * ADR 0017 on the phone: segments with counts and declared filters sent to the server, the
 * view-type switcher, the view's own actions with their reasons, a board whose cards move through
 * the resource's update, a calendar's agenda and month, and the inbox's markRead. Each reads the
 * same core state and hooks the web's ResourceView does.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryStorageAdapter, defineResource, GenesisProvider, type DataProvider, type FilterParam, type ListParams } from "@marktiderman/genesis-core";
import { dayIn } from "@marktiderman/genesis-core/dates";
import { createLocalSavedViewStore, defineView } from "@marktiderman/genesis-core/resource-view";
import { NativeResourceView, type NativeResourceSwipeableProps } from "..";

type Task = { id: string; title: string; status: "todo" | "done"; due_on: string | null; unread: boolean };

const tasks = defineResource<Task>()({
  name: "tasks",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
    { name: "status", type: "string", enumValues: ["todo", "done"] },
    { name: "due_on", type: "datetime", dbType: "date", optional: true },
    { name: "unread", type: "boolean" },
  ],
});

const today = dayIn("UTC");
const ROWS: Task[] = [
  { id: "a", title: "Write the plan", status: "todo", due_on: today, unread: true },
  { id: "b", title: "Ship it", status: "done", due_on: today, unread: false },
  { id: "c", title: "Tell people", status: "todo", due_on: null, unread: false },
];

const matches = (row: Task, f: FilterParam) => {
  const v = row[f.field as keyof Task] as unknown;
  if (f.operator === "eq") return v === f.value;
  if (f.operator === "in") return (f.value as unknown[]).includes(v);
  if (f.operator === "is_null") return v === null;
  if (f.operator === "gte") return v !== null && String(v) >= String(f.value);
  if (f.operator === "lt") return v !== null && String(v) < String(f.value);
  return true;
};

function provider(extra: Partial<DataProvider> = {}) {
  return {
    getList: vi.fn(async (_r: string, params: ListParams) => {
      const data = ROWS.filter((row) => (params.filters ?? []).every((f) => matches(row, f)));
      return { data, total: data.length };
    }),
    getOne: vi.fn(async (_r: string, { id }: { id: string }) => ({ data: ROWS.find((r) => r.id === id) })),
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(),
    update: vi.fn(async (_r: string, { id, data }: { id: string; data: Partial<Task> }) => ({ data: { ...ROWS.find((r) => r.id === id)!, ...data } })),
    deleteOne: vi.fn(),
    ...extra,
  } as unknown as DataProvider & { getList: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
}

function wrap(p: DataProvider) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={p} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
}

function TestSwipe({ actions, testID, children }: NativeResourceSwipeableProps) {
  return (
    <View testID={testID}>
      {children}
      {actions.map((action) => (
        <Pressable key={action.id} testID={`${testID}-${action.id}`} onPress={() => action.onPress()}>
          <Text>{action.reason ? `${action.label}: ${action.reason}` : action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const alert = Alert.alert as unknown as ReturnType<typeof vi.fn>;
function pressAlert(text: string) {
  const buttons = alert.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
  act(() => buttons.find((b) => b.text === text)?.onPress?.());
}
const lastFilters = (p: { getList: ReturnType<typeof vi.fn> }) => (p.getList.mock.calls.at(-1)![1] as ListParams).filters ?? [];

afterEach(() => alert.mockClear());

describe("segments and declared filters on the phone", () => {
  const view = defineView(tasks, {
    segments: [
      { id: "open", label: "Open", where: { status: "todo" }, count: true },
      { id: "all", label: "All" },
    ],
    filters: [{ field: "status" }],
  });

  it("opens on the first segment with its count, and switches", async () => {
    const p = provider();
    render(<NativeResourceView view={view} />, { wrapper: wrap(p) });
    await screen.findByText("Write the plan");
    expect(screen.queryByText("Ship it")).toBeNull();
    expect(lastFilters(p)).toContainEqual({ field: "status", operator: "eq", value: "todo" });
    await waitFor(() => expect(screen.getByTestId("native-resource-view-segment-open").textContent).toContain("2"));
    fireEvent.click(screen.getByTestId("native-resource-view-segment-all"));
    await screen.findByText("Ship it");
  });

  it("sends a declared filter set in the Filters sheet", async () => {
    const p = provider();
    render(<NativeResourceView view={view} defaultSegment="all" />, { wrapper: wrap(p) });
    await screen.findByText("Ship it");
    fireEvent.click(screen.getByTestId("native-resource-view-filters"));
    fireEvent.click(await screen.findByTestId("native-resource-view-filters-status-done"));
    await waitFor(() => expect(screen.queryByText("Write the plan")).toBeNull());
    expect(lastFilters(p)).toContainEqual({ field: "status", operator: "eq", value: "done" });
  });
});

describe("the view's actions on the phone", () => {
  const view = defineView(tasks, {
    actions: [{ name: "finish", label: "Finish", can: (t) => (t.status === "done" ? "It's already done." : true) }],
  });

  it("puts the view's actions on each row with their reasons, and runs an allowed one", async () => {
    const runAction = vi.fn(async () => ({ data: null }));
    render(<NativeResourceView view={view} swipeable={TestSwipe} />, { wrapper: wrap(provider({ runAction })) });
    await screen.findByText("Ship it");
    expect(screen.getByTestId("native-resource-view-row-b-swipe-finish").textContent).toContain("It's already done.");
    fireEvent.click(screen.getByTestId("native-resource-view-row-b-swipe-finish"));
    expect(runAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("native-resource-view-row-a-swipe-finish"));
    await waitFor(() => expect(runAction).toHaveBeenCalledWith("tasks", { id: "a", action: "finish" }));
  });
});

describe("the switcher, the board and the calendar on the phone", () => {
  const view = defineView(tasks, {
    types: ["list", "board", "calendar"],
    board: { field: "status" },
    calendar: { field: "due_on" },
  });

  it("switches to the board, keeps the choice in the store, and moves a card through the resource's update", async () => {
    const p = provider();
    const store = createLocalSavedViewStore({ storage: createMemoryStorageAdapter() });
    render(<NativeResourceView view={view} savedViews={store} />, { wrapper: wrap(p) });
    await screen.findByText("Write the plan");
    fireEvent.click(screen.getByText("Board"));
    const todo = await screen.findByTestId("native-resource-view-board-column-todo");
    await within(todo).findByText("Write the plan");
    expect(store.forViewer!(null).readCurrent!("tasks")).toEqual({ type: "board" });
    fireEvent.contextMenu(screen.getByTestId("native-resource-view-board-card-a"));
    pressAlert("Move to Done");
    await waitFor(() => expect(p.update).toHaveBeenCalledWith("tasks", expect.objectContaining({ id: "a", data: { status: "done" } })));
  });

  it("draws the calendar's agenda and month from the view's calendar block", async () => {
    render(<NativeResourceView view={view} type="calendar" />, { wrapper: wrap(provider()) });
    await screen.findByTestId("native-resource-view-calendar-agenda");
    await screen.findByTestId("native-resource-view-calendar-event-a");
    expect(screen.getByTestId("native-resource-view-calendar-event-b")).toBeTruthy();
    fireEvent.click(screen.getByText("Month"));
    await screen.findByTestId("native-resource-view-calendar-month");
    fireEvent.click(screen.getByTestId(`native-resource-view-calendar-day-${today}`));
    await screen.findByTestId("native-resource-view-calendar-event-a");
  });
});

describe("the inbox on the phone", () => {
  it("needs the view's inbox block", () => {
    const plain = defineView(tasks, {});
    expect(() => render(<NativeResourceView view={plain} type="inbox" />, { wrapper: wrap(provider()) })).toThrow(/inbox block/);
  });

  it("runs the view's markRead on opening an unread row", async () => {
    const runAction = vi.fn(async () => ({ data: null }));
    const inbox = defineView(tasks, { inbox: { unread: "unread" }, actions: [{ name: "markRead", label: "Mark read" }] });
    render(<NativeResourceView view={inbox} type="inbox" onRowPress={vi.fn()} />, { wrapper: wrap(provider({ runAction })) });
    fireEvent.click(await screen.findByText("Write the plan"));
    await waitFor(() => expect(runAction).toHaveBeenCalledWith("tasks", { id: "a", action: "markRead" }));
    fireEvent.click(screen.getByText("Ship it"));
    expect(runAction).toHaveBeenCalledTimes(1);
  });
});
