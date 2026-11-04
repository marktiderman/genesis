import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Text } from "react-native";
import { NativeTabBar, type NativeTabBarItem } from "../tab-bar";

const items = (n: number): NativeTabBarItem[] =>
  Array.from({ length: n }, (_, i) => ({ key: `t${i + 1}`, label: `Tab ${i + 1}`, icon: <Text>*</Text> }));

function Bar({ n, max }: { n: number; max?: number }) {
  const [value, setValue] = useState("t1");
  return (
    <>
      <Text testID="current">{value}</Text>
      <NativeTabBar items={items(n)} value={value} onChange={setValue} {...(max ? { max } : {})} />
    </>
  );
}

describe("NativeTabBar", () => {
  it("shows up to five tabs and switches between them", () => {
    render(<Bar n={5} />);
    expect(screen.queryByTestId("native-tab-bar-more")).toBeNull();
    fireEvent.click(screen.getByTestId("native-tab-bar-t3"));
    expect(screen.getByTestId("current").textContent).toBe("t3");
    expect(screen.getByTestId("native-tab-bar-t3").getAttribute("aria-selected")).toBe("true");
  });

  it("past five, the fifth slot is More and its sheet holds the rest", async () => {
    render(<Bar n={7} />);
    expect(screen.queryByTestId("native-tab-bar-t5")).toBeNull();
    fireEvent.click(screen.getByTestId("native-tab-bar-more"));
    fireEvent.click(await screen.findByTestId("native-tab-bar-t7"));
    expect(screen.getByTestId("current").textContent).toBe("t7");
  });

  it("honours max", () => {
    render(<Bar n={4} max={3} />);
    expect(screen.getByTestId("native-tab-bar-t2")).toBeTruthy();
    expect(screen.queryByTestId("native-tab-bar-t3")).toBeNull();
    expect(screen.getByTestId("native-tab-bar-more")).toBeTruthy();
  });
});
