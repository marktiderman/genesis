import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createForm, defineForm, f, replay, when } from "@marktiderman/genesis-forms";
import {
  CoveragePanel,
  FlowMapPanel,
  Inspector,
  LogicTracePanel,
  buildFlowGraph,
  layoutFlowGraph,
  witnessEvents,
} from "../index";

const afterClass = defineForm({
  id: "after-class",
  title: "After class",
  layout: { mode: "focus" },
  blocks: [
    f.rating("overall", { label: "Overall", required: true }),
    f.multiChoice("went_well", {
      label: "Went well",
      options: [
        { value: "coaching", label: "Coaching" },
        { value: "workout", label: "Workout" },
      ],
    }),
    f.longText("improve", { label: "Improve" }),
    f.yesNo("contact_me", { label: "Contact?" }),
    f.email("email", { label: "Email", required: true }),
  ],
  logic: [
    when("contact_me").isNot(true).hide("email"),
    when("overall").lessThan(4).jumpTo("improve"),
  ],
  endings: [{ id: "default", title: "Thanks!" }],
});

const pulse = defineForm({
  id: "pulse",
  title: "Pulse",
  blocks: [f.nps("recommend", { label: "Recommend?", required: true }), f.longText("why", { label: "Why?" })],
  logic: [when("recommend").atLeast(9).jumpTo({ ending: "promoter" })],
  endings: [
    { id: "default", title: "Thanks." },
    { id: "promoter", title: "Bring a friend!" },
  ],
});

const engineFor = (form: typeof afterClass | typeof pulse) => createForm(form.definition, { clock: () => undefined });
const status = (graph: ReturnType<typeof buildFlowGraph>) =>
  Object.fromEntries(graph.nodes.map((n) => [n.id, n.status]));
const activeEdges = (graph: ReturnType<typeof buildFlowGraph>) =>
  graph.edges.filter((e) => e.active).map((e) => e.id);

describe("buildFlowGraph", () => {
  it("has a node per step and ending, next edges, and jump edges labelled by their condition", () => {
    const graph = buildFlowGraph(afterClass.definition);
    expect(graph.nodes.map((n) => n.id)).toEqual([
      "overall",
      "went_well",
      "improve",
      "contact_me",
      "email",
      "ending:default",
    ]);
    expect(graph.edges.filter((e) => e.kind === "next").map((e) => [e.source, e.target])).toEqual([
      ["overall", "went_well"],
      ["went_well", "improve"],
      ["improve", "contact_me"],
      ["contact_me", "email"],
      ["email", "ending:default"],
    ]);
    const jump = graph.edges.find((e) => e.kind === "jump");
    expect(jump).toMatchObject({ source: "overall", target: "improve", label: "overall is less than 4", ruleId: "r2" });
    expect(graph.nodes.every((n) => n.status === "idle")).toBe(true);
    expect(activeEdges(graph)).toEqual([]);
  });

  it("follows the respondent's path: a low rating takes the jump and skips went_well", () => {
    const engine = engineFor(afterClass);
    engine.setValue("overall", 2);
    const graph = buildFlowGraph(afterClass.definition, engine.getState());
    expect(status(graph)).toEqual({
      overall: "current",
      went_well: "skipped",
      improve: "path",
      contact_me: "path",
      email: "hidden",
      "ending:default": "path",
    });
    // The path passes over the hidden email block on its way to the ending.
    expect(activeEdges(graph)).toEqual(["next:improve", "next:contact_me", "next:email", "jump:r2"]);
  });

  it("takes the next edges for a high rating, and moves with the block on screen", () => {
    const engine = engineFor(afterClass);
    engine.setValue("overall", 5);
    engine.setValue("contact_me", true);
    engine.next();
    const graph = buildFlowGraph(afterClass.definition, engine.getState());
    expect(status(graph)).toMatchObject({ overall: "path", went_well: "current", email: "path" });
    expect(activeEdges(graph)).toEqual(["next:overall", "next:went_well", "next:improve", "next:contact_me", "next:email"]);
  });

  it("highlights a jump to an ending, and marks the ending reached once submitted", () => {
    const engine = engineFor(pulse);
    engine.setValue("recommend", 10);
    let graph = buildFlowGraph(pulse.definition, engine.getState());
    expect(activeEdges(graph)).toEqual(["jump:r1"]);
    expect(status(graph)).toMatchObject({ why: "skipped", "ending:promoter": "path", "ending:default": "idle" });
    engine.submit();
    graph = buildFlowGraph(pulse.definition, engine.getState());
    expect(status(graph)).toMatchObject({ recommend: "path", "ending:promoter": "current" });
  });

  it("adds an end node when the form defines no endings, and leaves out backward jumps", () => {
    const form = defineForm({
      id: "bare",
      title: "Bare",
      blocks: [f.shortText("a", { label: "A" }), f.shortText("b", { label: "B" })],
    });
    const definition = {
      ...form.definition,
      logic: [{ id: "back", when: { op: "answered" as const, left: { field: "b" } }, effect: "jump" as const, from: "b", to: "a" }],
    };
    const graph = buildFlowGraph(definition);
    expect(graph.nodes.at(-1)).toMatchObject({ id: "end", kind: "ending" });
    expect(graph.edges.map((e) => e.id)).toEqual(["next:a", "next:b"]);
  });
});

describe("layoutFlowGraph", () => {
  it("lays blocks out top to bottom and routes every edge", () => {
    const graph = buildFlowGraph(afterClass.definition);
    const placed = layoutFlowGraph(graph);
    const ys = ["overall", "went_well", "improve", "contact_me", "email", "ending:default"].map((id) => placed.nodes[id]!.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    for (const e of graph.edges) expect(placed.edges[e.id]!.points.length).toBeGreaterThan(1);
    expect(placed.edges["jump:r2"]!.label).toBeDefined();
  });
});

describe("FlowMapPanel", () => {
  it("renders the graph and updates as the respondent answers", () => {
    const engine = engineFor(afterClass);
    render(<FlowMapPanel engine={engine} />);
    expect(screen.getByTestId("devtools-flow").textContent).toMatch(/Now at overall/);
    act(() => {
      engine.setValue("overall", 5);
      engine.next();
    });
    expect(screen.getByTestId("devtools-flow").textContent).toMatch(/Now at went_well/);
  });
});

describe("LogicTracePanel", () => {
  it("explains the block on screen by default", () => {
    const engine = engineFor(afterClass);
    render(<LogicTracePanel engine={engine} />);
    expect(screen.getByTestId("devtools-trace-summary").textContent).toBe("Visible: no rule hides it.");
    expect(screen.getByTestId("devtools-trace").textContent).toMatch(/No rule shows or hides overall/);
    expect(screen.getByTestId("devtools-trace").textContent).toMatch(/Unanswered|Invalid/);
  });

  it("lists each rule with its result, and the jump that skipped a block", () => {
    const engine = engineFor(afterClass);
    engine.setValue("overall", 2);
    const { unmount } = render(<LogicTracePanel engine={engine} blockId="email" />);
    const text = screen.getByTestId("devtools-trace").textContent ?? "";
    expect(text).toMatch(/Hidden because contact_me is not Yes\./);
    expect(text).toMatch(/holds/);
    expect(text).toMatch(/Not checked/);
    act(() => engine.setValue("contact_me", true));
    expect(screen.getByTestId("devtools-trace").textContent).toMatch(/Would be hidden if contact_me is not Yes\./);
    unmount();

    render(<LogicTracePanel engine={engine} blockId="went_well" />);
    expect(screen.getByTestId("devtools-trace").textContent).toMatch(
      /Skipped: overall jumps to improve because overall is less than 4\..*Rule r2, from overall to improve\./,
    );
  });
});

describe("CoveragePanel", () => {
  it("reports endings with witnesses and forks the playground to one", () => {
    const onFork = vi.fn();
    render(<CoveragePanel definition={pulse.definition} onFork={onFork} />);
    expect(screen.getByTestId("coverage-ending-promoter").textContent).toMatch(/reached/);
    expect(screen.getByTestId("devtools-coverage").textContent).toMatch(/Every block is reachable/);
    expect(screen.getByText("Complete")).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: "Load witness" });
    fireEvent.click(buttons[1]!);
    const [events] = onFork.mock.calls[0]!;
    expect(events.at(-1)).toEqual({ type: "submit" });
    expect(replay(pulse.definition, events).getState()).toMatchObject({ status: "completed", ending: "promoter" });
  });

  it("lists unreachable blocks, rules that never fire and endings not reached", () => {
    const form = defineForm({
      id: "dead",
      title: "Dead",
      blocks: [f.yesNo("ok", { label: "OK?", required: true }), f.shortText("never", { label: "Never" })],
      logic: [when("ok").isAnswered().jumpTo({ ending: "done" })],
      endings: [
        { id: "default", title: "Default" },
        { id: "done", title: "Done" },
      ],
    });
    render(<CoveragePanel definition={form.definition} />);
    expect(screen.getByTestId("coverage-ending-default").textContent).toMatch(/not reached/);
    expect(screen.getByTestId("devtools-coverage").textContent).toMatch(/Unreachable blocks.*never/);
    expect(screen.queryByRole("button", { name: "Load witness" })).toBeNull();
  });

  it("waits for Run on large forms and shows when the search was truncated", () => {
    render(<CoveragePanel definition={afterClass.definition} autoRunFields={2} maxStates={3} />);
    expect(screen.queryByTestId("coverage-ending-default")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Run coverage" }));
    expect(screen.getByText(/Truncated/)).toBeTruthy();
  });

  it("turns a witness into answer events by field id", () => {
    expect(witnessEvents(afterClass.definition, { overall: 2 })).toEqual([
      { type: "answer", field: "overall", value: 2 },
      { type: "submit" },
    ]);
  });
});

describe("Inspector extraTabs", () => {
  it("hosts the new panels", () => {
    const engine = engineFor(afterClass);
    render(
      <Inspector
        engine={engine}
        defaultTab="coverage"
        extraTabs={[
          { id: "flow", label: "Flow map", content: <FlowMapPanel engine={engine} /> },
          { id: "trace", label: "Logic trace", content: <LogicTracePanel engine={engine} /> },
          { id: "coverage", label: "Coverage", content: <CoveragePanel definition={engine.definition} /> },
        ]}
      />,
    );
    expect(screen.getByRole("tab", { name: "Flow map" })).toBeTruthy();
    expect(screen.getByTestId("devtools-coverage")).toBeTruthy();
  });
});
