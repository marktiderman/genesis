/**
 * Regression test for scripts/check-navigation-reimplementation.mjs: flags a
 * local resolveNavigation / NavigationNode declaration, never a use of the
 * Genesis ones.
 */
import { describe, expect, it } from "vitest";
import { findNavigationReimplementations } from "../check-navigation-reimplementation.mjs";

const names = (source) => findNavigationReimplementations(source).map((v) => v.name);

describe("findNavigationReimplementations", () => {
  it("flags a local resolveNavigation function or const", () => {
    expect(names("export function resolveNavigation<T>(tree, path) {")).toEqual(["resolveNavigation"]);
    expect(names("export const resolveNavigation = (tree, path) => tree;")).toEqual(["resolveNavigation"]);
  });

  it("flags a local NavigationNode interface or type", () => {
    expect(names("export interface NavigationNode<T> {")).toEqual(["NavigationNode"]);
    expect(names("type NavigationNode<T = Item> = { id: string };")).toEqual(["NavigationNode"]);
  });

  it("ignores imports, calls and type uses of the Genesis versions", () => {
    const source = [
      'import { resolveNavigation, type NavigationNode } from "@marktiderman/genesis-ui/layout";',
      "const nav = resolveNavigation(tree, pathname);",
      "const tree: NavigationNode<NavItem> = { id: 'app', path: '/', label: 'Home', items: [] };",
      "type AppTree = NavigationNode<NavItem>;",
    ].join("\n");
    expect(findNavigationReimplementations(source)).toEqual([]);
  });

  it("reports the line", () => {
    expect(findNavigationReimplementations("// x\nfunction resolveNavigation() {}")[0]?.line).toBe(2);
  });
});
