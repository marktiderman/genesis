// @feat:observability
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { getErrorReporter, reportError, setErrorReporter, defaultErrorReporter } from "@marktiderman/genesis-core/errors";
import { createObservability, type ObservabilitySink, type RouteErrorBoundaryProps } from "../../observability";
import { runBeforeReload } from "../../reload";

type Method<K extends keyof ObservabilitySink> = NonNullable<ObservabilitySink[K]>;

function spySink(extra: Omit<Partial<ObservabilitySink>, "captureError"> = {}) {
  return {
    name: "spy",
    ...extra,
    captureError: vi.fn<Method<"captureError">>(),
  };
}

afterEach(() => {
  setErrorReporter(null);
  vi.restoreAllMocks();
});

describe("the observability block as genesis-core's error reporter", () => {
  it("registers itself, so a package's reportError reaches the sinks non-fatal, with its tags scrubbed", () => {
    const sink = spySink();
    createObservability({ sinks: [sink] });
    reportError(new Error("card failed for a@b.co"), { source: "chat:attachment-action", tags: { kind: "poll", who: "a@b.co" } });
    const [error, context] = sink.captureError.mock.calls[0]!;
    expect(error.message).toBe("card failed for [email]");
    expect(context).toMatchObject({ fatal: false, source: "chat:attachment-action", tags: { kind: "poll", who: "[email]" } });
  });

  it("stays out of the way with reportErrors: false", () => {
    createObservability({ sinks: [spySink()], reportErrors: false });
    expect(getErrorReporter()).toBe(defaultErrorReporter);
  });
});

describe("handled and tags", () => {
  it("passes an unhandled rejection on as unhandled", () => {
    const sink = spySink();
    const obs = createObservability({ sinks: [sink], reportErrors: false });
    obs.onError(new Error("x"), { fatal: false, handled: false, source: "rejection" });
    expect(sink.captureError.mock.calls[0]![1]).toMatchObject({ fatal: false, handled: false, source: "rejection" });
  });

  it("passes a query's key tag on", () => {
    const sink = spySink();
    const obs = createObservability({ sinks: [sink], reportErrors: false });
    obs.onError(new Error("x"), { fatal: false, source: "query", tags: { "query.key": "tasks" } });
    expect(sink.captureError.mock.calls[0]![1]).toMatchObject({ source: "query", tags: { "query.key": "tasks" } });
  });
});

describe("flush, lastEventId and replayId", () => {
  it("flushes every sink that can, and says whether all finished", async () => {
    const a = spySink({ name: "a", flush: vi.fn(async () => true) });
    const b = spySink({ name: "b", flush: vi.fn(async () => false) });
    const obs = createObservability({ sinks: [a, b, spySink({ name: "c" })], reportErrors: false });
    expect(await obs.flush(500)).toBe(false);
    expect(a.flush).toHaveBeenCalledWith(500);
    const ok = createObservability({ sinks: [a], reportErrors: false });
    expect(await ok.flush()).toBe(true);
  });

  it("gives up at the deadline and survives a throwing sink", async () => {
    vi.useFakeTimers();
    const problems: string[] = [];
    const hang = spySink({ name: "hang", flush: () => new Promise<boolean>(() => {}) });
    const broken = spySink({ name: "broken", flush: () => { throw new Error("no"); } });
    const obs = createObservability({ sinks: [hang, broken], reportErrors: false, onProblem: (p) => problems.push(p) });
    const result = obs.flush(100);
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toBe(false);
    expect(problems).toContain("broken.flush threw");
    vi.useRealTimers();
  });

  it("flushes before an update reloads the app, and only the newest block's hook runs", async () => {
    const old = spySink({ name: "old", flush: vi.fn(async () => true) });
    createObservability({ sinks: [old], reportErrors: false });
    const current = spySink({ name: "current", flush: vi.fn(async () => true) });
    createObservability({ sinks: [current], reportErrors: false, flushBeforeReloadMs: 750 });
    await runBeforeReload();
    expect(current.flush).toHaveBeenCalledWith(750);
    expect(old.flush).not.toHaveBeenCalled();
  });

  it("reads the last event id and the replay id from the first sink that has one", () => {
    const obs = createObservability({
      sinks: [spySink({ name: "none", lastEventId: () => undefined }), spySink({ name: "sentry", lastEventId: () => "evt-1", replayId: () => "rep-1" })],
      reportErrors: false,
    });
    expect(obs.lastEventId()).toBe("evt-1");
    expect(obs.replayId()).toBe("rep-1");
    expect(createObservability({ sinks: [], reportErrors: false }).lastEventId()).toBeUndefined();
  });
});

describe("screenBoundary", () => {
  it("reports the route's error once, non-fatal, and retry calls Expo Router's retry", () => {
    const sink = spySink();
    const obs = createObservability({ sinks: [sink], reportErrors: false });
    const Boundary = obs.screenBoundary();
    const retry = vi.fn(async () => {});
    const error = new Error("tab broke");
    const { rerender } = render(<Boundary error={error} retry={retry} />);
    rerender(<Boundary error={error} retry={retry} />);
    expect(screen.getByTestId("genesis-screen-error")).toBeTruthy();
    expect(sink.captureError).toHaveBeenCalledTimes(1);
    expect(sink.captureError.mock.calls[0]![1]).toMatchObject({ fatal: false, source: "screen" });
    fireEvent.click(screen.getByTestId("genesis-screen-error-retry"));
    expect(retry).toHaveBeenCalled();
  });

  it("is wrapped by a sink's route wrapper, which then reports it itself", () => {
    const seen: string[] = [];
    const wrapping = spySink({
      name: "sentry",
      wrapRouteErrorBoundary: (Inner: ComponentType<RouteErrorBoundaryProps>) =>
        function Wrapped(props: RouteErrorBoundaryProps) {
          seen.push(props.error.message);
          return <Inner {...props} />;
        },
    });
    const other = spySink({ name: "other" });
    const Boundary = createObservability({ sinks: [wrapping, other], reportErrors: false }).screenBoundary(({ error }) => <span data-testid="mine">{error.name}</span>);
    act(() => {
      render(<Boundary error={new Error("route")} retry={async () => {}} />);
    });
    expect(seen).toEqual(["route"]);
    expect(screen.getByTestId("mine")).toBeTruthy();
    expect(wrapping.captureError).not.toHaveBeenCalled();
    expect(other.captureError).toHaveBeenCalledTimes(1);
  });

  it("falls back to the plain boundary, still reporting to that sink, when its wrapper throws", () => {
    const problems: string[] = [];
    const sink = spySink({
      name: "broken",
      wrapRouteErrorBoundary: () => {
        throw new Error("no");
      },
    });
    const Boundary = createObservability({ sinks: [sink], reportErrors: false, onProblem: (p) => problems.push(p) }).screenBoundary();
    render(<Boundary error={new Error("x")} retry={async () => {}} />);
    expect(problems).toContain("broken.wrapRouteErrorBoundary threw");
    expect(sink.captureError).toHaveBeenCalledTimes(1);
  });
});
