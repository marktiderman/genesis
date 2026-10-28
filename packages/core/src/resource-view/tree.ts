// Tree mode: nested records drawn from a flat list. Each row names its parent; the tree is built
// from the data, never from nested input, so caching and writes stay the flat list's. No React:
// genesis-ui's `useResourceView` holds the state and draws it, and a native list can reuse it.
// docs/RESOURCE-VIEW.md, "Tree mode".

/**
 * A screen's `tree` (`<ResourceView tree={{ getParentId }} />`): rows nest under the row
 * `getParentId` names. Client-side data only: every row is loaded, and children are never
 * fetched on expand.
 */
export interface ResourceTree<T> {
  /** The parent row's key (the same text as the row key), or `null` / `undefined` / `""` for a root. */
  getParentId: (row: T) => string | null | undefined;
  /**
   * Which rows start open (uncontrolled): `true` every parent, a number the parents shallower
   * than that depth (`1` opens the roots), `false` none. Default `false`.
   */
  defaultExpanded?: boolean | number;
  /** The open rows by key, controlled. Leave unset and the screen keeps its own. */
  expanded?: ReadonlySet<string>;
  /** Called with the next open set whenever a row opens or closes. */
  onExpandedChange?: (expanded: Set<string>) => void;
  /** Selecting a row selects its descendants too, and clearing it clears them. Default `false`. */
  cascadeSelect?: boolean;
}

/** How to read the tree out of flat rows. */
export interface TreeOptions<T> {
  /** A row's own id. */
  getId: (row: T) => string;
  /** The parent's id; `null`, `undefined` or `""` for a root. A parent that isn't loaded makes a root too. */
  getParentId: (row: T) => string | null | undefined;
  /**
   * Which nodes are open: their ids, or `"all"`. A closed node's descendants aren't returned.
   * While `match` is set, every ancestor of a match is open regardless, so each match shows.
   */
  expanded: ReadonlySet<string> | "all";
  /**
   * The filter, when one is active: rows that match it, and their ancestors (so a match keeps its
   * context), are kept; everything else is left out. Undefined: no filter, every row is kept.
   */
  match?: (row: T) => boolean;
  /**
   * The sort, applied within each set of siblings (stable: ties keep the rows' order). Without it,
   * siblings keep the rows' order, so a list sorted beforehand is sorted within siblings too.
   */
  compare?: (a: T, b: T) => number;
}

/** One visible row of the tree, in display order. */
export interface TreeNode<T> {
  row: T;
  id: string;
  /** The parent's id as drawn: `null` for a root (a missing parent, or a broken cycle, counts as none). */
  parentId: string | null;
  /** 0 for a root. */
  depth: number;
  /** Whether it has children among the kept rows (so a toggle makes sense). */
  hasChildren: boolean;
  /** Whether it is open. Always false without children. */
  expanded: boolean;
  /** False for an ancestor kept only as a match's context; true otherwise, and always true without a filter. */
  matched: boolean;
  /** 1-based position among its kept siblings, and how many there are (`aria-posinset`, `aria-setsize`). */
  position: number;
  siblings: number;
}

/** What {@link treeRows} returns. */
export interface TreeResult<T> {
  /** The rows to draw, in order: each parent before its children, siblings in input order. */
  visible: TreeNode<T>[];
  /** Every kept row's node by id, collapsed ones included. */
  nodes: ReadonlyMap<string, TreeNode<T>>;
  /** Every descendant of a node among the kept rows, depth-first, collapsed or not. */
  descendants: (id: string) => string[];
  /** The ids of every kept node that has children: "expand all". */
  parents: () => string[];
}

const rootish = (parent: string | null | undefined): parent is null | undefined | "" => parent == null || parent === "";

/**
 * Build the tree from flat rows. Siblings are sorted by `compare`, else keep the rows' order, so
 * either way the sort applies within each set of siblings. A row whose parent isn't among `rows` is a root,
 * and so is a row whose parent would close a cycle (each cycle loses one link). Duplicate ids keep
 * the first row.
 */
export function treeRows<T>(rows: readonly T[], options: TreeOptions<T>): TreeResult<T> {
  const { getId, getParentId, expanded, match, compare } = options;
  const byId = new Map<string, T>();
  const order: string[] = [];
  for (const row of rows) {
    const id = getId(row);
    if (byId.has(id)) continue;
    byId.set(id, row);
    order.push(id);
  }

  // The parent each row hangs from: absent, unloaded or cyclic parents make a root.
  const parentOf = new Map<string, string | null>();
  const resolving = new Set<string>();
  const resolve = (id: string): string | null => {
    if (parentOf.has(id)) return parentOf.get(id)!;
    const raw = getParentId(byId.get(id)!);
    let parent: string | null = rootish(raw) || raw === id || !byId.has(raw) ? null : raw;
    if (parent !== null) {
      resolving.add(id);
      // Walk up: meeting a row still being resolved means a cycle; break it here.
      if (resolving.has(parent)) parent = null;
      else resolve(parent);
      resolving.delete(id);
    }
    parentOf.set(id, parent);
    return parent;
  };
  for (const id of order) resolve(id);
  // A cycle's other members may have resolved through the broken one before it broke: recheck
  // that every chain ends at a root.
  for (const id of order) {
    const seen = new Set<string>([id]);
    let at = parentOf.get(id) ?? null;
    while (at !== null && !seen.has(at)) {
      seen.add(at);
      at = parentOf.get(at) ?? null;
    }
    if (at !== null) parentOf.set(id, null);
  }

  // What the filter keeps: matches, and every ancestor of one.
  let kept: Set<string> | null = null;
  const matched = new Set<string>();
  if (match) {
    kept = new Set();
    for (const id of order) {
      if (!match(byId.get(id)!)) continue;
      matched.add(id);
      for (let at: string | null = id; at !== null && !kept.has(at); at = parentOf.get(at) ?? null) kept.add(at);
    }
  }

  const children = new Map<string | null, string[]>();
  for (const id of order) {
    if (kept && !kept.has(id)) continue;
    const parent = parentOf.get(id) ?? null;
    const list = children.get(parent);
    if (list) list.push(id);
    else children.set(parent, [id]);
  }
  // Sort within siblings only: a child never leaves its parent. Array sort is stable.
  if (compare) for (const list of children.values()) list.sort((a, b) => compare(byId.get(a)!, byId.get(b)!));

  const isOpen = (id: string) => (match ? true : expanded === "all" || expanded.has(id));
  const nodes = new Map<string, TreeNode<T>>();
  const visible: TreeNode<T>[] = [];
  const visit = (parent: string | null, depth: number, shown: boolean) => {
    const ids = children.get(parent) ?? [];
    ids.forEach((id, index) => {
      const hasChildren = (children.get(id)?.length ?? 0) > 0;
      const open = hasChildren && isOpen(id);
      const node: TreeNode<T> = {
        row: byId.get(id)!,
        id,
        parentId: parent,
        depth,
        hasChildren,
        expanded: open,
        matched: match ? matched.has(id) : true,
        position: index + 1,
        siblings: ids.length,
      };
      nodes.set(id, node);
      if (shown) visible.push(node);
      visit(id, depth + 1, shown && open);
    });
  };
  visit(null, 0, true);

  const descendants = (id: string): string[] => {
    const out: string[] = [];
    const walk = (at: string) => {
      for (const child of children.get(at) ?? []) {
        out.push(child);
        walk(child);
      }
    };
    walk(id);
    return out;
  };
  const parents = () => [...nodes.values()].filter((n) => n.hasChildren).map((n) => n.id);
  return { visible, nodes, descendants, parents };
}

/**
 * The open ids a tree starts with: `true` opens every parent, a number opens parents shallower
 * than that depth (`1` opens the roots), `false` or nothing opens none.
 */
export function initialExpanded<T>(rows: readonly T[], options: Omit<TreeOptions<T>, "expanded" | "match">, open: boolean | number | undefined): Set<string> {
  if (!open) return new Set();
  const tree = treeRows(rows, { ...options, expanded: "all" });
  const depth = open === true ? Infinity : open;
  return new Set(tree.parents().filter((id) => tree.nodes.get(id)!.depth < depth));
}

/** The open set with `id` opened or closed: a new set, or the same one when nothing changes. */
export function setExpanded(expanded: ReadonlySet<string>, id: string, open: boolean): ReadonlySet<string> {
  if (expanded.has(id) === open) return expanded;
  const next = new Set(expanded);
  if (open) next.add(id);
  else next.delete(id);
  return next;
}

/**
 * The selection after toggling `id` with cascade: the node and every descendant take the node's
 * new state. Without cascade, use a plain toggle; selection never cascades by default.
 */
export function cascadeSelection(selected: ReadonlySet<string>, id: string, descendants: readonly string[]): Set<string> {
  const next = new Set(selected);
  const on = !selected.has(id);
  for (const at of [id, ...descendants]) {
    if (on) next.add(at);
    else next.delete(at);
  }
  return next;
}
