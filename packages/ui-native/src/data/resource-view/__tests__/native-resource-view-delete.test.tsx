// @feat:native-components
/**
 * NativeResourceView's delete, end to end with genesis-core's real hooks: a real QueryClient, an
 * in-memory provider, nothing of core mocked.
 *
 * On the phone `window` is React Native's global object, and Hermes gives it no
 * `addEventListener`. The test DOM (happy-dom) does, which once hid a delete that threw
 * "undefined is not a function" inside core's optimistic write before the provider was asked.
 * Each test here takes the listener methods away before it renders, as the phone has them.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defineResource,
  GenesisProvider,
  type BaseRecord,
  type DataProvider,
  type Identifier,
} from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { NativeResourceView, type NativeResourceSwipeableProps } from "../index";

type Favorite = { id: string; label: string; created_at: string };

const favorites = defineResource<Favorite>()({
  name: "favorites",
  key: "id",
  labelField: "label",
  fields: [
    { name: "id", type: "string", readOnly: true },
    { name: "label", type: "string" },
    { name: "created_at", type: "datetime", hasDefault: true, readOnly: true },
  ],
});

const favoritesView = defineView(favorites, {
  columns: { default: ["label", "created_at"] },
  form: [],
  orderBy: { field: "created_at", direction: "desc" },
  can: { update: () => "A favourite has nothing to change." },
  summary: (f) => ({ title: f.label }),
});

/** A data provider over an array: what it holds is what the next read returns. */
function memoryProvider(seed: Favorite[]) {
  const rows = seed.map((r) => ({ ...r }));
  const deleted: Identifier[] = [];
  const p: DataProvider = {
    async getList<T extends BaseRecord>() {
      return { data: rows.map((r) => ({ ...r })) as unknown as T[], total: rows.length, nextCursor: null };
    },
    async getOne<T extends BaseRecord>(_resource: string, { id }: { id: Identifier }) {
      return { data: { ...rows.find((r) => r.id === id)! } as unknown as T };
    },
    async getMany<T extends BaseRecord>() {
      return { data: [] as T[] };
    },
    async create<T extends BaseRecord>(_resource: string, { data }: { data: Partial<T> }) {
      const row = { id: `f${rows.length + 1}`, label: "", created_at: "2026-01-01T00:00:00Z", ...(data as object) } as Favorite;
      rows.push(row);
      return { data: row as unknown as T };
    },
    async update<T extends BaseRecord>(_resource: string, { id, data }: { id: Identifier; data: Partial<T> }) {
      const row = rows.find((r) => r.id === id)!;
      Object.assign(row, data);
      return { data: { ...row } as unknown as T };
    },
    async deleteOne(_resource: string, { id }: { id: Identifier }) {
      const at = rows.findIndex((r) => r.id === id);
      if (at >= 0) rows.splice(at, 1);
      deleted.push(id);
      return { data: { id } };
    },
  };
  return { p, rows, deleted };
}

const SEED: Favorite[] = [
  { id: "f1", label: "What made you laugh this week?", created_at: "2026-01-03T10:00:00Z" },
  { id: "f2", label: "Where would you go tomorrow?", created_at: "2026-01-02T10:00:00Z" },
];

function wrap(p: DataProvider) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={p} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
}

/** A swipe slot that draws its actions as buttons, as a consumer app's gesture wrapper does. */
function TestSwipe({ actions, testID, children }: NativeResourceSwipeableProps) {
  return (
    <View testID={testID}>
      {children}
      {actions.map((action) => (
        <Pressable key={action.id} testID={`${testID}-${action.id}`} onPress={() => action.onPress()}>
          <Text>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const alert = Alert.alert as unknown as ReturnType<typeof vi.fn>;

/** Press a button of the last Alert.alert. */
function pressAlert(text: string) {
  const buttons = alert.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
  act(() => buttons.find((b) => b.text === text)?.onPress?.());
}

const listenerMethods = ["addEventListener", "removeEventListener"] as const;
// The test DOM's own methods, put back after each test.
const ownMethods = listenerMethods.map((name) => [name, Object.getOwnPropertyDescriptor(window, name)] as const);
function restoreListenerMethods() {
  for (const [name, descriptor] of ownMethods) {
    if (descriptor) Object.defineProperty(window, name, descriptor);
    else delete (window as unknown as Record<string, unknown>)[name];
  }
}
/** The phone's `window`: there, but with no listener methods. */
function asOnThePhone() {
  for (const name of listenerMethods) {
    Object.defineProperty(window, name, { configurable: true, writable: true, value: undefined });
  }
}

beforeEach(() => {
  alert.mockClear();
  asOnThePhone();
});
afterEach(() => {
  restoreListenerMethods();
});

describe("NativeResourceView delete on the phone (real core hooks)", () => {
  it("a swipe Delete reaches deleteOne and the row leaves", async () => {
    const { p, deleted } = memoryProvider(SEED);
    render(<NativeResourceView view={favoritesView} swipeable={TestSwipe} />, { wrapper: wrap(p) });
    const press = await screen.findByTestId("native-resource-view-row-f2-swipe-delete");
    fireEvent.click(press);
    expect(alert.mock.calls.at(-1)?.[0]).toBe("Delete “Where would you go tomorrow?”?");
    pressAlert("Delete");

    await waitFor(() => expect(deleted).toEqual(["f2"]));
    await waitFor(() => expect(screen.queryByTestId("native-resource-view-row-f2")).toBeNull());
    expect(screen.getByTestId("native-resource-view-row-f1")).toBeTruthy();
    // A failed write would show here: the view reports it inline.
    expect(screen.queryByTestId("native-resource-view-refusal")).toBeNull();
  });

  it("the row sheet's Delete reaches deleteOne and the row leaves", async () => {
    const { p, deleted } = memoryProvider(SEED);
    render(<NativeResourceView view={favoritesView} />, { wrapper: wrap(p) });
    fireEvent.click(await screen.findByTestId("native-resource-view-row-f1"));
    const button = await screen.findByTestId("native-resource-view-peek-delete");
    fireEvent.click(button);
    pressAlert("Delete");

    await waitFor(() => expect(deleted).toEqual(["f1"]));
    await waitFor(() => expect(screen.queryByTestId("native-resource-view-row-f1")).toBeNull());
    expect(screen.getByTestId("native-resource-view-row-f2")).toBeTruthy();
    // A failed write would show here: the view reports it inline.
    expect(screen.queryByTestId("native-resource-view-refusal")).toBeNull();
  });
});
