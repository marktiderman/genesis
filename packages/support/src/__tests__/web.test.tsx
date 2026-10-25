// @feat:support-feedback
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbackPanel, createPinOverlay, resolvePin, stableLocator, undoMark, webContextCollector, canCaptureScreenshot } from "../web";
import type { FeedbackRecord } from "../record";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("FeedbackPanel", () => {
  it("sends the type and message with the web context, then says thanks", async () => {
    const submit = vi.fn(async (_record: FeedbackRecord) => ({ id: "r1", attachmentsDropped: 0 }));
    render(<FeedbackPanel client={{ submit }} screenshots={false} pins={false} />);
    fireEvent.click(screen.getByTestId("genesis-support-type-idea"));
    fireEvent.change(screen.getByTestId("genesis-support-message"), { target: { value: "Export to CSV" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-send"));
    });
    const record = submit.mock.calls[0]![0];
    expect(record).toMatchObject({ type: "idea", message: "Export to CSV", attachments: [], context: { platform: "web" } });
    expect(screen.getByTestId("genesis-support-sent")).toBeTruthy();
  });

  it("won't send an empty message", async () => {
    const submit = vi.fn();
    render(<FeedbackPanel client={{ submit }} screenshots={false} pins={false} />);
    fireEvent.click(screen.getByTestId("genesis-support-send"));
    expect(await screen.findByTestId("genesis-support-error")).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it("tells the person when they hit the rate limit", async () => {
    const submit = vi.fn(async () => {
      throw Object.assign(new Error("too many"), { code: "GS429" });
    });
    render(<FeedbackPanel client={{ submit }} screenshots={false} pins={false} />);
    fireEvent.change(screen.getByTestId("genesis-support-message"), { target: { value: "x" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-send"));
    });
    expect(screen.getByTestId("genesis-support-error").textContent).toMatch(/a lot of feedback/);
  });
});

describe("web context", () => {
  it("sends the path only, never the query string", async () => {
    history.pushState({}, "", "/billing?token=secret#top");
    const context = await webContextCollector({ appVersion: "2.0" }).collect();
    expect(context).toMatchObject({ route: "/billing", platform: "web", appVersion: "2.0" });
  });

  it("knows when the browser can't capture the tab", () => {
    expect(typeof canCaptureScreenshot()).toBe("boolean");
  });
});

describe("pins", () => {
  it("anchor to an id or a data-testid", () => {
    document.body.innerHTML = '<main id="app"><button data-testid="save"><span>Save</span></button></main>';
    expect(stableLocator(document.querySelector("span"))).toBe('[data-testid="save"]');
    expect(stableLocator(document.querySelector("main"))).toBe("#app");
  });

  it("fall back to the clicked point when the element is gone", () => {
    expect(resolvePin(document, { locator: "#gone", viewportX: 40, viewportY: 60, scrollX: 0, scrollY: 0 })).toEqual({ left: 40, top: 60 });
  });

  it("show numbered pins for reports from this page only", () => {
    history.pushState({}, "", "/here");
    const onPinClick = vi.fn();
    const overlay = createPinOverlay({
      reports: [
        { id: "a", title: "Here", route: "/here", pin: { viewportX: 10, viewportY: 10, scrollX: 0, scrollY: 0 } },
        { id: "b", title: "Elsewhere", route: "/there", pin: { viewportX: 10, viewportY: 10, scrollX: 0, scrollY: 0 } },
      ],
      onPinClick,
    });
    const pins = document.querySelectorAll("[data-genesis-support-pins] button");
    expect(pins).toHaveLength(1);
    expect(pins[0]!.getAttribute("aria-label")).toBe("Feedback 1: Here");
    (pins[0] as HTMLButtonElement).click();
    expect(onPinClick).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
    overlay.destroy();
    expect(document.querySelector("[data-genesis-support-pins]")).toBeNull();
  });
});

describe("My reports", () => {
  it("distinguishes empty from failed", async () => {
    const { unmount } = render(<FeedbackPanel client={{ submit: vi.fn(), myReports: async () => [] }} screenshots={false} pins={false} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Your reports" }));
    fireEvent.click(screen.getByRole("tab", { name: "Your reports" }));
    await waitFor(() => expect(screen.getByTestId("genesis-support-mine-empty")).toBeTruthy());
    unmount();
    render(<FeedbackPanel client={{ submit: vi.fn(), myReports: async () => Promise.reject(new Error("offline")) }} screenshots={false} pins={false} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Your reports" }));
    fireEvent.click(screen.getByRole("tab", { name: "Your reports" }));
    await waitFor(() => expect(screen.getByTestId("genesis-support-mine-error")).toBeTruthy());
  });
});

describe("undoMark", () => {
  it("removes the newest mark, whichever kind it was", () => {
    const stroke = [{ x: 0, y: 0 }];
    const box = { x: 0, y: 0, width: 0.1, height: 0.1 };
    const marks = { strokes: [stroke], redactions: [box], order: ["redaction", "stroke"] as Array<"stroke" | "redaction"> };
    expect(undoMark(marks)).toMatchObject({ strokes: [], redactions: [box], order: ["redaction"] });
    expect(undoMark(undoMark(marks))).toMatchObject({ strokes: [], redactions: [], order: [] });
  });
});
