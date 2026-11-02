// @feat:support-feedback
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbackPanel, createPinOverlay, resolvePin, stableLocator, undoMark, useFeedbackDraft, webContextCollector, canCaptureScreenshot, type FeedbackPanelProps } from "../web";
import type { FeedbackRecord } from "../record";
import { isSitePath } from "../routes";
import { cleanLabel, pageOf, reportHeading } from "../client";
import { useFeedbackShortcut } from "../web/shortcut";

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
    // Sent: the confirmation takes the form's place, with a way to send another.
    expect(screen.getByTestId("genesis-support-sent").textContent).toMatch(/Thanks for the feedback/);
    expect(screen.queryByTestId("genesis-support-send")).toBeNull();
    fireEvent.click(screen.getByTestId("genesis-support-send-another"));
    expect(screen.getByTestId("genesis-support-message")).toBeTruthy();
    expect(screen.queryByTestId("genesis-support-sent")).toBeNull();
  });

  it("won't send an empty message", async () => {
    const submit = vi.fn();
    render(<FeedbackPanel client={{ submit }} screenshots={false} pins={false} />);
    fireEvent.click(screen.getByTestId("genesis-support-send"));
    expect(await screen.findByTestId("genesis-support-error")).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
    // The error goes as soon as there are words.
    fireEvent.change(screen.getByTestId("genesis-support-message"), { target: { value: "It broke" } });
    expect(screen.queryByTestId("genesis-support-error")).toBeNull();
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
  it("the panel says a pin was placed, sends it, and can drop it", async () => {
    const submit = vi.fn(async (_record: FeedbackRecord) => ({ id: "r1", attachmentsDropped: 0 }));
    render(<FeedbackPanel client={{ submit }} screenshots={false} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-pin"));
    });
    const veil = document.querySelector("[data-genesis-support-pin-picker]") as HTMLElement;
    await act(async () => {
      veil.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 20, clientY: 30 }));
    });
    expect(await screen.findByTestId("genesis-support-pinned")).toBeTruthy();
    fireEvent.change(screen.getByTestId("genesis-support-message"), { target: { value: "Here" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-send"));
    });
    expect(submit.mock.calls[0]![0].context.extra).toMatchObject({ pin: { viewportX: 20, viewportY: 30 } });
  });
});

describe("screenshots that weren't taken", () => {
  it("say so instead of nothing", async () => {
    const getDisplayMedia = vi.fn(async () => {
      throw new Error("NotAllowedError");
    });
    Object.defineProperty(navigator, "mediaDevices", { value: { getDisplayMedia }, configurable: true });
    render(<FeedbackPanel client={{ submit: vi.fn() }} pins={false} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-capture"));
    });
    expect(getDisplayMedia).toHaveBeenCalled();
    expect(screen.getByTestId("genesis-support-capture-failed").textContent).toMatch(/didn't allow it/);
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
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

describe("a draft the host holds", () => {
  it("survives the panel unmounting while it steps aside", async () => {
    function Host({ shown }: { shown: boolean }) {
      const draft = useFeedbackDraft();
      const props: FeedbackPanelProps = { client: { submit: vi.fn() }, screenshots: false, pins: false, draft };
      return shown ? <FeedbackPanel {...props} /> : <p>hidden</p>;
    }
    const { rerender } = render(<Host shown />);
    fireEvent.change(screen.getByTestId("genesis-support-message"), { target: { value: "Kept" } });
    rerender(<Host shown={false} />);
    rerender(<Host shown />);
    expect((screen.getByTestId("genesis-support-message") as HTMLTextAreaElement).value).toBe("Kept");
  });
});

describe("drafts, the shortcut and report links", () => {
  it("takes each capture request once, however often the panel remounts", async () => {
    const getDisplayMedia = vi.fn(async () => {
      throw new Error("NotAllowedError");
    });
    Object.defineProperty(navigator, "mediaDevices", { value: { getDisplayMedia }, configurable: true });
    function Host({ shown, request }: { shown: boolean; request: number }) {
      const draft = useFeedbackDraft();
      return shown ? <FeedbackPanel client={{ submit: vi.fn() }} pins={false} draft={draft} captureRequest={request} /> : <p>stepped aside</p>;
    }
    const { rerender } = render(<Host shown request={1} />);
    await act(async () => {});
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    // The host steps aside (unmounting the panel) and comes back, several times: no new prompt.
    for (let i = 0; i < 3; i++) {
      rerender(<Host shown={false} request={1} />);
      rerender(<Host shown request={1} />);
      await act(async () => {});
    }
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    // The next press asks once more.
    rerender(<Host shown request={2} />);
    await act(async () => {});
    expect(getDisplayMedia).toHaveBeenCalledTimes(2);
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
  });

  it("a send that finishes after a reopen leaves the new draft alone", async () => {
    let finish: (v: { id: string; attachmentsDropped: number }) => void = () => {};
    const submit = vi.fn(() => new Promise<{ id: string; attachmentsDropped: number }>((r) => (finish = r)));
    let store: ReturnType<typeof useFeedbackDraft> | null = null;
    function Host() {
      const draft = useFeedbackDraft();
      store = draft;
      return <FeedbackPanel client={{ submit }} screenshots={false} pins={false} draft={draft} />;
    }
    render(<Host />);
    fireEvent.change(screen.getByTestId("genesis-support-message"), { target: { value: "First" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-send"));
    });
    act(() => store!.reset());
    fireEvent.change(screen.getByTestId("genesis-support-message"), { target: { value: "Second, still typing" } });
    await act(async () => finish({ id: "r1", attachmentsDropped: 0 }));
    expect((screen.getByTestId("genesis-support-message") as HTMLTextAreaElement).value).toBe("Second, still typing");
    expect(screen.queryByTestId("genesis-support-sent")).toBeNull();
  });

  it("the shortcut ignores key repeat and rich-text editors", () => {
    const open = vi.fn();
    function Keys() {
      useFeedbackShortcut(open);
      return <div contentEditable suppressContentEditableWarning data-testid="editor" />;
    }
    render(<Keys />);
    const press = (target: EventTarget, repeat = false) =>
      target.dispatchEvent(new KeyboardEvent("keydown", { key: ".", code: "Period", metaKey: true, shiftKey: true, repeat, bubbles: true }));
    press(window, true);
    press(screen.getByTestId("editor"));
    expect(open).not.toHaveBeenCalled();
    press(window);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("links a report's route only when it's a path on this site", () => {
    expect(isSitePath("/projects/42/tasks")).toBe(true);
    for (const bad of ["//evil.test/x", "/\\evil.test", "https://evil.test", "javascript:alert(1)", "", null, "/a b"]) expect(isSitePath(bad)).toBe(false);
    // A route with an id taken out names no real page.
    expect(isSitePath("/projects/:id/tasks")).toBe(false);
  });
});

describe("where a report was sent from", () => {
  it("keeps what the page was about, as the panel showed it", async () => {
    const submit = vi.fn(async (_record: FeedbackRecord) => ({ id: "r1", attachmentsDropped: 0 }));
    render(
      <FeedbackPanel client={{ submit }} screenshots={false} pins={false} about={{ label: "Billing", context: { project_id: "p1" } }} />,
    );
    fireEvent.change(screen.getByTestId("genesis-support-message"), { target: { value: "Here" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-send"));
    });
    expect(submit.mock.calls[0]![0].context.extra).toMatchObject({ project_id: "p1", about_label: "Billing" });
  });

  it("reads as the label with the route, else the route", () => {
    expect(pageOf("Billing", "/teams/:id/billing")).toBe("Billing (/teams/:id/billing)");
    expect(pageOf(null, "/help")).toBe("/help");
    expect(pageOf("  ", null)).toBeNull();
  });
});

describe("a report's heading", () => {
  it("is its title, else its words, never just its kind", () => {
    expect(reportHeading({ title: "Export broke", message: "It broke" })).toBe("Export broke");
    expect(reportHeading({ title: null, message: "The export button does nothing\nSecond line" })).toBe("The export button does nothing");
    expect(reportHeading({ title: "  ", message: "x".repeat(200) })).toHaveLength(118);
  });
});

describe("the thanks after Send", () => {
  it("offers the host's Help when it gives one, and not otherwise", async () => {
    const onOpenHelp = vi.fn();
    const submit = vi.fn(async (_record: FeedbackRecord) => ({ id: "r1", attachmentsDropped: 0 }));
    const { unmount } = render(<FeedbackPanel client={{ submit }} screenshots={false} pins={false} onOpenHelp={onOpenHelp} />);
    fireEvent.change(screen.getByTestId("genesis-support-message"), { target: { value: "Here" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-send"));
    });
    fireEvent.click(screen.getByTestId("genesis-support-open-help"));
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
    unmount();
    render(<FeedbackPanel client={{ submit }} screenshots={false} pins={false} />);
    fireEvent.change(screen.getByTestId("genesis-support-message"), { target: { value: "Again" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-send"));
    });
    expect(screen.queryByTestId("genesis-support-open-help")).toBeNull();
  });
});

describe("a reporter's about label", () => {
  it("shows on one line, short, without control or direction-changing characters", () => {
    expect(cleanLabel("Billing\n\tsettings")).toBe("Billing settings");
    expect(cleanLabel("Pay\u202Emoc.live\u202C now")).toBe("Paymoc.live now");
    expect(cleanLabel("x".repeat(200))).toHaveLength(80);
    expect(cleanLabel(" \u0000 ")).toBeNull();
  });
});
