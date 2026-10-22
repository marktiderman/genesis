import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createForm, defineForm, f, replay, type FormDefinition, type FormEvent } from "@marktiderman/genesis-forms";
import { ErrorBoundary, Inspector, MAX_SHARE_BYTES, ServerPanel, StatePanel, TimelinePanel, decodeShare, encodeShare, pretty } from "../index";

const raw = async (value: unknown) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const nested = (depth: number) => `${"[".repeat(depth)}${"]".repeat(depth)}`;

const comment = defineForm({
  id: "c",
  title: "C",
  blocks: [f.rating("overall", { label: "Overall" }), f.longText("improve", { label: "Improve" })],
});

const secret: FormDefinition = {
  schemaVersion: 1,
  id: "s",
  title: "S",
  blocks: [
    { kind: "field", id: "f_ssn", key: "ssn", type: "short-text", label: "SSN", props: { sensitive: true } },
    { kind: "field", id: "f_pin", key: "pin", type: "short-text", label: "PIN", sensitive: true } as FormDefinition["blocks"][number],
    { kind: "field", id: "f_name", key: "name", type: "short-text", label: "Name" },
  ],
};

describe("finding 1: hostile depth", () => {
  it("decodeShare rejects event values and context nested past 32 levels", async () => {
    const def = JSON.stringify(comment.definition);
    const withValue = (depth: number) =>
      `{"v":1,"definition":${def},"events":[{"type":"answer","field":"improve","value":${nested(depth)}}]}`;
    expect(await decodeShare(await raw(withValue(32)))).not.toBeNull();
    expect(await decodeShare(await raw(withValue(33)))).toBeNull();
    expect(await decodeShare(await raw(withValue(200_000)))).toBeNull();
    const withContext = (depth: number) => `{"v":1,"definition":${def},"context":{"x":${nested(depth)}}}`;
    expect(await decodeShare(await raw(withContext(32)))).not.toBeNull();
    expect(await decodeShare(await raw(withContext(33)))).toBeNull();
  });

  it("pretty() cuts deep, circular and huge values instead of throwing", () => {
    const deep = JSON.parse(nested(100_000)) as unknown;
    expect(() => pretty(deep)).not.toThrow();
    expect(pretty(deep)).toMatch(/nested too deep/);
    const loop: Record<string, unknown> = { a: 1 };
    loop.self = loop;
    expect(pretty(loop)).toMatch(/circular/);
    const huge = pretty({ text: "x".repeat(500_000) });
    expect(huge.length).toBeLessThan(101_000);
    expect(huge).toMatch(/truncated \(\d+ more characters\)/);
    expect(pretty(Array.from({ length: 5000 }, (_, i) => i))).toMatch(/4000 more items/);
  });

  it("the inspector shows a readable error when a tab throws", () => {
    const Boom = () => {
      throw new Error("kaboom");
    };
    const engine = createForm(comment.definition, { clock: () => undefined });
    const quiet = console.error;
    console.error = () => {};
    try {
      render(<Inspector engine={engine} defaultTab="boom" extraTabs={[{ id: "boom", label: "Boom", content: <Boom /> }]} />);
    } finally {
      console.error = quiet;
    }
    expect(screen.getByRole("alert").textContent).toMatch(/could not be shown.*kaboom/);
    expect(screen.getByText("Inspector")).toBeTruthy();
  });

  it("ErrorBoundary recovers when its reset key changes", () => {
    const Maybe = ({ fail }: { fail: boolean }) => {
      if (fail) throw new Error("bad load");
      return <p>fine</p>;
    };
    const quiet = console.error;
    console.error = () => {};
    try {
      const { rerender } = render(
        <ErrorBoundary resetKey={1} label="The form">
          <Maybe fail />
        </ErrorBoundary>,
      );
      expect(screen.getByRole("alert").textContent).toMatch(/The form could not be shown/);
      rerender(
        <ErrorBoundary resetKey={2} label="The form">
          <Maybe fail={false} />
        </ErrorBoundary>,
      );
    } finally {
      console.error = quiet;
    }
    expect(screen.getByText("fine")).toBeTruthy();
  });
});

describe("finding 2: long answers in share links", () => {
  it("a 2,000-character comment typed keystroke by keystroke round-trips", async () => {
    const engine = createForm(comment.definition, { clock: () => undefined });
    const text = "The 6am class was great but the warm-up felt rushed and ".repeat(50).slice(0, 2000);
    for (let i = 1; i <= text.length; i++) engine.setValue("improve", text.slice(0, i));
    const events = engine.getState().events;
    expect(events.length).toBe(2000);
    const back = await decodeShare(await encodeShare({ v: 1, definition: comment.definition, events }));
    expect(back?.events).toEqual([{ type: "answer", field: "improve", value: text }]);
    expect(replay(comment.definition, back!.events!).getState().values.improve).toBe(text);
  });

  it("keeps answers that are not consecutive", async () => {
    const events: FormEvent[] = [
      { type: "answer", field: "overall", value: 1 },
      { type: "answer", field: "improve", value: "a" },
      { type: "answer", field: "overall", value: 2 },
      { type: "answer", field: "overall", value: 3 },
    ];
    const back = await decodeShare(await encodeShare({ v: 1, definition: comment.definition, events }));
    expect(back?.events?.map((e) => (e.type === "answer" ? e.value : e.type))).toEqual([1, "a", 3]);
  });

  it("encodeShare throws a clear error above MAX_SHARE_BYTES", async () => {
    const big = { ...comment.definition, description: "a".repeat(MAX_SHARE_BYTES) };
    await expect(encodeShare({ v: 1, definition: big })).rejects.toThrow(/too large to share as a link/);
  });
});

describe("findings 4/5: sensitive fields", () => {
  const events: FormEvent[] = [
    { type: "answer", field: "f_ssn", value: "123-45-6789" },
    { type: "answer", field: "f_pin", value: "9999" },
    { type: "answer", field: "f_name", value: "Dana" },
  ];

  it("encodeShare blanks fields marked sensitive at the top level or in props", async () => {
    const back = await decodeShare(await encodeShare({ v: 1, definition: secret, events }));
    expect(back?.events).toEqual([
      { type: "answer", field: "f_ssn", value: null },
      { type: "answer", field: "f_pin", value: null },
      { type: "answer", field: "f_name", value: "Dana" },
    ]);
  });

  const filled = () => replay(secret, events);

  it("masks sensitive values in the state, timeline and server panels", () => {
    for (const panel of [
      <StatePanel key="s" engine={filled()} />,
      <TimelinePanel key="t" engine={filled()} />,
      <ServerPanel key="v" engine={filled()} context={{}} />,
    ]) {
      const { container, unmount } = render(panel);
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/123-45-6789|9999/);
      expect(text).toMatch(/•••• \(sensitive\)/);
      expect(text).toMatch(/Dana/);
      unmount();
    }
  });

  it("the inspector reveals them only when asked", () => {
    render(<Inspector engine={filled()} />);
    expect(screen.getByTestId("devtools-state").textContent).not.toMatch(/123-45-6789/);
    fireEvent.click(screen.getByRole("switch", { name: "Reveal sensitive values" }));
    expect(screen.getByTestId("devtools-state").textContent).toMatch(/123-45-6789/);
  });

  it("forms without sensitive fields have no reveal switch", () => {
    render(<Inspector engine={createForm(comment.definition)} />);
    expect(screen.queryByRole("switch", { name: "Reveal sensitive values" })).toBeNull();
  });
});

describe("finding 6: stale scrub cursor", () => {
  const ev = (n: number, tag = "v"): FormEvent[] =>
    Array.from({ length: n }, (_, i) => ({ type: "answer", field: "improve", value: `${tag}${i}` }));
  const label = () => screen.getByTestId("devtools-timeline").querySelector("label")!.textContent;

  it("resets after Start over, even when the new log grows back into the old one", () => {
    const { rerender } = render(<TimelinePanel engine={replay(comment.definition, ev(3))} onFork={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Step back" }));
    fireEvent.click(screen.getByRole("button", { name: "Step back" }));
    expect(label()).toMatch(/Event 1 of 3 \(scrubbing\)/);
    rerender(<TimelinePanel engine={replay(comment.definition, [])} onFork={() => {}} />);
    expect(label()).toBe("Event 0 of 0");
    rerender(<TimelinePanel engine={replay(comment.definition, ev(4))} onFork={() => {}} />);
    expect(label()).toBe("Event 4 of 4");
  });

  it("resets when a link replaces the log, and survives the log being extended", () => {
    const { rerender } = render(<TimelinePanel engine={replay(comment.definition, ev(3))} />);
    fireEvent.click(screen.getByRole("button", { name: "Step back" }));
    // The playground rebuilds the engine on every frame message: an extension keeps the cursor.
    rerender(<TimelinePanel engine={replay(comment.definition, ev(5))} />);
    expect(label()).toMatch(/Event 2 of 5 \(scrubbing\)/);
    // A loaded link: a different log of the same length or longer.
    rerender(<TimelinePanel engine={replay(comment.definition, ev(6, "link"))} />);
    expect(label()).toBe("Event 6 of 6");
  });
});

describe("finding 8: timestamps", () => {
  it("encodeShare strips `at` unless includeTimestamps is set", async () => {
    const events: FormEvent[] = [
      { type: "answer", field: "overall", value: 2, at: 1_700_000_000_000 },
      { type: "submit", at: 1_700_000_005_000 },
    ];
    const plain = await decodeShare(await encodeShare({ v: 1, definition: comment.definition, events }));
    expect(plain?.events).toEqual([{ type: "answer", field: "overall", value: 2 }, { type: "submit" }]);
    const kept = await decodeShare(
      await encodeShare({ v: 1, definition: comment.definition, events }, { includeTimestamps: true }),
    );
    expect(kept?.events).toEqual(events);
  });
});

describe("finding 12: timeline list cap", () => {
  it("shows the last 200 events and expands on request", () => {
    const events: FormEvent[] = Array.from({ length: 250 }, (_, i) => ({ type: "answer", field: "overall", value: i % 5 }));
    render(<TimelinePanel engine={replay(comment.definition, events)} />);
    const items = () => screen.getByTestId("devtools-timeline").querySelectorAll("ol > li");
    expect(items().length).toBe(201);
    expect(items()[1]!.textContent).toMatch(/^51\. /);
    act(() => fireEvent.click(screen.getByRole("button", { name: /50 earlier events/ })));
    expect(items().length).toBe(250);
  });
});

describe("sensitive hidden inputs (CodeRabbit round 4)", () => {
  const withMember = defineForm({
    id: "member-hidden",
    title: "Member",
    hidden: {
      member: f.hidden.string({ source: "server", sensitive: true }),
      ref: f.hidden.string({ source: "url", sensitive: true }),
      coach: f.hidden.string({ source: "server" }),
    },
    blocks: [f.rating("overall", { label: "How was it?", required: true })],
  });
  const done = () =>
    replay(withMember.definition, [{ type: "answer", field: "overall", value: 4 }, { type: "submit" }], {
      hidden: { member: "user-42", ref: "flyer-7", coach: "Sam" },
    });

  it("masks them in the state and server panels, hidden and context alike", () => {
    for (const panel of [
      <StatePanel key="s" engine={done()} />,
      <ServerPanel key="v" engine={done()} context={{ member: "user-42", coach: "Sam" }} />,
    ]) {
      const { container, unmount } = render(panel);
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/user-42|flyer-7/);
      expect(text).toMatch(/Sam/);
      unmount();
    }
  });

  it("shows the reveal switch for a form whose only sensitive data is a hidden input", () => {
    render(<Inspector engine={done()} context={{ member: "user-42" }} />);
    expect(screen.getByTestId("devtools-state").textContent).not.toMatch(/user-42/);
    fireEvent.click(screen.getByRole("switch", { name: "Reveal sensitive values" }));
    expect(screen.getByTestId("devtools-state").textContent).toMatch(/user-42/);
  });
});

describe("share links blank sensitive hidden inputs in context (CodeRabbit on #40)", () => {
  it("nulls a sensitive context entry even with includeContext", async () => {
    const def = defineForm({
      id: "ctx", title: "Ctx",
      hidden: { member: f.hidden.string({ source: "server", sensitive: true }), coach: f.hidden.string({ source: "server" }) },
      blocks: [f.rating("r", { label: "R" })],
    }).definition;
    const back = await decodeShare(
      await encodeShare({ v: 1, definition: def, context: { member: "user-42", coach: "Sam" } }, { includeContext: true }),
    );
    expect(back?.context).toEqual({ member: null, coach: "Sam" });
  });
});
