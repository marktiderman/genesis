/**
 * PageLoading DOM contract.
 *
 * role="status" is a live-region behaviour — nothing about it is checkable by
 * the compiler, and dropping it degrades silently (the spinner still renders,
 * the page still looks right, and a screen reader simply never announces that
 * something is loading). Same category as the UserAvatar semantics pinned in
 * this directory.
 *
 * Uses built-in vitest matchers only — this package does not ship
 * @testing-library/jest-dom.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageLoading } from "../page-loading";

describe("PageLoading — announcement", () => {
  it("exposes a status live region", () => {
    render(<PageLoading />);
    expect(screen.getByRole("status")).not.toBeNull();
  });

  it("announces a default 'Loading' when no label is supplied", () => {
    render(<PageLoading />);

    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Loading");

    // Visually hidden, but present for AT — not a visible caption.
    const srOnly = status.querySelector(".sr-only");
    expect(srOnly).not.toBeNull();
    expect(srOnly!.textContent).toBe("Loading");
  });

  it("announces the custom label instead of the default when one is given", () => {
    render(<PageLoading label="Loading dashboard…" />);

    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Loading dashboard…");
    // The generic fallback must not double up with the specific message.
    expect(status.querySelector(".sr-only")).toBeNull();
  });

  it("renders a custom label as visible text", () => {
    render(<PageLoading label="Loading results…" />);
    const paragraph = screen.getByText("Loading results…");
    expect(paragraph.tagName).toBe("P");
    expect(paragraph.className).not.toContain("sr-only");
  });

  it("hides the spinner graphic from AT so only the message is announced", () => {
    const { container } = render(<PageLoading label="Loading dashboard…" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("PageLoading — variants", () => {
  it("defaults to the full-page variant", () => {
    render(<PageLoading testID="pl" />);
    expect(screen.getByTestId("pl").className).toContain("min-h-[50vh]");
  });

  it("applies page sizing and the large spinner", () => {
    const { container } = render(<PageLoading variant="page" testID="pl" />);

    expect(screen.getByTestId("pl").className).toContain("min-h-[50vh]");
    expect(container.querySelector("svg")!.getAttribute("class")).toContain("h-8 w-8");
  });

  it("applies section sizing and the smaller spinner", () => {
    const { container } = render(<PageLoading variant="section" testID="pl" />);

    const root = screen.getByTestId("pl");
    expect(root.className).toContain("min-h-48");
    expect(root.className).toContain("py-12");
    expect(root.className).not.toContain("min-h-[50vh]");
    expect(container.querySelector("svg")!.getAttribute("class")).toContain("h-6 w-6");
  });
});

describe("PageLoading — passthrough", () => {
  it("forwards testID to the root as data-testid", () => {
    render(<PageLoading testID="dashboard-loading" />);
    expect(screen.getByTestId("dashboard-loading")).toBe(screen.getByRole("status"));
  });

  it("carries a stable data-slot for styling hooks", () => {
    render(<PageLoading testID="pl" />);
    expect(screen.getByTestId("pl").getAttribute("data-slot")).toBe("page-loading");
  });

  it("merges a consumer className without dropping variant classes", () => {
    render(<PageLoading testID="pl" className="bg-card" />);

    const cls = screen.getByTestId("pl").className;
    expect(cls).toContain("bg-card");
    expect(cls).toContain("min-h-[50vh]");
  });
});
