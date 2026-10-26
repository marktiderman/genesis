// @vitest-environment happy-dom
/**
 * useViewer and ViewerScope's `roles`: guards read `{ id, scope, roles }`, roles compare by value,
 * and only a different viewer or different roles reset the cache. Roles arriving don't.
 */
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { defineView } from "../../resource-view";
import type { ResourceContract } from "../../schema/types";
import type { GenesisViewerRoles } from "../../viewer";
import { NO_VIEWER, ViewerScope, useViewer, type Viewer } from "../viewer-scope";

afterEach(cleanup);

type Roles = GenesisViewerRoles & { teamRoles?: readonly string[] };

const contract = {
  name: "public.notes",
  key: "id",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "title", type: "string" },
  ],
} as const satisfies ResourceContract;

const notesView = defineView(contract, {
  can: { create: (v) => (((v.roles as Roles | undefined)?.teamRoles ?? []).includes("editor") ? true : "Only editors add notes.") },
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (children: ReactNode) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrap };
}

const seen: Viewer[] = [];
const mounts: string[] = [];

/** Reads the viewer, the guard's answer and the cache, and counts its own mounts. */
function Probe() {
  const viewer = useViewer();
  seen.push(viewer);
  useState(() => mounts.push("mount"));
  const cached = useQuery({ queryKey: ["cached"], queryFn: async () => "loaded" });
  const allowed = notesView.can("create", viewer);
  return <p>{`${viewer.id ?? "none"}|${allowed === true ? "allowed" : allowed}|${cached.data ?? "loading"}`}</p>;
}

function reset() {
  seen.length = 0;
  mounts.length = 0;
}

describe("useViewer", () => {
  it("is NO_VIEWER outside a ViewerScope, so a guard refuses with its reason", () => {
    reset();
    const { wrap } = setup();
    render(wrap(<Probe />));
    expect(seen.at(-1)).toBe(NO_VIEWER);
    expect(screen.getByText(/^none\|Only editors add notes\./)).toBeTruthy();
  });

  it("re-evaluates guards when the viewer changes", async () => {
    reset();
    const { wrap } = setup();
    const at = (viewer: string, roles: Roles) => wrap(<ViewerScope viewer={viewer} roles={roles}><Probe /></ViewerScope>);
    const { rerender } = render(at("ann", { teamRoles: ["editor"] }));
    await screen.findByText("ann|allowed|loaded");
    rerender(at("bob", { teamRoles: ["reader"] }));
    await screen.findByText("bob|Only editors add notes.|loaded");
    expect(seen.at(-1)).toMatchObject({ id: "bob", roles: { teamRoles: ["reader"] } });
  });
});

describe("ViewerScope roles", () => {
  it("re-rendering with an equal new roles object doesn't reset or change the viewer", async () => {
    reset();
    const { client, wrap } = setup();
    const at = (roles: Roles) => wrap(<ViewerScope viewer="ann" scope={{ practiceId: "p1" }} roles={roles}><Probe /></ViewerScope>);
    const { rerender } = render(at({ teamRoles: ["editor"] }));
    await screen.findByText("ann|allowed|loaded");
    const before = seen.at(-1);
    client.setQueryData(["marker"], "kept");
    rerender(at({ teamRoles: ["editor"] }));
    await screen.findByText("ann|allowed|loaded");
    expect(mounts).toEqual(["mount"]);
    expect(client.getQueryData(["marker"])).toBe("kept");
    // The same object: memos keyed on the viewer don't rerun.
    expect(seen.at(-1)).toBe(before);
  });

  it("undefined → defined roles doesn't reset; the guard re-evaluates", async () => {
    reset();
    const { client, wrap } = setup();
    const at = (roles?: Roles) => wrap(<ViewerScope viewer="ann" roles={roles}><Probe /></ViewerScope>);
    const { rerender } = render(at(undefined));
    // Roles unknown: fail closed.
    await screen.findByText("ann|Only editors add notes.|loaded");
    client.setQueryData(["marker"], "kept");
    rerender(at({ teamRoles: ["editor"] }));
    await screen.findByText("ann|allowed|loaded");
    expect(mounts).toEqual(["mount"]);
    expect(client.getQueryData(["marker"])).toBe("kept");
  });

  it("different roles reset the cache and remount, as a new viewer does", async () => {
    reset();
    const { client, wrap } = setup();
    const at = (roles?: Roles) => wrap(<ViewerScope viewer="ann" roles={roles}><Probe /></ViewerScope>);
    const { rerender } = render(at({ teamRoles: ["editor"] }));
    await screen.findByText("ann|allowed|loaded");
    // Going back to undefined (roles reloading) keeps everything.
    rerender(at(undefined));
    await screen.findByText("ann|Only editors add notes.|loaded");
    client.setQueryData(["marker"], "kept");
    expect(mounts).toEqual(["mount"]);
    // The same roles again: still not a reset.
    rerender(at({ teamRoles: ["editor"] }));
    await screen.findByText("ann|allowed|loaded");
    expect(client.getQueryData(["marker"])).toBe("kept");
    // Different roles: a reset.
    rerender(at({ teamRoles: ["reader"] }));
    await screen.findByText("ann|Only editors add notes.|loaded");
    expect(client.getQueryData(["marker"])).toBeUndefined();
    expect(mounts).toEqual(["mount", "mount"]);
  });
});
