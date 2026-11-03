/**
 * LiveIndicator contract: a polite status region whose dot pulses red while
 * live and goes still and muted when not; the dot variant keeps the label for
 * screen readers.
 *
 * Uses built-in vitest matchers only — this package does not ship
 * @testing-library/jest-dom.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LiveIndicator } from "../live-indicator";

const dot = () => document.querySelector('[data-slot="live-indicator-dot"]')!;

describe("LiveIndicator", () => {
  it("is a polite status region reading 'Live' by default", () => {
    render(<LiveIndicator />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("Live");
    expect(status.getAttribute("data-live")).toBe("true");
  });

  it("pulses with the destructive colour while live", () => {
    render(<LiveIndicator />);
    expect(dot().className).toContain("animate-pulse");
    expect(dot().className).toContain("bg-destructive");
    expect(dot().getAttribute("aria-hidden")).toBe("true");
  });

  it("stops pulsing and goes muted when not live", () => {
    render(<LiveIndicator live={false} label="Offline" />);
    expect(screen.getByRole("status").textContent).toBe("Offline");
    expect(dot().className).not.toContain("animate-pulse");
    expect(dot().className).toContain("bg-muted-foreground");
  });

  it("defaults the label to the resolved state, and keeps an explicit one", () => {
    const { rerender } = render(<LiveIndicator state="idle" />);
    expect(screen.getByRole("status").textContent).toBe("Idle");
    rerender(<LiveIndicator state="offline" />);
    expect(screen.getByRole("status").textContent).toBe("Offline");
    rerender(<LiveIndicator variant="dot" state="offline" />);
    expect(screen.getByRole("status").textContent).toBe("Offline");
    rerender(<LiveIndicator state="idle" label="Paused" />);
    expect(screen.getByRole("status").textContent).toBe("Paused");
  });

  it("keeps the label for screen readers in the dot variant", () => {
    render(<LiveIndicator variant="dot" label="Streaming" />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Streaming");
    expect(status.querySelector(".sr-only")!.textContent).toBe("Streaming");
    expect(status.className).not.toContain("rounded-full");
  });
});

describe("LiveIndicator — state and detail", () => {
  it("maps live=true to 'live' and live=false to 'idle'", () => {
    const { rerender } = render(<LiveIndicator />);
    expect(screen.getByRole("status").getAttribute("data-state")).toBe("live");
    rerender(<LiveIndicator live={false} />);
    expect(screen.getByRole("status").getAttribute("data-state")).toBe("idle");
    expect(dot().className).toContain("bg-muted-foreground");
    expect(dot().className).not.toContain("/50");
  });

  it("lets state win over live, and renders offline as a fainter still dot", () => {
    render(<LiveIndicator live state="offline" label="Offline" />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("data-state")).toBe("offline");
    expect(status.getAttribute("data-live")).toBe("false");
    expect(dot().className).toContain("bg-muted-foreground/50");
    expect(dot().className).not.toContain("animate-pulse");
    expect(status.className).not.toContain("line-through");
  });

  it("shows detail after the label, muted", () => {
    render(<LiveIndicator label="Live" detail="last photo 2m ago" />);
    const detail = document.querySelector('[data-slot="live-indicator-detail"]')!;
    expect(detail.textContent).toBe("last photo 2m ago");
    expect(detail.className).toContain("text-muted-foreground");
    expect(screen.getByRole("status").textContent).toBe("Livelast photo 2m ago");
  });

  it("reads the detail to screen readers in the dot variant", () => {
    render(<LiveIndicator variant="dot" label="Live" detail="3 viewers" />);
    expect(screen.getByRole("status").querySelector(".sr-only")!.textContent).toBe("Live 3 viewers");
  });
});
