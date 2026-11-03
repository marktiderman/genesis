/** NativeLiveIndicator: a polite text live region with a red dot when live, grey when not. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NativeLiveIndicator } from "../live-indicator";

describe("NativeLiveIndicator", () => {
  it("is a pill reading 'Live' with a destructive dot by default", () => {
    render(<NativeLiveIndicator testID="li" />);
    const root = screen.getByTestId("li");
    expect(root.getAttribute("role")).toBe("text");
    expect(root.getAttribute("aria-label")).toBe("Live");
    expect(screen.getByTestId("li-label").textContent).toBe("Live");
    expect(screen.getByTestId("li-dot").className).toContain("bg-destructive");
  });

  it("goes muted and says so when not live", () => {
    render(<NativeLiveIndicator live={false} label="On air" testID="li" />);
    expect(screen.getByTestId("li").getAttribute("aria-label")).toBe("Not on air");
    expect(screen.getByTestId("li-dot").className).toContain("bg-muted-foreground");
    expect(screen.getByTestId("li-label").textContent).toBe("On air");
  });

  it("dot variant keeps the label for screen readers only", () => {
    render(<NativeLiveIndicator variant="dot" testID="li" />);
    expect(screen.getByTestId("li").getAttribute("aria-label")).toBe("Live");
    expect(screen.queryByTestId("li-label")).toBeNull();
    expect(screen.getByTestId("li-dot")).toBeTruthy();
  });
});

describe("NativeLiveIndicator additions", () => {
  it("state overrides live, offline is a faint dot", () => {
    render(<NativeLiveIndicator live state="offline" testID="li" />);
    expect(screen.getByTestId("li-dot").className).toContain("bg-muted-foreground/50");
    expect(screen.getByTestId("li").getAttribute("aria-label")).toBe("Offline, not live");
  });

  it("state idle matches live={false}", () => {
    render(<NativeLiveIndicator state="idle" testID="li" />);
    expect(screen.getByTestId("li-dot").className).toContain("bg-muted-foreground");
    expect(screen.getByTestId("li-dot").className).not.toContain("/50");
    expect(screen.getByTestId("li").getAttribute("aria-label")).toBe("Not live");
  });

  it("shows detail after the label and announces it", () => {
    render(<NativeLiveIndicator detail="12 watching" testID="li" />);
    expect(screen.getByTestId("li-detail").textContent).toBe("12 watching");
    expect(screen.getByTestId("li-detail").className).toContain("text-muted-foreground");
    expect(screen.getByTestId("li").getAttribute("aria-label")).toBe("Live, 12 watching");
  });
});
