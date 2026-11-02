// @feat:native-layouts
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

  it("has no pull to refresh unless onRefresh is passed", () => {
    render(
      <ScreenContainer testID="screen" scroll>
        <span>Hello</span>
      </ScreenContainer>,
    );
    expect(screen.queryByTestId("screen-refresh")).toBeNull();
  });

  it("pulls to refresh with onRefresh, and shows the spinner while refreshing", () => {
    const onRefresh = vi.fn();
    const { rerender } = render(
      <ScreenContainer testID="screen" scroll onRefresh={onRefresh}>
        <span>Hello</span>
      </ScreenContainer>,
    );
    const control = screen.getByTestId("screen-refresh");
    expect(control.dataset.refreshing).toBe("false");
    fireEvent.click(control);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    rerender(
      <ScreenContainer testID="screen" scroll onRefresh={onRefresh} refreshing>
        <span>Hello</span>
      </ScreenContainer>,
    );
    expect(screen.getByTestId("screen-refresh").dataset.refreshing).toBe("true");
  });

  it("makes the body scroll for onRefresh, since pulling needs a scroll view", () => {
    render(
      <ScreenContainer testID="screen" onRefresh={() => {}}>
        <span>Hello</span>
      </ScreenContainer>,
    );
    expect(screen.getByTestId("screen-scroll")).toBeTruthy();
    expect(screen.queryByTestId("screen-body")).toBeNull();
    expect(screen.getByTestId("screen-refresh")).toBeTruthy();
  });

  it("shows the loading state over a refreshable body", () => {
    render(
      <ScreenContainer testID="screen" onRefresh={() => {}} loading>
        <span>Hello</span>
      </ScreenContainer>,
    );
    expect(screen.getByTestId("screen-loading")).toBeTruthy();
    expect(screen.queryByTestId("screen-refresh")).toBeNull();
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

describe("ScreenContainer loading", () => {
  it("replaces the body with a centred loading state inside the same safe area", () => {
    render(
      <ScreenContainer testID="screen" loading loadingLabel="Opening your space" scroll>
        <span data-testid="child">Hello</span>
      </ScreenContainer>,
    );
    expect(screen.queryByTestId("child")).toBeNull();
    expect(screen.queryByTestId("screen-scroll")).toBeNull();
    expect(screen.getByTestId("screen-body")).toBeTruthy();
    const loading = screen.getByTestId("screen-loading");
    expect(loading.getAttribute("role")).toBe("progressbar");
    expect(loading.getAttribute("aria-label")).toBe("Opening your space");
    expect(screen.getByTestId("screen").getAttribute("data-edges")).toBe("left,right");
  });

  it("renders the children once loading ends", () => {
    render(
      <ScreenContainer testID="screen" loading={false}>
        <span data-testid="child">Hello</span>
      </ScreenContainer>,
    );
    expect(screen.getByTestId("child")).toBeTruthy();
    expect(screen.queryByTestId("screen-loading")).toBeNull();
  });
});
