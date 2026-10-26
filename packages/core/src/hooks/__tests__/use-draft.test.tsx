// @vitest-environment happy-dom
import { StrictMode } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDraft, type UseDraftReturn } from "../use-draft";
import type { DraftOptions } from "../draft-controller";

type V = Record<string, unknown>;
type Row = { id: string; answers: V; status: string };

function store() {
  const calls: string[] = [];
  let next = 1;
  return {
    calls,
    create: vi.fn(async (answers: V, _hints?: { keepalive: boolean }): Promise<Row> => {
      calls.push(`create ${JSON.stringify(answers)}`);
      return { id: `r${next++}`, answers, status: "draft" };
    }),
    update: vi.fn(async (row: Row, answers: V, _hints?: { keepalive: boolean }): Promise<Row> => {
      calls.push(`update ${row.id} ${JSON.stringify(answers)}`);
      return { ...row, answers };
    }),
  };
}

/** Renders useDraft in a component and hands back its latest return, and a way to re-render with new options. */
function mount(over: Partial<DraftOptions<V, Row>> = {}, s = store(), strict = false) {
  let latest!: UseDraftReturn<V, Row>;
  const base: DraftOptions<V, Row> = {
    seed: { row: null, value: {} },
    create: s.create,
    update: s.update,
    toValue: (row) => row.answers,
    ...over,
  };
  function Probe(props: { options: DraftOptions<V, Row> }) {
    latest = useDraft(props.options);
    return null;
  }
  const wrap = (options: DraftOptions<V, Row>) =>
    strict ? (
      <StrictMode>
        <Probe options={options} />
      </StrictMode>
    ) : (
      <Probe options={options} />
    );
  const view = render(wrap(base));
  return {
    s,
    get draft() {
      return latest;
    },
    rerender: (change: Partial<DraftOptions<V, Row>>) => view.rerender(wrap({ ...base, ...change })),
    unmount: () => view.unmount(),
  };
}

const settle = (ms = 1000) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useDraft", () => {
  it("saves a moment after the last change and reports it", async () => {
    const h = mount();
    act(() => h.draft.set({ a: "hi" }));
    expect(h.draft.value).toEqual({ a: "hi" });
    await settle();
    expect(h.s.calls).toEqual(['create {"a":"hi"}']);
    expect(h.draft).toMatchObject({ status: "saved", row: { id: "r1" } });
  });

  it("creates once under Strict Mode's double mount", async () => {
    const h = mount({}, store(), true);
    act(() => h.draft.set({ a: "x" }));
    await settle();
    expect(h.s.create).toHaveBeenCalledTimes(1);
  });

  it("saves what's pending on unmount", async () => {
    const h = mount();
    act(() => h.draft.set({ a: "x" }));
    h.unmount();
    await settle(0);
    expect(h.s.calls).toEqual(['create {"a":"x"}']);
  });

  it("saves with keepalive when the page is hidden, and warns before unload only while pending", async () => {
    const r1: Row = { id: "r1", answers: {}, status: "draft" };
    const h = mount({ seed: { row: r1, value: {} } });
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    act(() => h.draft.set({ a: "x" }));
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
    act(() => h.draft.set({ a: "xy" }));
    window.dispatchEvent(new Event("pagehide"));
    await settle(0);
    expect(h.s.update.mock.calls.at(-1)).toEqual([r1, { a: "xy" }, { keepalive: true }]);
  });

  it("starts again on a new revision, saying edits were dropped", async () => {
    const h = mount({ revision: "a" });
    act(() => h.draft.set({ a: "typed" }));
    const sent: Row = { id: "r9", answers: { a: "server" }, status: "sent" };
    h.rerender({ revision: "r9:sent", seed: { row: sent, value: sent.answers } });
    expect(h.draft).toMatchObject({ value: { a: "server" }, discarded: true, key: 1 });
  });

  it("writes nothing while disabled", async () => {
    const h = mount({ enabled: false });
    act(() => h.draft.set({ a: "x" }));
    await settle();
    expect(h.s.calls).toEqual([]);
    expect(h.draft.status).toBe("stopped");
    const blocked = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(false);
  });

  it("uses the latest callbacks, not the first render's", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const h = mount({ onSaved: first });
    h.rerender({ onSaved: second });
    act(() => h.draft.set({ a: "x" }));
    await settle();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
