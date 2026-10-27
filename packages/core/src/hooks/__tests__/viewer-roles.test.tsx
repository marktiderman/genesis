// @vitest-environment happy-dom
/**
 * useViewer and ViewerScope's `roles`: guards read `{ id, scope, roles }`, roles compare by value,
 * and only a different viewer or different roles reset the cache. Roles arriving don't.
 */
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DataProvider } from "../../provider/types";
import { defineView } from "../../resource-view";
import type { ResourceContract } from "../../schema/types";
import type { GenesisViewerRoles } from "../../viewer";
import { setErrorReporter } from "../../errors";
import { executeWrite, pendingWriteCount } from "../mutation-mode";
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

  it("a reordered roles list is the same roles", async () => {
    reset();
    const { client, wrap } = setup();
    const at = (teamRoles: NonNullable<Roles["teamRoles"]>) => wrap(<ViewerScope viewer="ann" roles={{ teamRoles }}><Probe /></ViewerScope>);
    const { rerender } = render(at(["editor", "owner"]));
    await screen.findByText("ann|allowed|loaded");
    const before = seen.at(-1);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    rerender(at(["owner", "editor"]));
    await screen.findByText("ann|allowed|loaded");
    expect(seen.at(-1)).toBe(before);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("roles must be plain JSON: a Set would hide a change", () => {
    const { wrap } = setup();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(wrap(<ViewerScope viewer="ann" roles={{ teamRoles: new Set(["editor"]) } as never}><Probe /></ViewerScope>))).toThrow(/plain JSON/);
    spy.mockRestore();
  });

  it("in production, roles that aren't plain JSON are reported once and count as unknown: the guard refuses", async () => {
    reset();
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.fn();
    const restore = setErrorReporter(warn);
    try {
      const { wrap } = setup();
      const at = (teamRoles: Set<string>) => wrap(<ViewerScope viewer="ann" roles={{ teamRoles } as never}><Probe /></ViewerScope>);
      const { rerender } = render(at(new Set(["editor"])));
      await screen.findByText("ann|Only editors add notes.|loaded");
      expect(seen.at(-1)).not.toHaveProperty("roles");
      rerender(at(new Set(["editor", "owner"])));
      await screen.findByText("ann|Only editors add notes.|loaded");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toMatch(/plain JSON/);
      expect(warn.mock.calls[0]![1]).toEqual({ source: "core:viewer-scope" });
    } finally {
      restore();
      vi.unstubAllEnvs();
    }
  });

  it("different roles reread every query under them, without remounting", async () => {
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
    // Different roles: every query is reread under them; nothing remounts or empties.
    const invalidate = vi.spyOn(client, "invalidateQueries");
    rerender(at({ teamRoles: ["reader"] }));
    await screen.findByText("ann|Only editors add notes.|loaded");
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    expect(client.getQueryData(["marker"])).toBe("kept");
    expect(mounts).toEqual(["mount"]);
  });

  it("a new viewer gets the roles reread from scratch: their first roles aren't a change", async () => {
    reset();
    const { client, wrap } = setup();
    const at = (viewer: string, roles: Roles) => wrap(<ViewerScope viewer={viewer} roles={roles}><Probe /></ViewerScope>);
    const { rerender } = render(at("ann", { teamRoles: ["editor"] }));
    await screen.findByText("ann|allowed|loaded");
    const invalidate = vi.spyOn(client, "invalidateQueries");
    rerender(at("bob", { teamRoles: ["reader"] }));
    await screen.findByText("bob|Only editors add notes.|loaded");
    expect(invalidate).not.toHaveBeenCalled();
  });
});

/** An undoable edit waiting out its delay; `send` is what would reach the database. */
async function waitingEdit(client: QueryClient, send: ReturnType<typeof vi.fn>, failedLater = vi.fn()) {
  await executeWrite({
    queryClient: client,
    provider: {} as DataProvider,
    resource: "notes",
    kind: "update",
    id: "n1",
    data: { title: "edited" },
    undoDelayMs: 60_000,
    mode: "undoable",
    send,
    committed: () => {},
    failedLater,
  } as never);
}

describe("ViewerScope and waiting writes", () => {
  it("sends a waiting write when the same viewer's roles change", async () => {
    reset();
    const { client, wrap } = setup();
    const at = (roles: Roles) => wrap(<ViewerScope viewer="ann" roles={roles}><Probe /></ViewerScope>);
    const { rerender } = render(at({ teamRoles: ["editor"] }));
    await screen.findByText("ann|allowed|loaded");
    const send = vi.fn(async () => ({ record: { id: "n1", title: "edited" } }));
    await waitingEdit(client, send);
    expect(send).not.toHaveBeenCalled();
    // Same person, same session: the write goes out now, and the database decides it.
    rerender(at({ teamRoles: ["reader"] }));
    await screen.findByText("ann|Only editors add notes.|loaded");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(pendingWriteCount(client, "notes")).toBe(0);
  });

  it("a write the new roles don't allow comes back refused, not silently dropped", async () => {
    reset();
    const { client, wrap } = setup();
    const at = (roles: Roles) => wrap(<ViewerScope viewer="ann" roles={roles}><Probe /></ViewerScope>);
    const { rerender } = render(at({ teamRoles: ["editor"] }));
    await screen.findByText("ann|allowed|loaded");
    const send = vi.fn(async () => {
      throw Object.assign(new Error("forbidden"), { code: "42501" });
    });
    const failedLater = vi.fn();
    await waitingEdit(client, send, failedLater);
    rerender(at({ teamRoles: ["reader"] }));
    await waitFor(() => expect(failedLater).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("drops a waiting write when the viewer changes: it never goes out as someone else", async () => {
    reset();
    const { client, wrap } = setup();
    const at = (viewer: string) => wrap(<ViewerScope viewer={viewer} roles={{ teamRoles: ["editor"] }}><Probe /></ViewerScope>);
    const { rerender } = render(at("ann"));
    await screen.findByText("ann|allowed|loaded");
    const send = vi.fn(async () => ({ record: { id: "n1" } }));
    const failedLater = vi.fn();
    await waitingEdit(client, send, failedLater);
    rerender(at("bob"));
    await screen.findByText("bob|allowed|loaded");
    expect(send).not.toHaveBeenCalled();
    expect(failedLater).not.toHaveBeenCalled();
    expect(pendingWriteCount(client, "notes")).toBe(0);
  });
});
