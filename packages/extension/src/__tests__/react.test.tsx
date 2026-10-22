import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as React from "react";
import { installChromeFake, type ChromeFake } from "../testing";
import { createPrefs } from "../prefs";
import {
  ExtensionSettings,
  LazyListFooter,
  ShortcutKeys,
  useLazyList,
  usePrefs,
} from "../react";

let fake: ChromeFake;
beforeEach(() => {
  fake = installChromeFake();
  history.replaceState(null, "", "/options.html");
});
afterEach(() => {
  cleanup();
  fake.uninstall();
});

describe("ExtensionSettings", () => {
  it("renders only the open tab, and opens the tab named in the address", () => {
    history.replaceState(null, "", "/options.html#tab=account");
    const rendered: string[] = [];
    render(
      <ExtensionSettings
        title="Saver"
        tabs={[
          {
            id: "library",
            label: "Library",
            render: () => (rendered.push("library"), (<p>Library page</p>)),
          },
          {
            id: "account",
            label: "Account",
            render: () => (rendered.push("account"), (<p>Account page</p>)),
          },
        ]}
      />,
    );
    expect(screen.getByText("Account page")).toBeTruthy();
    expect(screen.queryByText("Library page")).toBeNull();
    expect(rendered).toEqual(["account"]);
  });
});

describe("usePrefs", () => {
  it("loads settings and follows changes from other pages", async () => {
    const prefs = createPrefs("acme", { mode: "panel" });
    function Show() {
      const [value] = usePrefs(prefs);
      return <p>{value ? value.mode : "loading"}</p>;
    }
    render(<Show />);
    await waitFor(() => expect(screen.getByText("panel")).toBeTruthy());
    await act(() => prefs.set({ mode: "side" }));
    await waitFor(() => expect(screen.getByText("side")).toBeTruthy());
  });
});

describe("useLazyList", () => {
  it("loads a page at a time and stops at a short page", async () => {
    const calls: number[] = [];
    let list!: ReturnType<typeof useLazyList<number>>;
    function List() {
      list = useLazyList<number>(
        async (offset, limit) => {
          calls.push(offset);
          return Array.from(
            { length: offset === 0 ? limit : 1 },
            (_, i) => offset + i,
          );
        },
        { pageSize: 3 },
      );
      return (
        <>
          <p>{list.items.join(",")}</p>
          <LazyListFooter list={list} empty={<p>None</p>} />
        </>
      );
    }
    render(<List />);
    await waitFor(() => expect(screen.getByText("0,1,2")).toBeTruthy());
    act(() => list.loadMore());
    await waitFor(() => expect(screen.getByText("0,1,2,3")).toBeTruthy());
    expect(list.done).toBe(true);
    expect(calls).toEqual([0, 3]);
  });
});

describe("ShortcutKeys", () => {
  it("shows Chrome's current shortcut for a command", async () => {
    render(<ShortcutKeys command="_execute_action" />);
    await waitFor(() =>
      expect(screen.getByTestId("shortcut-keys").textContent).toMatch(/S$/),
    );
  });
});
