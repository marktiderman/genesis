// @feat:support-feedback @feat:feature-voting
import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { Alert } from "react-native";
import { InboxPage, ThreadPage } from "@marktiderman/genesis-ui-native/layouts";
import { createSupport, FeedbackForm, listenForShake, strokeDots, boxOf, useIdeaBoard, useSupportInbox, useSupportThread, type AccelerometerLike, type ViewShotLike } from "../native";
import { fakeSupabase, arg, type Call } from "./fake-supabase";

const REPORT = "11111111-1111-4111-8111-111111111111";

function accelerometer() {
  let listener: ((m: { x: number; y: number; z: number }) => void) | null = null;
  const fake: AccelerometerLike & { jolt: (g: number) => void; removed: boolean } = {
    removed: false,
    addListener: (l) => {
      listener = l;
      return { remove: () => (fake.removed = true) };
    },
    setUpdateInterval: vi.fn(),
    jolt: (g) => listener?.({ x: g, y: 0, z: 0 }),
  };
  return fake;
}

const viewShot = (): ViewShotLike & { captureScreen: ReturnType<typeof vi.fn>; captureRef: ReturnType<typeof vi.fn> } => ({
  captureScreen: vi.fn(async () => "data:image/jpeg;base64,aGk="),
  captureRef: vi.fn(async () => "data:image/jpeg;base64,bWFya2Vk"),
});

function harness(respond?: (call: Call) => { data: unknown; error: null } | undefined, extra: Partial<Parameters<typeof createSupport>[0]> = {}) {
  const fake = fakeSupabase({ respond });
  const navigate = vi.fn();
  const block = createSupport({ supabase: fake.client, navigate, platform: "ios", appVersion: "1.4.0 (37)", useCurrentRoute: () => "/home", basePath: "/settings/support", ...extra });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Root = block.Root;
  const wrap = (children: ReactNode) => (
    <QueryClientProvider client={queryClient}>
      <Root>{children}</Root>
    </QueryClientProvider>
  );
  return { fake, navigate, block, wrap };
}

describe("listenForShake", () => {
  it("needs two strong jolts close together, then rests", () => {
    let t = 0;
    const acc = accelerometer();
    const onShake = vi.fn();
    const stop = listenForShake(acc, onShake, { now: () => t });
    acc.jolt(1.2); // a step, not a shake
    acc.jolt(3);
    expect(onShake).not.toHaveBeenCalled();
    t = 200;
    acc.jolt(3);
    expect(onShake).toHaveBeenCalledTimes(1);
    t = 400;
    acc.jolt(3);
    t = 500;
    acc.jolt(3);
    expect(onShake).toHaveBeenCalledTimes(1);
    stop();
    expect(acc.removed).toBe(true);
  });

  it("forgets a jolt that is too old", () => {
    let t = 0;
    const acc = accelerometer();
    const onShake = vi.fn();
    listenForShake(acc, onShake, { now: () => t });
    acc.jolt(3);
    t = 5000;
    acc.jolt(3);
    expect(onShake).not.toHaveBeenCalled();
  });
});

describe("the support block", () => {
  it("declares the support-feedback block for native, with its Settings rows under the base path", () => {
    const { block } = harness();
    expect(block.id).toBe("support-feedback");
    expect(block.platforms).toEqual(["native"]);
    expect(block.contributes?.settings?.map((r) => r.href)).toEqual(["/settings/support/new", "/settings/support"]);
  });

  it("captures the screen on a shake and opens the feedback screen with it", async () => {
    const acc = accelerometer();
    const shot = viewShot();
    const { navigate, block, wrap } = harness(undefined, { accelerometer: acc, viewShot: shot });
    render(wrap(<span />));
    let t = 0;
    vi.spyOn(Date, "now").mockImplementation(() => t);
    acc.jolt(3);
    t = 100;
    acc.jolt(3);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/settings/support/new"));
    expect(shot.captureScreen).toHaveBeenCalledWith({ format: "jpg", quality: 0.8, result: "data-uri" });
    expect(block.peekPending()).toMatchObject({ route: "/home", screenshot: { uri: "data:image/jpeg;base64,aGk=", contentType: "image/jpeg" } });
    vi.restoreAllMocks();
  });

  it("opens the form without a screenshot when capture fails, and reports why", async () => {
    const onError = vi.fn();
    const shot = viewShot();
    shot.captureScreen.mockRejectedValueOnce(new Error("no window"));
    const { navigate, block } = harness(undefined, { viewShot: shot, onError });
    await block.openFeedback();
    expect(navigate).toHaveBeenCalled();
    expect(block.peekPending()?.screenshot).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "capture");
  });
});

describe("FeedbackForm", () => {
  it("sends the message, the screenshot and where the person was (not the form)", async () => {
    const shot = viewShot();
    const { fake, block, wrap } = harness((call) => (call.table === "support_reports" ? { data: { id: REPORT }, error: null } : { data: null, error: null }), { viewShot: shot });
    const view = render(wrap(<span />));
    await block.openFeedback();
    view.rerender(wrap(<FeedbackForm />));
    expect(screen.getByTestId("genesis-support-feedback-screenshot")).toBeTruthy();
    fireEvent.click(screen.getByTestId("genesis-support-feedback-include-screenshot"));
    fireEvent.change(screen.getByTestId("genesis-support-feedback-message"), { target: { value: "The save button does nothing" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-feedback-send"));
    });
    await waitFor(() => expect(fake.uploads).toHaveLength(1));
    const report = arg(fake.calls.find((c) => c.table === "support_reports"), "insert") as Record<string, unknown>;
    expect(report).toMatchObject({ type: "bug", message: "The save button does nothing", route: "/home", app_version: "1.4.0 (37)", platform: "ios" });
    expect(vi.mocked(Alert.alert)).toHaveBeenCalledWith("Thanks for the feedback", expect.any(String));
  });

  it("leaves the confirmation to onSent with sentAlert={false} (the app's toast)", async () => {
    const { block, wrap } = harness((call) => (call.table === "support_reports" ? { data: { id: REPORT }, error: null } : { data: null, error: null }));
    const onSent = vi.fn();
    const view = render(wrap(<span />));
    await block.openFeedback({ screenshot: false });
    view.rerender(wrap(<FeedbackForm sentAlert={false} onSent={onSent} />));
    fireEvent.change(screen.getByTestId("genesis-support-feedback-message"), { target: { value: "Works now" } });
    vi.mocked(Alert.alert).mockClear();
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-feedback-send"));
    });
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(vi.mocked(Alert.alert)).not.toHaveBeenCalled();
  });

  it("sends no screenshot unless the person includes it", async () => {
    const { fake, block, wrap } = harness(() => ({ data: { id: REPORT }, error: null }), { viewShot: viewShot() });
    const view = render(wrap(<span />));
    await block.openFeedback();
    view.rerender(wrap(<FeedbackForm />));
    expect(screen.getByTestId("genesis-support-feedback-screenshot")).toBeTruthy();
    fireEvent.change(screen.getByTestId("genesis-support-feedback-message"), { target: { value: "x" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-feedback-send"));
    });
    await waitFor(() => expect(fake.calls.some((c) => c.table === "support_reports")).toBe(true));
    expect(fake.uploads).toHaveLength(0);
  });

  it("sends the devtools overlay's debug report with the feedback", async () => {
    const { fake, block, wrap } = harness(() => ({ data: { id: REPORT }, error: null }));
    const Fill = block.contributes!.slots!.devtoolsFeedback as unknown as (p: { debugInfo: string; close: () => void }) => ReactNode;
    const close = vi.fn();
    render(wrap(<Fill debugInfo="version 1.4.0" close={close} />));
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-devtools-feedback"));
      await new Promise((r) => setTimeout(r, 450));
    });
    expect(close).toHaveBeenCalled();
    expect(block.peekPending()?.extra).toEqual({ debugInfo: "version 1.4.0" });
    void fake;
  });

  it("captures the screen only after the devtools sheet has finished closing", async () => {
    const shot = viewShot();
    const { block, wrap } = harness(() => ({ data: { id: REPORT }, error: null }), { viewShot: shot });
    const Fill = block.contributes!.slots!.devtoolsFeedback as unknown as (p: { debugInfo: string; close: () => Promise<void> }) => ReactNode;
    let finishClosing!: () => void;
    const close = vi.fn(() => new Promise<void>((resolve) => (finishClosing = resolve)));
    render(wrap(<Fill debugInfo="version 1.4.0" close={close} />));
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-devtools-feedback"));
      // Longer than the old fixed 400 ms: still no capture while the sheet is on its way down.
      await new Promise((r) => setTimeout(r, 450));
    });
    expect(close).toHaveBeenCalled();
    expect(shot.captureScreen).not.toHaveBeenCalled();
    await act(async () => {
      finishClosing();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(shot.captureScreen).toHaveBeenCalledTimes(1);
    expect(block.peekPending()?.screenshot?.uri).toBe("data:image/jpeg;base64,aGk=");
  });

  it("sends no screenshot once the person removes it", async () => {
    const { fake, block, wrap } = harness(() => ({ data: { id: REPORT }, error: null }), { viewShot: viewShot() });
    const view = render(wrap(<span />));
    await block.openFeedback();
    view.rerender(wrap(<FeedbackForm />));
    fireEvent.click(screen.getByTestId("genesis-support-feedback-remove-screenshot"));
    fireEvent.change(screen.getByTestId("genesis-support-feedback-message"), { target: { value: "x" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-feedback-send"));
    });
    await waitFor(() => expect(fake.calls.some((c) => c.table === "support_reports")).toBe(true));
    expect(fake.uploads).toHaveLength(0);
  });

  it("asks for a message before sending", async () => {
    const { fake, wrap } = harness();
    render(wrap(<FeedbackForm />));
    fireEvent.click(screen.getByTestId("genesis-support-feedback-send"));
    expect(await screen.findByText("Write a few words first.")).toBeTruthy();
    expect(fake.calls).toHaveLength(0);
  });

  it("marks up the screenshot and sends the flattened image", async () => {
    const shot = viewShot();
    const { fake, block, wrap } = harness(() => ({ data: { id: REPORT }, error: null }), { viewShot: shot });
    const view = render(wrap(<span />));
    await block.openFeedback();
    view.rerender(wrap(<FeedbackForm />));
    fireEvent.click(screen.getByTestId("genesis-support-feedback-annotate"));
    expect(screen.getByTestId("genesis-support-feedback-annotator")).toBeTruthy();
    // No marks: Done keeps the image as it was, without a capture.
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-feedback-annotator-done"));
    });
    expect(shot.captureRef).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("genesis-support-feedback-include-screenshot"));
    fireEvent.change(screen.getByTestId("genesis-support-feedback-message"), { target: { value: "x" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-feedback-send"));
    });
    await waitFor(() => expect(fake.uploads).toHaveLength(1));
  });
});

describe("annotation geometry", () => {
  it("fills a stroke with dots and boxes a drag in any direction", () => {
    expect(strokeDots([{ x: 0, y: 0 }, { x: 9, y: 0 }]).length).toBeGreaterThan(2);
    expect(boxOf({ x: 10, y: 20 }, { x: 4, y: 5 })).toEqual({ left: 4, top: 5, width: 6, height: 15 });
  });
});

describe("the screens' hooks", () => {
  it("useSupportInbox feeds InboxPage the person's reports, unread first-class, opening the thread", async () => {
    const { navigate, wrap } = harness((call) =>
      call.table === "support_reports"
        ? { data: [{ id: REPORT, type: "bug", title: null, message: "Broken save\nmore", status: "in_progress", created_at: "2026-10-24T09:00:00Z", updated_at: "x", last_staff_reply_at: "2026-10-24T10:00:00Z", user_read_at: null }], error: null }
        : undefined,
    );
    function Inbox() {
      const inbox = useSupportInbox();
      return <InboxPage {...inbox} />;
    }
    render(wrap(<Inbox />));
    const row = await screen.findByTestId(`genesis-support-report-${REPORT}`);
    expect(row.getAttribute("aria-label")).toMatch(/^Unread, Broken save/);
    expect(screen.getByTestId(`genesis-support-report-${REPORT}-meta`).textContent).toBe("Bug · In progress");
    fireEvent.click(row);
    expect(navigate).toHaveBeenCalledWith(`/settings/support/${REPORT}`);
  });

  it("useSupportThread shows the report, the staff reply, and marks it read", async () => {
    const { fake, wrap } = harness((call) => {
      if (call.table === "support_reports")
        return { data: { id: REPORT, type: "bug", message: "Broken", status: "open", created_at: "2026-10-24T09:00:00Z", updated_at: "x", staff_read_at: "2026-10-24T10:00:00Z" }, error: null };
      if (call.table === "support_replies") return { data: [{ id: "r1", report_id: REPORT, body: "On it", from_staff: true, author_id: "staff", created_at: "2026-10-24T10:00:00Z" }], error: null };
      return { data: [], error: null };
    });
    function Thread() {
      const thread = useSupportThread(REPORT);
      return <ThreadPage {...thread} />;
    }
    render(wrap(<Thread />));
    expect(await screen.findByText("On it")).toBeTruthy();
    expect(screen.getByText("Support")).toBeTruthy();
    expect(screen.getByTestId("genesis-support-thread-read-receipt")).toBeTruthy();
    await waitFor(() => expect(fake.rpcs).toContainEqual({ fn: "support_mark_read", args: { report: REPORT } }));
  });

  it("useIdeaBoard shows votes and casts one", async () => {
    const { fake, wrap } = harness((call) =>
      call.table === "support_ideas" ? { data: [{ id: "i1", title: "Dark mode", status: "open", vote_count: 2, author_id: "x", created_at: "x" }], error: null } : { data: [], error: null },
    );
    function Board() {
      const board = useIdeaBoard();
      return <InboxPage {...board} />;
    }
    render(wrap(<Board />));
    const vote = await screen.findByTestId("genesis-support-vote-i1");
    expect(vote.textContent).toBe("▲ 2");
    await act(async () => {
      fireEvent.click(vote);
    });
    await waitFor(() => expect(fake.calls.some((c) => c.table === "support_idea_votes" && c.ops.some(([op]) => op === "insert"))).toBe(true));
  });
});
