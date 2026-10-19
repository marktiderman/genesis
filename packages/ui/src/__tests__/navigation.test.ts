import { describe, expect, it } from "vitest";
import {
  isPathActive,
  resolveNavigation,
  type NavigationNode,
} from "../navigation";

type Item = { to: string; label: string };
const node = (
  id: string,
  path: string,
  children?: NavigationNode<Item>[],
  items: Item[] = [],
): NavigationNode<Item> => ({ id, path, label: id, items, children });

// Mirrors the tree mindful-coach-pro's navigationFor() builds for an owner who
// is coach + admin + client: a root at /app with logical children whose URLs
// share no prefix with it.
const appTree = node("app", "/app", [
  node("home", "/my", [], [{ to: "/my/tasks", label: "Tasks" }]),
  node("clients", "/dashboard", [node("client", "/clients/$clientId")]),
  node("admin", "/admin", [], [
    { to: "/admin?tab=users", label: "Users" },
    { to: "/admin?tab=clients", label: "Clients" },
  ]),
  node("settings", "/settings", [], [
    { to: "/settings#profile", label: "Profile" },
    { to: "/settings#account", label: "Account" },
  ]),
]);

describe("resolveNavigation", () => {
  // Ported from mindful-coach-pro src/test/navigation-tree.test.ts.
  it("returns Home to the app parent rather than browser history", () => {
    expect(resolveNavigation(appTree, "/my/tasks").parent?.path).toBe("/app");
  });

  it("returns client views to Clients across different URL prefixes", () => {
    const result = resolveNavigation(appTree, "/clients/client-123/tasks");
    expect(result.current.id).toBe("client");
    expect(result.parent?.path).toBe("/dashboard");
    expect(result.params).toEqual({ clientId: "client-123" });
  });

  it("supports repeated nesting with interpolated logical parents", () => {
    const tree = node("app", "/app", [
      node("clients", "/dashboard", [
        node("client", "/clients/$clientId", [
          node("task", "/clients/$clientId/tasks/$taskId", [], [
            { to: "details", label: "Details" },
          ]),
        ]),
      ]),
    ]);
    const result = resolveNavigation(tree, "/clients/123/tasks/456");
    expect(result.parent?.path).toBe("/clients/123");
    expect(result.items).toEqual([{ to: "details", label: "Details" }]);
  });

  it("matches complete path segments only", () => {
    expect(resolveNavigation(appTree, "/my-other").current.id).toBe("app");
  });

  it("gives Admin its own record views", () => {
    expect(
      resolveNavigation(appTree, "/admin").items.map((item) => item.to),
    ).toEqual(["/admin?tab=users", "/admin?tab=clients"]);
  });

  it("gives Settings its own section navigation", () => {
    expect(
      resolveNavigation(appTree, "/settings").items.map((item) => item.to),
    ).toEqual(["/settings#profile", "/settings#account"]);
  });

  // Fixes over the reference implementation.
  it("interpolates params by name, not by position", () => {
    const tree = node("app", "/", [
      node("org", "/orgs/$orgId", [node("membership", "/people/$personId/in/$orgId")]),
    ]);
    const result = resolveNavigation(tree, "/people/p1/in/o9");
    expect(result.current.id).toBe("membership");
    expect(result.parent?.path).toBe("/orgs/o9");
    expect(result.params).toEqual({ personId: "p1", orgId: "o9" });
  });

  it.each([
    ["static first", [node("new", "/clients/new"), node("client", "/clients/$clientId")]],
    ["param first", [node("client", "/clients/$clientId"), node("new", "/clients/new")]],
  ])("prefers a static segment over a $param on a tie (%s)", (_, children) => {
    const tree = node("app", "/", children);
    expect(resolveNavigation(tree, "/clients/new").current.id).toBe("new");
    expect(resolveNavigation(tree, "/clients/c1").current.id).toBe("client");
  });

  it("interpolates every level of a three-level trail", () => {
    const tree = node("root", "/", [
      node("org", "/orgs/$orgId", [
        node("team", "/orgs/$orgId/teams/$teamId", [
          node("member", "/orgs/$orgId/teams/$teamId/members/$memberId"),
        ]),
      ]),
    ]);
    const result = resolveNavigation(tree, "/orgs/o1/teams/t2/members/m3");
    expect(result.trail.map((n) => n.path)).toEqual([
      "/",
      "/orgs/o1",
      "/orgs/o1/teams/t2",
      "/orgs/o1/teams/t2/members/m3",
    ]);
    expect(result.current.path).toBe("/orgs/o1/teams/t2/members/m3");
    expect(result.params).toEqual({ orgId: "o1", teamId: "t2", memberId: "m3" });
  });

  it("falls back to the root when nothing matches", () => {
    const result = resolveNavigation(appTree, "/nowhere/at/all");
    expect(result.current.id).toBe("app");
    expect(result.parent).toBeUndefined();
    expect(result.trail.map((n) => n.id)).toEqual(["app"]);
    expect(result.params).toEqual({});
  });

  it("round-trips encoded params", () => {
    const tree = node("app", "/", [
      node("a", "/a/$id", [node("b", "/b/$id/more")]),
    ]);
    const result = resolveNavigation(tree, "/b/x%20y/more");
    expect(result.params).toEqual({ id: "x y" });
    expect(result.parent?.path).toBe("/a/x%20y");
  });
});

describe("isPathActive", () => {
  it("keeps the path-only behavior", () => {
    expect(isPathActive("/", "/")).toBe(true);
    expect(isPathActive("/", "/clients")).toBe(false);
    expect(isPathActive("/clients", "/clients/1")).toBe(true);
    expect(isPathActive("/clients", "/clients-archive")).toBe(false);
    expect(isPathActive("/clients", undefined)).toBe(false);
  });

  it("compares a plain item against the path part of activePath", () => {
    expect(isPathActive("/admin", "/admin?tab=users")).toBe(true);
    expect(isPathActive("/settings", "/settings#profile")).toBe(true);
    expect(isPathActive("/clients", "/clients/1?view=board")).toBe(true);
  });

  it("supports exact matching with end", () => {
    expect(isPathActive("/clients", "/clients/1", { end: true })).toBe(false);
    expect(isPathActive("/clients", "/clients?page=2", { end: true })).toBe(true);
  });

  it("requires a query item's params to match", () => {
    expect(isPathActive("/admin?tab=users", "/admin?tab=users")).toBe(true);
    expect(isPathActive("/admin?tab=users", "/admin?tab=users&page=2")).toBe(true);
    expect(isPathActive("/admin?tab=users", "/admin?page=2&tab=users")).toBe(true);
    expect(isPathActive("/admin?tab=users", "/admin?tab=clients")).toBe(false);
    expect(isPathActive("/admin?tab=users", "/admin")).toBe(false);
    expect(isPathActive("/admin?tab=users", "/admin/sub?tab=users")).toBe(false);
  });

  it("requires a hash item's hash to match", () => {
    expect(isPathActive("/settings#profile", "/settings#profile")).toBe(true);
    expect(isPathActive("/settings#profile", "/settings?x=1#profile")).toBe(true);
    expect(isPathActive("/settings#profile", "/settings#account")).toBe(false);
    expect(isPathActive("/settings#profile", "/settings")).toBe(false);
  });
});
