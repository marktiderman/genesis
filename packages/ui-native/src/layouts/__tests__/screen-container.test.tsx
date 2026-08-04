import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ScreenContainer,
  composeHeaderOptions,
} from "../screen-container";

describe("ScreenContainer", () => {
  it("renders children with default safe-area edges", () => {
    render(
      <ScreenContainer testID="screen">
        <span data-testid="child">Hello</span>
      </ScreenContainer>,
    );
    expect(screen.getByTestId("screen")).toBeTruthy();
    expect(screen.getByTestId("child")).toBeTruthy();
  });

  it("wraps body in a scroll container when scroll=true", () => {
    render(
      <ScreenContainer testID="screen" scroll>
        <span>Hello</span>
      </ScreenContainer>,
    );
    expect(screen.getByTestId("screen-scroll")).toBeTruthy();
  });

  it("uses static body container when scroll=false", () => {
    render(
      <ScreenContainer testID="screen">
        <span>Hello</span>
      </ScreenContainer>,
    );
    expect(screen.queryByTestId("screen-scroll")).toBeNull();
    expect(screen.getByTestId("screen-body")).toBeTruthy();
  });
});

describe("composeHeaderOptions", () => {
  it("returns empty object for no props", () => {
    expect(composeHeaderOptions({})).toEqual({});
  });

  it("maps headerTitle → title", () => {
    expect(composeHeaderOptions({ headerTitle: "Settings" })).toEqual({
      title: "Settings",
    });
  });

  it("sets headerLargeTitle when large=true", () => {
    const opts = composeHeaderOptions({ large: true });
    expect(opts.headerLargeTitle).toBe(true);
  });

  it("sets headerTransparent when scrollEdgeBehavior=transparent + large", () => {
    const opts = composeHeaderOptions({
      large: true,
      scrollEdgeBehavior: "transparent",
    });
    expect(opts.headerTransparent).toBe(true);
  });

  it("direct headerOptions wins over named props", () => {
    const opts = composeHeaderOptions({
      headerTitle: "Original",
      headerOptions: { title: "Override", custom: 42 },
    });
    expect(opts.title).toBe("Override");
    expect(opts.custom).toBe(42);
  });

  it("forwards headerLeft / headerRight callables", () => {
    const left = () => null;
    const right = () => null;
    const opts = composeHeaderOptions({ headerLeft: left, headerRight: right });
    expect(opts.headerLeft).toBe(left);
    expect(opts.headerRight).toBe(right);
  });
});
