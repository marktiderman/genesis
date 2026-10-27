// @feat:native-app-shell
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { setErrorReporter } from "@marktiderman/genesis-core/errors";
import type { ComponentType } from "react";
import { ScreenErrorBoundary, createScreenErrorBoundary, type ScreenErrorProps } from "../screen-boundary";

afterEach(() => {
  setErrorReporter(null);
  vi.restoreAllMocks();
});

describe("createScreenErrorBoundary", () => {
  it("reports through genesis-core's reportError by default, non-fatal, as a screen error", () => {
    const reporter = vi.fn();
    setErrorReporter(reporter);
    const Boundary = createScreenErrorBoundary();
    const error = new Error("x");
    render(<Boundary error={error} retry={async () => {}} />);
    expect(reporter).toHaveBeenCalledWith(error, { source: "screen", fatal: false });
  });

  it("applies wrappers innermost first", () => {
    const order: string[] = [];
    const tag = (name: string) => (Inner: ComponentType<ScreenErrorProps>) =>
      function Wrapped(props: ScreenErrorProps) {
        order.push(name);
        return <Inner {...props} />;
      };
    const Boundary = createScreenErrorBoundary({ onError: () => {}, wrap: [tag("inner"), tag("outer")] });
    render(<Boundary error={new Error("x")} retry={async () => {}} />);
    expect(order).toEqual(["outer", "inner"]);
  });

  it("reports a retry that fails instead of throwing it", async () => {
    const reporter = vi.fn();
    setErrorReporter(reporter);
    const Boundary = createScreenErrorBoundary({ onError: () => {} });
    render(<Boundary error={new Error("x")} retry={() => Promise.reject(new Error("still broken"))} />);
    fireEvent.click(screen.getByTestId("genesis-screen-error-retry"));
    await Promise.resolve();
    await Promise.resolve();
    expect(reporter).toHaveBeenCalledWith(expect.objectContaining({ message: "still broken" }), { source: "native:screen-retry" });
  });
});

describe("ScreenErrorBoundary", () => {
  it("catches a subtree's render error, reports it non-fatal and renders it again on retry", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let broken = true;
    function Part() {
      if (broken) throw new Error("part broke");
      return <span data-testid="part">ok</span>;
    }
    const onError = vi.fn();
    render(
      <>
        <span data-testid="sibling" />
        <ScreenErrorBoundary onError={onError}>
          <Part />
        </ScreenErrorBoundary>
      </>,
    );
    expect(screen.getByTestId("genesis-screen-error")).toBeTruthy();
    expect(screen.getByTestId("sibling")).toBeTruthy();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "part broke" }), expect.objectContaining({ fatal: false, source: "screen" }));
    broken = false;
    fireEvent.click(screen.getByTestId("genesis-screen-error-retry"));
    expect(screen.getByTestId("part")).toBeTruthy();
  });
});
