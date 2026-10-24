/**
 * The `requires` graph checks shared by the feature registry
 * (`defineFeatures`) and blocks (`resolveBlocks`). No zod here: blocks import
 * this from a platform-neutral entry that ships to phones.
 */

/** A node with the ids it needs. */
export interface RequiresNode {
  readonly requires?: readonly string[];
}

export interface RequiresProblemsOptions {
  /** What a node is called in messages: `feature` or `block`. */
  noun: string;
  /** Whether an id may be required. Default: it is a node of the graph. */
  isKnown?: (id: string) => boolean;
  /** The message for a requirement `isKnown` refuses. Default `"x" is not a <noun>`. */
  unknown?: (req: string, id: string) => string;
  /** Nodes already reported invalid: their edges can't be trusted, so they are skipped. */
  skip?: ReadonlySet<string>;
}

/**
 * Self-requirements, unknown requirements and cycles through `requires`, as
 * problem strings (`a.requires: …`). Each cycle is reported once, from where
 * the depth-first search found it: `a.requires: a cycle: a → b → a`.
 *
 * @stability Beta
 */
export function requiresProblems(nodes: Readonly<Record<string, RequiresNode>>, options: RequiresProblemsOptions): string[] {
  const { skip = new Set<string>() } = options;
  const problems: string[] = [];
  for (const [id, node] of Object.entries(nodes)) {
    if (skip.has(id)) continue;
    for (const req of node.requires ?? []) {
      const problem = requirementProblem(nodes, id, req, options);
      if (problem) problems.push(problem);
    }
  }
  return [...problems, ...cycleProblems(nodes, skip)];
}

/** One requirement's problem (itself, or an unknown id), or undefined when it is fine. @stability Beta */
export function requirementProblem(
  nodes: Readonly<Record<string, RequiresNode>>,
  id: string,
  req: string,
  options: RequiresProblemsOptions,
): string | undefined {
  const known = options.isKnown ?? ((r: string) => Object.hasOwn(nodes, r));
  if (req === id) return `${id}.requires: a ${options.noun} can't require itself`;
  if (!known(req)) return `${id}.requires: ${options.unknown ? options.unknown(req, id) : `"${req}" is not a ${options.noun}`}`;
  return undefined;
}

/** Cycles through `requires`, each reported once, from where the depth-first search found it. @stability Beta */
export function cycleProblems(nodes: Readonly<Record<string, RequiresNode>>, skip: ReadonlySet<string> = new Set()): string[] {
  const has = (id: string) => Object.hasOwn(nodes, id);
  const problems: string[] = [];
  const state = new Map<string, "open" | "done">();
  const visit = (id: string, path: string[]): void => {
    state.set(id, "open");
    if (skip.has(id)) return;
    for (const req of nodes[id]?.requires ?? []) {
      if (!has(req) || req === id) continue;
      if (state.get(req) === "open") problems.push(`${id}.requires: a cycle: ${[...path.slice(path.indexOf(req)), id, req].join(" → ")}`);
      else if (!state.has(req)) visit(req, [...path, id]);
    }
    state.set(id, "done");
  };
  for (const id of Object.keys(nodes)) if (!state.has(id)) visit(id, []);
  return problems;
}

/**
 * The ids in dependency order (what a node requires comes first), ties kept
 * in the given order. Requirements outside `nodes` are ignored. Assumes no
 * cycles ({@link requiresProblems} reports them).
 */
export function dependencyOrder(nodes: Readonly<Record<string, RequiresNode>>): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const req of nodes[id]?.requires ?? []) if (Object.hasOwn(nodes, req)) visit(req);
    order.push(id);
  };
  for (const id of Object.keys(nodes)) visit(id);
  return order;
}
