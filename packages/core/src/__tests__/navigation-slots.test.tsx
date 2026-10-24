import { describe, expect, it } from "vitest";
import { isValidElement } from "react";
import { isPathActive, resolveNavigation, type NavigationNode } from "../navigation";
import { renderSlot } from "../slots";

// Runs in Node with no DOM: both modules must work on web, native and the server.
describe("navigation in core", () => {
  const tree: NavigationNode<string> = {
    id: "home",
    path: "/app",
    label: "Home",
    items: [],
    children: [{ id: "client", path: "/clients/$clientId", label: "Client", items: ["messages"] }],
  };

  it("resolves a logical parent and params without a browser", () => {
    const resolved = resolveNavigation(tree, "/clients/42/messages");
    expect(resolved.current.id).toBe("client");
    expect(resolved.parent?.id).toBe("home");
    expect(resolved.params).toEqual({ clientId: "42" });
    expect(resolved.current.path).toBe("/clients/42");
  });

  it("matches active paths by whole segments", () => {
    expect(isPathActive("/clients", "/clients/42")).toBe(true);
    expect(isPathActive("/clients", "/clients-old")).toBe(false);
  });
});

describe("slots in core", () => {
  const Default = (props: { label: string }) => props.label;
  const Other = (props: { label: string }) => `other ${props.label}`;

  it("renders the default, an override, or nothing when ejected", () => {
    const def = renderSlot(Default, undefined, { label: "x" });
    expect(isValidElement(def) && def.type).toBe(Default);
    const over = renderSlot(Default, Other, { label: "x" }, { label: "y" });
    expect(isValidElement(over) && over.type).toBe(Other);
    expect(isValidElement(over) && (over.props as { label: string }).label).toBe("y");
    expect(renderSlot(Default, null, { label: "x" })).toBeNull();
  });
});
