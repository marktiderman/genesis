// @feat:observability @feat:native-app-shell
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { genesisBrand } from "@marktiderman/genesis-design-system";
import { createMockProvider } from "@marktiderman/genesis-core/provider";
import { GenesisNativeApp, type GenesisNativeAppProps } from "../../app";
import { createObservability, defineEvents, type ObservabilitySink } from "../../observability";
import { fakeSupabase, settle } from "../fakes";

afterEach(() => vi.restoreAllMocks());

const provider = createMockProvider({});
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlLXNpZ25hdHVyZQ";

type Method<K extends keyof ObservabilitySink> = NonNullable<ObservabilitySink[K]>;

function spySink(extra: { name?: string; scrubsErrors?: boolean; wrap?: ObservabilitySink["wrap"] } = {}) {
  return {
    name: extra.name ?? "spy",
    scrubsErrors: extra.scrubsErrors,
    wrap: extra.wrap,
    captureError: vi.fn<Method<"captureError">>(),
    breadcrumb: vi.fn<Method<"breadcrumb">>(),
    setUser: vi.fn<Method<"setUser">>(),
    event: vi.fn<Method<"event">>(),
    timing: vi.fn<Method<"timing">>(),
  } satisfies ObservabilitySink;
}

const events = defineEvents({ "auth.signed_in": { method: ["email", "apple"] } });

describe("createObservability", () => {
  it("scrubs what a sink gets: error messages, breadcrumbs and timing tags", () => {
    const sink = spySink();
    const obs = createObservability({ sinks: [sink], now: () => 1000 });
    const error = new Error(`token ${JWT} for a@b.co`);
    obs.captureError(error, { source: "sync" });
    const [sent, context] = sink.captureError.mock.calls[0]!;
    expect(sent).not.toBe(error);
    expect(sent.message).toBe("token [jwt] for [email]");
    expect(context).toMatchObject({ fatal: false, source: "sync" });
    obs.breadcrumb({ category: "http", message: "GET https://x.co/rest/v1/people?id=eq.1", data: { Authorization: "Bearer abcdefgh12345678" } });
    expect(sink.breadcrumb).toHaveBeenCalledWith({ category: "http", level: undefined, timestamp: 1000, message: "GET https://x.co/rest/v1/people", data: { Authorization: "[Filtered]" } });
    obs.timing("sync", 12, { who: "a@b.co" });
    expect(sink.timing).toHaveBeenCalledWith("sync", 12, { who: "[email]" });
  });

  it("gives a sink that scrubs itself the original error object", () => {
    const sink = spySink({ scrubsErrors: true });
    const obs = createObservability({ sinks: [sink] });
    const error = new Error("boom");
    obs.captureError(error);
    expect(sink.captureError.mock.calls[0]![0]).toBe(error);
  });

  it("keeps going when a sink throws, and says so", () => {
    const onProblem = vi.fn();
    const bad = spySink({ name: "bad" });
    bad.captureError.mockImplementation(() => {
      throw new Error("sink down");
    });
    const good = spySink();
    const obs = createObservability({ sinks: [bad, null, false, good], onProblem });
    expect(() => obs.captureError(new Error("x"))).not.toThrow();
    expect(good.captureError).toHaveBeenCalledTimes(1);
    expect(onProblem).toHaveBeenCalledWith("bad.captureError threw", expect.any(Error));
  });

  it("tracks only events in the schema, dropping and reporting anything else", () => {
    const onProblem = vi.fn();
    const sink = spySink();
    const obs = createObservability({ sinks: [sink], events, onProblem });
    obs.track("auth.signed_in", { method: "email" });
    expect(sink.event).toHaveBeenCalledWith("auth.signed_in", { method: "email" });
    // @ts-expect-error not an allowed value
    obs.track("auth.signed_in", { method: "jane@example.com" });
    // @ts-expect-error not an event
    obs.track("auth.signed_up");
    expect(sink.event).toHaveBeenCalledTimes(1);
    expect(onProblem).toHaveBeenCalledTimes(2);
  });

  it("keeps the last breadcrumbs and errors, scrubbed, for the overlay", () => {
    const obs = createObservability({ sinks: [], recent: { breadcrumbs: 2, errors: 1 }, now: () => 5 });
    obs.breadcrumb({ category: "a" });
    obs.breadcrumb({ category: "b" });
    obs.breadcrumb({ category: "c", message: "a@b.co" });
    obs.captureError(new Error("first"));
    obs.captureError(new Error("second for a@b.co"));
    const { breadcrumbs, errors } = obs.recent.getState();
    expect(breadcrumbs.map((c) => c.category)).toEqual(["b", "c"]);
    expect(breadcrumbs[1]!.message).toBe("[email]");
    expect(errors).toEqual([{ at: 5, name: "Error", message: "second for [email]", source: "app", fatal: false }]);
  });

  it("sets the user once per change and composes sinks' wrap", () => {
    const wrapA = vi.fn(<P,>(c: P) => c);
    const sink = spySink({ wrap: wrapA as ObservabilitySink["wrap"] });
    const obs = createObservability({ sinks: [sink] });
    obs.setUser("u1");
    obs.setUser("u1");
    obs.setUser(null);
    expect(sink.setUser.mock.calls).toEqual([["u1"], [null]]);
    const Root = () => null;
    expect(obs.wrap(Root)).toBe(Root);
    expect(wrapA).toHaveBeenCalledWith(Root);
  });
});

function setup(props: Partial<GenesisNativeAppProps> = {}, user: { id: string } | null = { id: "u1" }) {
  return render(
    <GenesisNativeApp brand={genesisBrand} supabase={fakeSupabase(user ? { user } : null).client} provider={provider} rejectionTracker={null} {...props}>
      {props.children ?? <span data-testid="screens">screens</span>}
    </GenesisNativeApp>,
  );
}

describe("observability in GenesisNativeApp", () => {
  it("reports a render error as fatal from the boundary, then calls the app's onError", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sink = spySink();
    const obs = createObservability({ sinks: [sink] });
    const order: string[] = [];
    sink.captureError.mockImplementation(() => void order.push("block"));
    function Boom(): ReactNode {
      throw new Error("render broke for a@b.co");
    }
    setup({ blocks: [obs], children: <Boom />, onError: () => void order.push("app") });
    await act(settle);
    expect(screen.getByTestId("genesis-fatal")).toBeTruthy();
    const [error, context] = sink.captureError.mock.calls[0]!;
    expect(error.message).toBe("render broke for [email]");
    expect(context).toMatchObject({ fatal: true, source: "boundary" });
    expect(context.componentStack).toEqual(expect.any(String));
    expect(order.slice(0, 2)).toEqual(["block", "app"]);
  });

  it("still shows the fatal screen when the app's onError throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const obs = createObservability({ sinks: [spySink()] });
    function Boom(): ReactNode {
      throw new Error("x");
    }
    setup({ blocks: [obs], children: <Boom />, onError: () => { throw new Error("reporter down"); } });
    await act(settle);
    expect(screen.getByTestId("genesis-fatal")).toBeTruthy();
  });

  it("reports global errors through the shell's handler", async () => {
    const sink = spySink();
    const obs = createObservability({ sinks: [sink] });
    let handler: ((e: unknown, fatal?: boolean) => void) | undefined;
    const errorUtils = { getGlobalHandler: () => undefined, setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void (handler = h) };
    setup({ blocks: [obs], errorUtils });
    await act(settle);
    act(() => handler?.(new Error("bg"), false));
    expect(sink.captureError.mock.calls[0]![1]).toMatchObject({ fatal: false, source: "global" });
  });

  it("sets the user to the signed-in login's id", async () => {
    const sink = spySink();
    setup({ blocks: [createObservability({ sinks: [sink] })] }, { id: "user-7" });
    await act(settle);
    expect(sink.setUser).toHaveBeenLastCalledWith("user-7");
  });

  it("leaves a breadcrumb per route pattern and times the route left", async () => {
    const sink = spySink();
    let segments = ["(app)", "(home)"];
    let clock = 1000;
    const obs = createObservability({ sinks: [sink], useSegments: () => segments, now: () => clock });
    const view = setup({ blocks: [obs] });
    await act(settle);
    expect(sink.breadcrumb).toHaveBeenLastCalledWith(expect.objectContaining({ category: "navigation", message: "/(app)/(home)" }));
    segments = ["(app)", "clients", "[id]"];
    clock = 4000;
    view.rerender(
      <GenesisNativeApp brand={genesisBrand} supabase={fakeSupabase({ user: { id: "u1" } }).client} provider={provider} rejectionTracker={null} blocks={[obs]}>
        <span>next</span>
      </GenesisNativeApp>,
    );
    await act(settle);
    expect(sink.breadcrumb).toHaveBeenLastCalledWith(expect.objectContaining({ message: "/(app)/clients/[id]", data: { from: "/(app)/(home)" } }));
    expect(sink.timing).toHaveBeenCalledWith("route.time_on_screen", 3000, { route: "/(app)/(home)" });
  });
});
