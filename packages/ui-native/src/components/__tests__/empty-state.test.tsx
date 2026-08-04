import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NativeEmptyState } from "../empty-state";

describe("NativeEmptyState (E6 web parity)", () => {
  it("renders illustration + title + body + primary action with testID hooks", () => {
    render(
      <NativeEmptyState
        testID="es"
        variant="first-run"
        illustration={<span data-testid="art">art</span>}
        title="Welcome"
        body="Save things here."
        primaryAction={
          <button data-testid="cta" type="button">
            Add entry
          </button>
        }
      />
    );
    expect(screen.getByTestId("es")).toBeTruthy();
    expect(screen.getByTestId("es-title").textContent).toBe("Welcome");
    expect(screen.getByTestId("es-body").textContent).toBe("Save things here.");
    expect(screen.getByTestId("es-primary-action")).toBeTruthy();
    expect(screen.getByTestId("art")).toBeTruthy();
    expect(screen.getByTestId("cta")).toBeTruthy();
  });

  it("supports both primary + secondary actions stacked", () => {
    render(
      <NativeEmptyState
        testID="es2"
        variant="no-results"
        title="Nothing"
        primaryAction={<button type="button">Retry</button>}
        secondaryAction={<button type="button">Clear</button>}
      />
    );
    expect(screen.getByTestId("es2-primary-action")).toBeTruthy();
    expect(screen.getByTestId("es2-secondary-action")).toBeTruthy();
  });

  it("falls back to description for back-compat with C3 API", () => {
    render(
      <NativeEmptyState
        testID="es3"
        variant="error"
        description="Legacy body"
      />
    );
    expect(screen.getByTestId("es3-body").textContent).toBe("Legacy body");
  });

  it("renders details only in dev environments", () => {
    render(
      <NativeEmptyState
        testID="es4"
        variant="error"
        title="Boom"
        details="stack trace x"
      />
    );
    // NODE_ENV under vitest is "test", which we treat as non-production.
    expect(screen.getByTestId("es4-details").textContent).toBe("stack trace x");
  });
});
