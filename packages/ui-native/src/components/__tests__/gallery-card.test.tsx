/** NativeGalleryCard: cover at a ratio, overlays, footer, button with onPress. */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NativeGalleryCard } from "../gallery-card";

describe("NativeGalleryCard", () => {
  it("draws the cover at the ratio with title, subtitle, badges and actions", () => {
    render(
      <NativeGalleryCard
        src="https://example.test/cover.jpg"
        alt="A cover"
        title="Morning session"
        subtitle="12 photos"
        ratio={16 / 9}
        badges={<span data-testid="badge">New</span>}
        actions={<span data-testid="action">…</span>}
        testID="c"
      />,
    );
    expect(screen.getByTestId("c").getAttribute("role")).toBeNull();
    expect(JSON.parse((screen.getByTestId("c-cover") as HTMLElement).dataset.style!).aspectRatio).toBeCloseTo(16 / 9, 5);
    expect(screen.getByTestId("c-title").textContent).toBe("Morning session");
    expect(screen.getByTestId("c-subtitle").textContent).toBe("12 photos");
    expect(screen.getByTestId("c-badges").contains(screen.getByTestId("badge"))).toBe(true);
    expect(screen.getByTestId("c-actions").contains(screen.getByTestId("action"))).toBe(true);
    expect(screen.getByLabelText("A cover")).toBeTruthy();
  });

  it("defaults to 4:3 and no footer", () => {
    render(<NativeGalleryCard src="https://example.test/cover.jpg" testID="c" />);
    expect(JSON.parse((screen.getByTestId("c-cover") as HTMLElement).dataset.style!).aspectRatio).toBeCloseTo(4 / 3, 5);
    expect(screen.queryByTestId("c-footer")).toBeNull();
  });

  it("is a button with onPress", () => {
    const onPress = vi.fn();
    render(<NativeGalleryCard src="https://example.test/cover.jpg" title="Tap" onPress={onPress} testID="c" />);
    const card = screen.getByTestId("c");
    expect(card.getAttribute("role")).toBe("button");
    expect(card.getAttribute("aria-label")).toBe("Tap");
    fireEvent.click(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("NativeGalleryCard additions", () => {
  it("draws a skeleton cover without src", () => {
    render(<NativeGalleryCard title="Pending" testID="c" />);
    expect(screen.getByTestId("c-skeleton")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("draws a skeleton cover while loading, and is busy", () => {
    render(<NativeGalleryCard src="https://example.test/cover.jpg" alt="A cover" loading testID="c" />);
    expect(screen.getByTestId("c-skeleton")).toBeTruthy();
    expect(screen.queryByLabelText("A cover")).toBeNull();
    expect(screen.getByTestId("c").getAttribute("aria-busy")).toBe("true");
  });
});
