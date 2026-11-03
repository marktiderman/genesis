/**
 * @vitest-environment happy-dom
 * @feat:chat
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageGrid, Lightbox, type AttachmentView } from "../web/attachments";

afterEach(cleanup);

const view = (key: string, name: string): AttachmentView =>
  ({ key, kind: "image", url: `https://x.test/${name}`, posterUrl: null, name, mime: "image/jpeg", bytes: null, width: 800, height: 600, durationMs: null, waveform: null, transcript: null, transcriptStatus: null, pending: false, attachment: null }) as unknown as AttachmentView;

describe("chat's photos full size", () => {
  it("open in genesis-ui's Lightbox at the photo clicked, and page with the arrow keys", () => {
    render(<ImageGrid images={[view("a", "a.jpg"), view("b", "b.jpg")]} />);
    fireEvent.click(screen.getByRole("button", { name: "Open photo b.jpg" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.querySelector('[data-slot="lightbox-counter"]')!.textContent).toBe("2 / 2");
    expect(screen.getByRole("img", { name: "b.jpg" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous photo" }));
    expect(screen.getByRole("img", { name: "a.jpg" })).toBeTruthy();
  });

  it("keep the deprecated Lightbox export working: null closes it", () => {
    const onIndexChange = vi.fn();
    const { rerender } = render(<Lightbox images={[view("a", "a.jpg")]} index={0} onIndexChange={onIndexChange} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.querySelector('[data-slot="lightbox-counter"]')).toBeNull();
    rerender(<Lightbox images={[view("a", "a.jpg")]} index={null} onIndexChange={onIndexChange} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
