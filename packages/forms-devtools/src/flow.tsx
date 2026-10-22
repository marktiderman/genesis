import { memo, useMemo, type CSSProperties } from "react";
import { Graph, layout } from "@dagrejs/dagre";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { cn } from "@marktiderman/genesis-ui/utils";
import {
  computePath,
  describeCondition,
  evaluate,
  ruleVisible,
  steps,
  type FieldBlock,
  type FormDefinition,
  type FormEngine,
  type FormState,
  type LogicRule,
} from "@marktiderman/genesis-forms";
import { useFormSelector } from "@marktiderman/genesis-forms-react";

/**
 * - `current`: on screen. `path`: on the respondent's path (or the ending it leads to).
 * - `hidden`: hidden by a show/hide rule. `skipped`: visible by rules, but jumped over.
 * - `idle`: no state given, or an ending the path does not lead to.
 */
export type FlowNodeStatus = "current" | "path" | "hidden" | "skipped" | "idle";

export interface FlowNode {
  id: string;
  kind: "field" | "content" | "ending";
  /** Field key, content text, or ending title. */
  label: string;
  /** Field type, content type, or "ending". */
  detail: string;
  status: FlowNodeStatus;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  /** `next`: the block that follows in order. `jump`: a jump rule. */
  kind: "next" | "jump";
  /** Jumps only: the condition, in plain English. */
  label?: string;
  ruleId?: string;
  /** On the respondent's current path. */
  active: boolean;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export type FlowGraphState = Pick<FormState, "path" | "current" | "values" | "hidden" | "status" | "ending">;

type JumpRule = Extract<LogicRule, { effect: "jump" }>;

/** Node id of an ending; `end` when the form defines no endings. */
export const endingNodeId = (ending: string | null) => (ending === null ? "end" : `ending:${ending}`);

const clip = (text: string, max = 36) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * The form as a graph: one node per step and ending, an edge to the next
 * block in order and one per jump rule. With `state`, nodes and edges carry
 * the respondent's path, the same way `computePath` walks it.
 */
export function buildFlowGraph(definition: FormDefinition, state?: FlowGraphState): FlowGraph {
  const list = steps(definition);
  const ids = list.map((b) => b.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const fields = new Map(
    definition.blocks.filter((b): b is FieldBlock => b.kind === "field").map((b) => [b.id, b]),
  );
  const endings = definition.endings ?? [];
  const defaultEnding = endings.find((e) => e.id === "default")?.id ?? endings[0]?.id ?? null;
  const terminal = endingNodeId(defaultEnding);
  const jumps = (definition.logic ?? []).filter((r): r is JumpRule => r.effect === "jump");
  const scope = state ? { values: state.values, hidden: state.hidden, fields } : null;
  const onPath = new Set(state?.path ?? []);

  const edges: FlowEdge[] = ids.map((id, i) => ({
    id: `next:${id}`,
    source: id,
    target: ids[i + 1] ?? terminal,
    kind: "next",
    active: false,
  }));
  for (const rule of jumps) {
    const from = index.get(rule.from);
    if (from === undefined) continue;
    let target: string;
    if (typeof rule.to === "object") {
      if (!endings.some((e) => typeof rule.to === "object" && e.id === rule.to.ending)) continue;
      target = endingNodeId(rule.to.ending);
    } else {
      const to = index.get(rule.to);
      // computePath ignores backward jumps, and parseForm reports them.
      if (to === undefined || to <= from) continue;
      target = rule.to;
    }
    edges.push({
      id: `jump:${rule.id}`,
      source: rule.from,
      target,
      kind: "jump",
      label: describeCondition(rule.when, definition),
      ruleId: rule.id,
      active: false,
    });
  }

  const active = new Set<string>();
  let reached: string | null = null;
  if (state && scope) {
    const path = state.path;
    reached = terminal;
    for (let k = 0; k < path.length; k++) {
      const from = path[k]!;
      const i = index.get(from);
      if (i === undefined) continue;
      const jump = jumps.find((r) => r.from === from && evaluate(r.when, scope));
      let cursor: number;
      if (jump && typeof jump.to === "object") {
        active.add(`jump:${jump.id}`);
        reached = endingNodeId(jump.to.ending);
        break;
      }
      const to = jump && typeof jump.to === "string" ? index.get(jump.to) : undefined;
      if (jump && to !== undefined && to > i) {
        active.add(`jump:${jump.id}`);
        cursor = to;
      } else {
        active.add(`next:${from}`);
        cursor = i + 1;
      }
      // Walk over blocks hidden by rules until the next block on the path.
      const stop = k + 1 < path.length ? (index.get(path[k + 1]!) ?? ids.length) : ids.length;
      while (cursor < stop) active.add(`next:${ids[cursor++]!}`);
    }
    if (state.status === "completed") reached = endingNodeId(state.ending);
  }

  const statusOf = (id: string): FlowNodeStatus => {
    if (!state || !scope) return "idle";
    if (state.status !== "completed" && state.current === id) return "current";
    if (onPath.has(id)) return "path";
    return ruleVisible(definition, id, scope) ? "skipped" : "hidden";
  };

  const nodes: FlowNode[] = list.map((b) => ({
    id: b.id,
    kind: b.kind === "field" ? "field" : "content",
    label: b.kind === "field" ? b.key : b.kind === "content" ? clip(b.text) : b.id,
    detail: b.kind === "field" ? b.type : b.kind === "content" ? b.type : "page-break",
    status: statusOf(b.id),
  }));
  const endingNodes = endings.length ? endings.map((e) => ({ id: endingNodeId(e.id), title: e.title })) : [{ id: "end", title: "End of form" }];
  for (const e of endingNodes) {
    const status: FlowNodeStatus =
      reached !== e.id ? "idle" : state?.status === "completed" ? "current" : "path";
    nodes.push({ id: e.id, kind: "ending", label: clip(e.title), detail: "ending", status });
  }

  return { nodes, edges: edges.map((e) => ({ ...e, active: active.has(e.id) })) };
}

// ── Layout ───────────────────────────────────────────────────────────────────

export const FLOW_NODE_WIDTH = 200;
export const FLOW_NODE_HEIGHT = 52;

interface Point {
  x: number;
  y: number;
}

export interface FlowLayout {
  nodes: Record<string, Point>;
  /** Dagre's route for each edge, and where its label sits. */
  edges: Record<string, { points: Point[]; label?: Point }>;
}

/** Top-to-bottom dagre layout. Positions are node centers. Depends only on the graph's shape. */
export function layoutFlowGraph(graph: FlowGraph): FlowLayout {
  const g = new Graph({ multigraph: true });
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 56, edgesep: 24, marginx: 16, marginy: 16 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of graph.nodes) g.setNode(n.id, { width: FLOW_NODE_WIDTH, height: FLOW_NODE_HEIGHT });
  for (const e of graph.edges) {
    const label = e.label ? { width: Math.min(220, 12 + e.label.length * 6), height: 22, labelpos: "c" } : {};
    g.setEdge(e.source, e.target, label, e.id);
  }
  layout(g);
  const nodes: FlowLayout["nodes"] = {};
  for (const n of graph.nodes) {
    const { x, y } = g.node(n.id);
    nodes[n.id] = { x, y };
  }
  const edges: FlowLayout["edges"] = {};
  for (const e of graph.edges) {
    const routed = g.edge({ v: e.source, w: e.target, name: e.id }) as { points?: Point[]; x?: number; y?: number };
    edges[e.id] = {
      points: routed.points ?? [],
      ...(e.label && routed.x !== undefined && routed.y !== undefined ? { label: { x: routed.x, y: routed.y } } : {}),
    };
  }
  return { nodes, edges };
}

// ── Rendering ────────────────────────────────────────────────────────────────

type BlockNode = Node<{ node: FlowNode }, "block">;
type RoutedEdge = Edge<{ edge: FlowEdge; points: Point[]; labelAt?: Point }, "routed">;

const NODE_CLASS: Record<FlowNodeStatus, string> = {
  current: "border-primary bg-primary/10 ring-2 ring-primary",
  path: "border-primary bg-card",
  skipped: "border-dashed bg-card opacity-60",
  hidden: "border-dashed bg-muted opacity-40",
  idle: "bg-card",
};

const BlockNodeView = memo(function BlockNodeView({ data }: NodeProps<BlockNode>) {
  const { node } = data;
  return (
    <div
      className={cn(
        "flex flex-col justify-center rounded-md border px-3 text-foreground shadow-sm",
        node.kind === "ending" && "rounded-full",
        NODE_CLASS[node.status],
      )}
      style={{ width: FLOW_NODE_WIDTH, height: FLOW_NODE_HEIGHT }}
      data-status={node.status}
      data-testid={`flow-node-${node.id}`}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" isConnectable={false} />
      <span className="truncate text-sm font-medium">{node.label}</span>
      <span className="truncate text-xs text-muted-foreground">
        {node.detail}
        {node.status === "hidden" ? " · hidden" : node.status === "skipped" ? " · skipped" : ""}
        {node.status === "current" ? (node.kind === "ending" ? " · reached" : " · on screen") : ""}
      </span>
      <Handle type="source" position={Position.Bottom} className="opacity-0" isConnectable={false} />
    </div>
  );
});

function pathThrough(points: Point[]): string {
  if (points.length < 2) return "";
  const [first, ...rest] = points;
  let d = `M ${first!.x} ${first!.y}`;
  for (let i = 0; i < rest.length - 1; i++) {
    const p = rest[i]!;
    const q = rest[i + 1]!;
    d += ` Q ${p.x} ${p.y} ${(p.x + q.x) / 2} ${(p.y + q.y) / 2}`;
  }
  const last = rest[rest.length - 1]!;
  return `${d} L ${last.x} ${last.y}`;
}

function arrowHead(points: Point[]): string {
  const tip = points[points.length - 1];
  const from = points[points.length - 2];
  if (!tip || !from) return "";
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const at = (a: number) => `${tip.x - 8 * Math.cos(a)},${tip.y - 8 * Math.sin(a)}`;
  return `${tip.x},${tip.y} ${at(angle - 0.45)} ${at(angle + 0.45)}`;
}

const RoutedEdgeView = memo(function RoutedEdgeView({ id, data }: EdgeProps<RoutedEdge>) {
  if (!data) return null;
  const { edge, points, labelAt } = data;
  const tone = edge.active ? "stroke-primary fill-primary" : "stroke-muted-foreground fill-muted-foreground";
  return (
    <>
      <BaseEdge
        id={id}
        path={pathThrough(points)}
        className={cn(tone, "fill-none", edge.active ? "stroke-2" : "opacity-50", edge.kind === "jump" && "[stroke-dasharray:6_4]")}
      />
      <polygon points={arrowHead(points)} className={cn(tone, !edge.active && "opacity-50")} />
      {edge.label && labelAt ? (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "absolute max-w-[220px] truncate rounded border bg-background px-1.5 py-0.5 text-[11px] text-foreground",
              edge.active ? "border-primary" : "text-muted-foreground",
            )}
            style={{ transform: `translate(-50%, -50%) translate(${labelAt.x}px, ${labelAt.y}px)` }}
            title={edge.label}
            data-testid={`flow-edge-label-${edge.id}`}
          >
            {edge.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});

const nodeTypes = { block: BlockNodeView };
const edgeTypes = { routed: RoutedEdgeView };

const layoutKeys = new WeakMap<FormDefinition, number>();
let nextLayoutKey = 0;

/**
 * The form's blocks as a graph, laid out with dagre and drawn with React
 * Flow. The respondent's path and the block on screen are highlighted live;
 * blocks hidden by rules are dimmed. Needs `@xyflow/react/dist/base.css`
 * (the devtools stylesheet imports it).
 */
export function FlowMapPanel({ engine, height = 600, className }: { engine: FormEngine; height?: number | undefined; className?: string | undefined }) {
  const definition = engine.definition;
  const state = useFormSelector(engine, (s) => s);
  const graph = useMemo(() => buildFlowGraph(definition, state), [definition, state]);
  // Positions depend only on the definition, so answering never moves a node.
  const placed = useMemo(() => layoutFlowGraph(buildFlowGraph(definition)), [definition]);
  if (!layoutKeys.has(definition)) layoutKeys.set(definition, nextLayoutKey++);

  const nodes: BlockNode[] = graph.nodes.map((n) => ({
    id: n.id,
    type: "block",
    position: {
      x: (placed.nodes[n.id]?.x ?? 0) - FLOW_NODE_WIDTH / 2,
      y: (placed.nodes[n.id]?.y ?? 0) - FLOW_NODE_HEIGHT / 2,
    },
    data: { node: n },
    draggable: false,
    connectable: false,
  }));
  const edges: RoutedEdge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "routed",
    zIndex: e.active ? 1 : 0,
    data: { edge: e, points: placed.edges[e.id]?.points ?? [], labelAt: placed.edges[e.id]?.label },
  }));

  const current = graph.nodes.find((n) => n.status === "current");
  return (
    <div className={cn("space-y-2", className)} data-testid="devtools-flow">
      <p className="text-sm text-muted-foreground">
        Solid arrows go to the next block, dashed arrows are jumps. {current ? `Now at ${current.label}.` : ""}
      </p>
      <div className="overflow-hidden rounded-md border bg-muted/30" style={{ height }}>
        <ReactFlow
          key={layoutKeys.get(definition)}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          fitView
          fitViewOptions={{ padding: 0.1 }}
          minZoom={0.2}
          aria-label="Form flow map"
          style={{ "--xy-attribution-background-color": "transparent" } as CSSProperties}
        />
      </div>
    </div>
  );
}
