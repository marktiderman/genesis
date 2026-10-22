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

  it("ignores comments", () => {
    const source = [
      "// function resolveNavigation(tree) — we used to have our own",
      "/* interface NavigationNode<T> { id: string } */",
      "/**",
      " * type NavigationNode = { id: string };",
      " */",
    ].join("\n");
    expect(findNavigationReimplementations(source)).toEqual([]);
  });

  it("ignores a declare module augmentation", () => {
    const source = [
      'declare module "@marktiderman/genesis-ui/layout" {',
      "  interface NavigationNode<T> {",
      "    badge?: string;",
      "  }",
      "}",
      "export function resolveNavigation() {}",
    ].join("\n");
    expect(findNavigationReimplementations(source).map((v) => v.line)).toEqual([6]);
  });

  it("ignores an alias of the genesis-ui type", () => {
    expect(
      names('type NavigationNode = import("@marktiderman/genesis-ui/layout").NavigationNode<Item>;'),
    ).toEqual([]);
  });

  it("ignores declare global, and only exempts a NavigationNode alias", () => {
    expect(names("declare global {\n  interface NavigationNode { x: 1 }\n}")).toEqual([]);
    expect(
      names('export function resolveNavigation() {} // like @marktiderman/genesis-ui/layout'),
    ).toEqual(["resolveNavigation"]);
  });

  it("reports the line", () => {
    expect(findNavigationReimplementations("// x\nfunction resolveNavigation() {}")[0]?.line).toBe(2);
  });
});
