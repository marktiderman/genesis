// @feat:native-app-shell
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { errorMessages } from "@marktiderman/genesis-core/errors";
import {
  errorDetails,
  FatalScreen,
  GenesisErrorBoundary,
  PlainFatalScreen,
  installGlobalErrorHandler,
  installRejectionTracker,
  type EnableRejectionTracker,
  type ErrorUtilsLike,
} from "../errors";

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
    expect(screen.getByTestId("genesis-fatal")).toBeTruthy();
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

describe("installGlobalErrorHandler edges", () => {
  it("lets a second fatal error end the app instead of hanging behind a fatal screen", () => {
    const { utils, previous, fire } = fakeErrorUtils();
    const onFatal = vi.fn();
    let fatalUp = false;
    installGlobalErrorHandler({ errorUtils: utils, onFatal: () => ((fatalUp = true), onFatal()), alreadyFatal: () => fatalUp });
    fire(new Error("first"), true);
    fire(new Error("second"), true);
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(previous).toHaveBeenCalledWith(expect.objectContaining({ message: "second" }), true);
  });

  it("uninstalls to a logging handler when there was none before", () => {
    let handler: ((error: unknown, isFatal?: boolean) => void) | undefined;
    const utils: ErrorUtilsLike = { getGlobalHandler: () => undefined, setGlobalHandler: (next) => void (handler = next) };
    const onFatal = vi.fn();
    const uninstall = installGlobalErrorHandler({ errorUtils: utils, onFatal });
    uninstall();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    handler?.(new Error("late"), true);
    expect(onFatal).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("installRejectionTracker", () => {
  it("reports an unhandled rejection to onError, non-fatal, and still warns", () => {
    let options: Parameters<EnableRejectionTracker>[0] | undefined;
    const onError = vi.fn();
    installRejectionTracker({ enable: (o) => void (options = o), onError });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    options?.onUnhandled(7, new Error("fetch failed"));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "fetch failed" }), { fatal: false, handled: false, source: "rejection" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("id: 7"));
    warn.mockRestore();
  });
});

describe("errorDetails", () => {
  it("shows the error's own text only in development", () => {
    vi.stubGlobal("__DEV__", true);
    expect(errorDetails(new Error("person@example.com broke"))).toBe("person@example.com broke");
    vi.unstubAllGlobals();
  });

  it("shows the safe sentence for a known kind, and nothing for a plain bug, in a release build", () => {
    vi.stubGlobal("__DEV__", false);
    expect(errorDetails(new TypeError("Network request failed"))).toBe(errorMessages.offline);
    expect(errorDetails(new Error("person@example.com broke"))).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("keeps the fatal screen's text safe in a release build", () => {
    vi.stubGlobal("__DEV__", false);
    render(<FatalScreen error={new Error("token=abc for person@example.com")} retry={() => {}} />);
    vi.unstubAllGlobals();
    expect(screen.queryByText(/person@example.com/)).toBeNull();
  });
});

describe("GenesisErrorBoundary as a screen boundary", () => {
  it("reports non-fatal with its own source", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Broken(): never {
      throw new Error("x");
    }
    const onError = vi.fn();
    render(
      <GenesisErrorBoundary fallback={() => <span data-testid="fb" />} onError={onError} fatal={false} source="screen">
        <Broken />
      </GenesisErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ fatal: false, source: "screen" }));
  });

  it("still shows the fallback when onError throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Broken(): never {
      throw new Error("x");
    }
    render(
      <GenesisErrorBoundary fallback={() => <span data-testid="fb" />} onError={() => { throw new Error("reporter"); }}>
        <Broken />
      </GenesisErrorBoundary>,
    );
    expect(screen.getByTestId("fb")).toBeTruthy();
  });
});

describe("PlainFatalScreen", () => {
  it("shows the error and retries with React Native primitives only", () => {
    const retry = vi.fn();
    vi.stubGlobal("__DEV__", true);
    render(<PlainFatalScreen error={new Error("no theme")} retry={retry} />);
    vi.unstubAllGlobals();
    expect(screen.getByText("no theme")).toBeTruthy();
    fireEvent.click(screen.getByTestId("genesis-fatal-plain-retry"));
    expect(retry).toHaveBeenCalled();
  });
});
