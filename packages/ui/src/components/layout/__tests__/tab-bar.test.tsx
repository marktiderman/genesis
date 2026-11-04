import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { splitTabBarItems, TabBar, type TabBarItem } from "../tab-bar";

const items = (n: number): TabBarItem[] =>
  Array.from({ length: n }, (_, i) => ({ key: `t${i + 1}`, label: `Tab ${i + 1}`, icon: <svg /> }));

describe("splitTabBarItems", () => {
  it("keeps up to max, and past it shows max - 1 with the rest under More", () => {
    expect(splitTabBarItems([1, 2, 3, 4, 5]).more).toEqual([]);
    expect(splitTabBarItems([1, 2, 3, 4, 5, 6])).toEqual({ shown: [1, 2, 3, 4], more: [5, 6] });
    expect(splitTabBarItems([1, 2, 3, 4], 3)).toEqual({ shown: [1, 2], more: [3, 4] });
  });
});

describe("TabBar", () => {
  it("shows every tab when they fit, and marks the current one", () => {
    const onChange = vi.fn();
    render(<TabBar items={items(4)} value="t2" onChange={onChange} />);
    expect(screen.queryByTestId("tab-bar-more")).toBeNull();
    expect(screen.getByRole("button", { name: "Tab 2" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: "Tab 3" }));
    expect(onChange).toHaveBeenCalledWith("t3");
  });

  it("past five, the fifth slot is More, which opens the rest in a sheet", () => {
    const onChange = vi.fn();
    render(<TabBar items={items(7)} value="t6" onChange={onChange} />);
    expect(screen.queryByRole("button", { name: "Tab 5" })).toBeNull();
    const more = screen.getByTestId("tab-bar-more");
    // The current tab is under More, so More's name says so.
    expect(more.getAttribute("aria-label")).toBeTruthy();
    fireEvent.click(more);
    fireEvent.click(screen.getByRole("button", { name: "Tab 7" }));
    expect(onChange).toHaveBeenCalledWith("t7");
  });

  it("honours max and shows a badge", () => {
    render(<TabBar items={[...items(2), { key: "inbox", label: "Inbox", icon: <svg />, badge: 3 }]} value="t1" onChange={() => {}} max={2} />);
    expect(screen.getByRole("button", { name: "Tab 1" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tab 2" })).toBeNull();
    fireEvent.click(screen.getByTestId("tab-bar-more"));
    expect(screen.getByRole("button", { name: /Inbox/ }).textContent).toContain("3");
  });
});
