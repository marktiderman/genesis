/**
 * GalleryCard contract: one button when clickable, a plain card when not; the
 * badge and action slots land on the cover; title/subtitle in the footer.
 *
 * Uses built-in vitest matchers only — this package does not ship
 * @testing-library/jest-dom.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GalleryCard } from "../gallery-card";
import { Badge } from "../../ui/badge";

describe("GalleryCard", () => {
  it("renders a non-interactive card by default", () => {
    render(<GalleryCard src="/cover.jpg" alt="Cover" title="Yoga basics" subtitle="12 lessons" />);
    expect(screen.queryByRole("button")).toBeNull();
    const card = document.querySelector('[data-slot="gallery-card"]')!;
    expect(card.tagName).toBe("DIV");
    expect(screen.getByRole("img", { name: "Cover" })).toBeTruthy();
    expect(card.textContent).toContain("Yoga basics");
    expect(card.textContent).toContain("12 lessons");
  });

  it("becomes a single button named by the title when onClick is set", () => {
    const onClick = vi.fn();
    render(<GalleryCard src="/cover.jpg" title="Yoga basics" onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Yoga basics" });
    expect(button.getAttribute("data-slot")).toBe("gallery-card");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("falls back to alt for the button name when there is no title", () => {
    render(<GalleryCard src="/cover.jpg" alt="Morning flow" onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Morning flow" })).toBeTruthy();
  });

  it("places badges top-left and actions top-right over the cover", () => {
    render(
      <GalleryCard
        src="/cover.jpg"
        title="Yoga"
        badges={
          <>
            <Badge>New</Badge>
            <Badge variant="secondary">Beginner</Badge>
          </>
        }
        actions={<button type="button">More</button>}
      />,
    );
    const badges = document.querySelector('[data-slot="gallery-card-badges"]')!;
    const actions = document.querySelector('[data-slot="gallery-card-actions"]')!;
    expect(badges.textContent).toBe("NewBeginner");
    expect(badges.className).toContain("left-2");
    expect(badges.className).toContain("gap-1.5");
    expect(actions.className).toContain("right-2");
    expect(screen.getByRole("button", { name: "More" })).toBeTruthy();
  });

  it("renders actions outside the card button when onClick is set", () => {
    render(
      <GalleryCard
        src="/cover.jpg"
        title="Yoga"
        badges={<Badge>New</Badge>}
        actions={<button type="button">More</button>}
        onClick={() => {}}
      />,
    );
    const card = document.querySelector('button[data-slot="gallery-card"]')!;
    const actions = document.querySelector('[data-slot="gallery-card-actions"]')!;
    expect(card.contains(actions)).toBe(false);
    expect(card.querySelector('[data-slot="gallery-card-badges"]')).not.toBeNull();
    expect(card.querySelector("button")).toBeNull();
    expect(actions.parentElement!.className).toContain("relative");
  });

  it("omits the footer when there is neither title nor subtitle", () => {
    render(<GalleryCard src="/cover.jpg" />);
    expect(document.querySelector('[data-slot="gallery-card-footer"]')).toBeNull();
  });
});

describe("GalleryCard — placeholder and loading", () => {
  it("renders a muted skeleton cover without src", () => {
    render(<GalleryCard title="Pending upload" />);
    expect(document.querySelector("img")).toBeNull();
    const placeholder = document.querySelector('[data-slot="gallery-card-placeholder"]')!;
    expect(placeholder).not.toBeNull();
    expect(placeholder.className).toContain("animate-pulse");
    expect(screen.getByText("Pending upload")).toBeTruthy();
  });

  it("swaps the image for a skeleton while loading and marks the card busy", () => {
    render(<GalleryCard src="/cover.jpg" title="Yoga" loading />);
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector('[data-slot="gallery-card-placeholder"]')).not.toBeNull();
    const card = document.querySelector('[data-slot="gallery-card"]')!;
    expect(card.getAttribute("aria-busy")).toBe("true");
    expect(card.textContent).toContain("Yoga");
  });

  it("shows text skeletons in the footer when loading with no title yet", () => {
    render(<GalleryCard loading />);
    const footer = document.querySelector('[data-slot="gallery-card-footer"]')!;
    expect(footer).not.toBeNull();
    expect(footer.querySelectorAll(".animate-pulse").length).toBe(2);
  });

  it("still works as a button while loading", () => {
    const onClick = vi.fn();
    render(<GalleryCard title="Yoga" loading onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Yoga" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("names the button by its title and describes it with the subtitle and badges, so all are read", () => {
    render(<GalleryCard src="/c.jpg" alt="Cover" title="Morning class" subtitle="Studio 2" badges={<span>Live</span>} onClick={() => {}} />);
    const button = screen.getByRole("button", { name: "Morning class" });
    expect(button.getAttribute("aria-label")).toBeNull();
    const described = (button.getAttribute("aria-describedby") ?? "").split(" ").map((id) => document.getElementById(id)?.textContent);
    expect(described).toEqual(["Studio 2", "Live"]);
  });

  it("falls back to the image's alt for a card with no title", () => {
    render(<GalleryCard src="/c.jpg" alt="Cover" onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Cover" })).toBeTruthy();
  });
});
