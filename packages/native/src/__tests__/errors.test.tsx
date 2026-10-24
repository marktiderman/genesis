// @feat:native-app-shell
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { FatalScreen, GenesisErrorBoundary, installGlobalErrorHandler, type ErrorUtilsLike } from "../errors";

function fakeErrorUtils(previous = vi.fn()) {
  let handler: ((error: unknown, isFatal?: boolean) => void) | undefined = previous;
  const utils: ErrorUtilsLike = {
    getGlobalHandler: () => handler,
    setGlobalHandler: (next) => {
      handler = next;
    },
  };
  return { utils, previous, fire: (error: unknown, isFatal?: boolean) => handler?.(error, isFatal), current: () => handler };
}

describe("GenesisErrorBoundary", () => {
  it("shows the fallback with the error, reports it, and retry remounts", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let shouldThrow = true;
    function Screen() {
      if (shouldThrow) throw new Error("render broke");
      return <span data-testid="screen">ok</span>;
    }
    const onError = vi.fn();
    render(
      <GenesisErrorBoundary fallback={FatalScreen} onError={onError}>
        <Screen />
      </GenesisErrorBoundary>,
    );
    expect(screen.getByText("render broke")).toBeTruthy();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "render broke" }), expect.objectContaining({ fatal: true, source: "boundary" }));

    shouldThrow = false;
    fireEvent.click(screen.getByTestId("genesis-fatal-retry"));
    expect(screen.getByTestId("screen")).toBeTruthy();
  });

  it("clears when resetKey changes", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let shouldThrow = true;
    function Screen() {
      if (shouldThrow) throw new Error("x");
      return <span data-testid="screen">ok</span>;
    }
    function Harness() {
      const [key, setKey] = useState(0);
      return (
        <>
          <button data-testid="reset" onClick={() => setKey(key + 1)} />
          <GenesisErrorBoundary fallback={() => <span data-testid="fallback" />} resetKey={key}>
            <Screen />
          </GenesisErrorBoundary>
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByTestId("fallback")).toBeTruthy();
    shouldThrow = false;
    fireEvent.click(screen.getByTestId("reset"));
    expect(screen.getByTestId("screen")).toBeTruthy();
  });
});

describe("installGlobalErrorHandler", () => {
  it("sends a fatal error to onFatal instead of the default handler", () => {
    const { utils, previous, fire } = fakeErrorUtils();
    const onFatal = vi.fn();
    const onError = vi.fn();
    installGlobalErrorHandler({ errorUtils: utils, onError, onFatal });
    fire(new Error("boom"), true);
    expect(onFatal).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }));
    expect(onError).toHaveBeenCalledWith(expect.any(Error), { fatal: true, source: "global" });
    expect(previous).not.toHaveBeenCalled();
  });

  it("passes a non-fatal error on to the previous handler", () => {
    const { utils, previous, fire } = fakeErrorUtils();
    const onFatal = vi.fn();
    installGlobalErrorHandler({ errorUtils: utils, onFatal });
    fire("a string", false);
    expect(onFatal).not.toHaveBeenCalled();
    expect(previous).toHaveBeenCalledWith("a string", false);
  });

  it("survives a reporter that throws, and uninstalls", () => {
    const { utils, previous, fire, current } = fakeErrorUtils();
    const onFatal = vi.fn();
    const uninstall = installGlobalErrorHandler({
      errorUtils: utils,
      onError: () => {
        throw new Error("reporter down");
      },
      onFatal,
    });
    fire(new Error("boom"), true);
    expect(onFatal).toHaveBeenCalled();
    uninstall();
    expect(current()).toBe(previous);
  });
});
