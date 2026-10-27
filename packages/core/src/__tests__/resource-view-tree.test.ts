// @feat:resource-tree
import { describe, expect, it } from "vitest";
import { cascadeSelection, initialExpanded, setExpanded, treeRows } from "../resource-view";

type League = { id: string; parent_id: string | null; name: string; rank: number };

//  north            (root)
//    north-a
//      north-a-1
//    north-b
//  south            (root)
//    south-a
const ROWS: League[] = [
  { id: "north", parent_id: null, name: "North", rank: 2 },
  { id: "south", parent_id: null, name: "South", rank: 1 },
  { id: "north-b", parent_id: "north", name: "North B", rank: 1 },
  { id: "north-a", parent_id: "north", name: "North A", rank: 2 },
  { id: "north-a-1", parent_id: "north-a", name: "North A One", rank: 1 },
  { id: "south-a", parent_id: "south", name: "South A", rank: 1 },
];

const base = { getId: (r: League) => r.id, getParentId: (r: League) => r.parent_id };
const ids = (nodes: { id: string }[]) => nodes.map((n) => n.id);

describe("treeRows", () => {
  it("builds the tree from a flat list: parents before children, depth from the computed tree", () => {
    const tree = treeRows(ROWS, { ...base, expanded: "all" });
    expect(ids(tree.visible)).toEqual(["north", "north-b", "north-a", "north-a-1", "south", "south-a"]);
    expect(tree.visible.map((n) => n.depth)).toEqual([0, 1, 1, 2, 0, 1]);
    expect(tree.nodes.get("north-a")).toMatchObject({ parentId: "north", hasChildren: true, expanded: true, position: 2, siblings: 2 });
    expect(tree.nodes.get("north-a-1")).toMatchObject({ hasChildren: false, expanded: false, position: 1, siblings: 1 });
  });

  it("applies the sort within siblings: siblings keep the flat list's order", () => {
    const byRank = [...ROWS].sort((a, b) => a.rank - b.rank);
    const tree = treeRows(byRank, { ...base, expanded: "all" });
    // Roots by rank (South 1, North 2); North's children by rank (B 1, A 2); never a child before its parent.
    expect(ids(tree.visible)).toEqual(["south", "south-a", "north", "north-b", "north-a", "north-a-1"]);
  });

  it("sorts within siblings by `compare`, stably, never moving a child from its parent", () => {
    const byName = treeRows(ROWS, { ...base, expanded: "all", compare: (a, b) => a.name.localeCompare(b.name) });
    expect(ids(byName.visible)).toEqual(["north", "north-a", "north-a-1", "north-b", "south", "south-a"]);
    const byRankDesc = treeRows(ROWS, { ...base, expanded: "all", compare: (a, b) => b.rank - a.rank });
    expect(ids(byRankDesc.visible)).toEqual(["north", "north-a", "north-a-1", "north-b", "south", "south-a"]);
    // Ties keep the input order.
    const tie = treeRows(ROWS, { ...base, expanded: "all", compare: () => 0 });
    expect(ids(tie.visible)).toEqual(["north", "north-b", "north-a", "north-a-1", "south", "south-a"]);
  });

  it("shows a closed node's row but none of its descendants", () => {
    const tree = treeRows(ROWS, { ...base, expanded: new Set(["north"]) });
    expect(ids(tree.visible)).toEqual(["north", "north-b", "north-a", "south"]);
    expect(tree.nodes.get("north-a")!.expanded).toBe(false);
    // Collapsed nodes are still known, with their depth.
    expect(tree.nodes.get("north-a-1")!.depth).toBe(2);
    expect(treeRows(ROWS, { ...base, expanded: new Set() }).visible.map((n) => n.id)).toEqual(["north", "south"]);
  });

  it("keeps the ancestors of a filter's matches, opened, and marks them as context", () => {
    const tree = treeRows(ROWS, { ...base, expanded: new Set(), match: (r) => r.name === "North A One" });
    expect(ids(tree.visible)).toEqual(["north", "north-a", "north-a-1"]);
    expect(tree.visible.map((n) => n.matched)).toEqual([false, false, true]);
    expect(tree.visible.every((n) => n.depth === ids(tree.visible).indexOf(n.id))).toBe(true);
    // A match's own non-matching children are left out, as anything else that doesn't match.
    const parentOnly = treeRows(ROWS, { ...base, expanded: "all", match: (r) => r.id === "north-a" });
    expect(ids(parentOnly.visible)).toEqual(["north", "north-a"]);
    expect(parentOnly.nodes.get("north-a")!.hasChildren).toBe(false);
    expect(treeRows(ROWS, { ...base, expanded: "all", match: () => false }).visible).toEqual([]);
  });

  it("makes a row whose parent isn't loaded a root, and breaks a cycle", () => {
    const orphan = treeRows([{ id: "x", parent_id: "gone", name: "X", rank: 1 }], { ...base, expanded: "all" });
    expect(orphan.visible[0]).toMatchObject({ id: "x", parentId: null, depth: 0 });

    const loop: League[] = [
      { id: "a", parent_id: "b", name: "A", rank: 1 },
      { id: "b", parent_id: "a", name: "B", rank: 1 },
      { id: "self", parent_id: "self", name: "Self", rank: 1 },
    ];
    const tree = treeRows(loop, { ...base, expanded: "all" });
    expect(new Set(ids(tree.visible))).toEqual(new Set(["a", "b", "self"]));
    expect(tree.visible.filter((n) => n.depth === 0).length).toBe(2);
    expect(tree.nodes.get("self")!.parentId).toBeNull();
  });

  it("lists descendants and parents, collapsed or not", () => {
    const tree = treeRows(ROWS, { ...base, expanded: new Set() });
    expect(tree.descendants("north")).toEqual(["north-b", "north-a", "north-a-1"]);
    expect(tree.descendants("north-a-1")).toEqual([]);
    expect(tree.parents().sort()).toEqual(["north", "north-a", "south"]);
  });
});

describe("initialExpanded", () => {
  it("opens every parent, those shallower than a depth, or none", () => {
    expect([...initialExpanded(ROWS, base, true)].sort()).toEqual(["north", "north-a", "south"]);
    expect([...initialExpanded(ROWS, base, 1)].sort()).toEqual(["north", "south"]);
    expect(initialExpanded(ROWS, base, false).size).toBe(0);
    expect(initialExpanded(ROWS, base, undefined).size).toBe(0);
  });
});

describe("cascadeSelection", () => {
  it("gives the node and its descendants the node's new state", () => {
    const tree = treeRows(ROWS, { ...base, expanded: "all" });
    const on = cascadeSelection(new Set(), "north", tree.descendants("north"));
    expect([...on].sort()).toEqual(["north", "north-a", "north-a-1", "north-b"]);
    const off = cascadeSelection(on, "north-a", tree.descendants("north-a"));
    expect([...off].sort()).toEqual(["north", "north-b"]);
  });
});

describe("setExpanded", () => {
  it("opens and closes one row, returning the same set when nothing changes", () => {
    const none: ReadonlySet<string> = new Set();
    const open = setExpanded(none, "north", true);
    expect([...open]).toEqual(["north"]);
    expect(none.size).toBe(0);
    expect(setExpanded(open, "north", true)).toBe(open);
    expect([...setExpanded(open, "north", false)]).toEqual([]);
  });
});
