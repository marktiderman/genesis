// @vitest-environment happy-dom
// @feat:workspaces
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  defaultWorkspace,
  groupWorkspaces,
  pathInWorkspace,
  workspaceAt,
  workspaceHref,
  workspaceInitials,
  type Workspace,
} from "../workspaces";
import { rememberedWorkspaceId, useWorkspace, WorkspaceScope } from "../hooks/workspace-scope";
import { useViewerScope } from "../hooks/viewer-scope";

const acme: Workspace = { id: "acme", kind: "tenant", label: "Acme Fitness", path: "/o/acme", scope: { orgId: "org-1" }, timeZone: "America/New_York" };
const acmeWest: Workspace = { id: "acme-west", kind: "tenant", label: "Acme West", path: "/o/acme-west", scope: { orgId: "org-2" } };
const all: Workspace = { id: "all", kind: "rollup", label: "All organizations", path: "/all", scope: { orgIds: ["org-1", "org-2"] } };
const me: Workspace = { id: "me", kind: "personal", label: "Personal", path: "/me", scope: { personId: "p-1" } };
const workspaces = [acme, acmeWest, all, me];

describe("workspaceAt", () => {
  it("finds the workspace a URL is in, at segment boundaries", () => {
    expect(workspaceAt(workspaces, "/o/acme")?.id).toBe("acme");
    expect(workspaceAt(workspaces, "/o/acme/clients/42")?.id).toBe("acme");
    expect(workspaceAt(workspaces, "/o/acme-west/clients")?.id).toBe("acme-west");
    expect(workspaceAt(workspaces, "/o/acme/?tab=1")?.id).toBe("acme");
    expect(workspaceAt(workspaces, "/sign-in")).toBeUndefined();
  });

  it("prefers the longest prefix", () => {
    const nested: Workspace = { ...acme, id: "acme-studio", path: "/o/acme/studio" };
    expect(workspaceAt([acme, nested], "/o/acme/studio/classes")?.id).toBe("acme-studio");
  });
});

describe("pathInWorkspace", () => {
  it("gives the path inside the workspace", () => {
    expect(pathInWorkspace(acme, "/o/acme/clients/42")).toBe("/clients/42");
    expect(pathInWorkspace(acme, "/o/acme")).toBe("/");
    expect(pathInWorkspace(acme, "/me")).toBe("/");
  });
});

describe("workspaceHref", () => {
  it("keeps the section between workspaces of the same kind, never the record", () => {
    expect(workspaceHref(workspaces, acmeWest, "/o/acme/clients/42")).toBe("/o/acme-west/clients");
    expect(workspaceHref(workspaces, acmeWest, "/o/acme")).toBe("/o/acme-west");
  });

  it("lands on the landing page of a different kind", () => {
    expect(workspaceHref(workspaces, me, "/o/acme/clients")).toBe("/me");
    expect(workspaceHref(workspaces, all, "/o/acme/clients")).toBe("/all");
  });

  it("lands on the landing page from outside any workspace, or to the same workspace", () => {
    expect(workspaceHref(workspaces, acme, "/sign-in")).toBe("/o/acme");
    expect(workspaceHref(workspaces, acme, "/o/acme/clients")).toBe("/o/acme");
    expect(workspaceHref(workspaces, acme, undefined)).toBe("/o/acme");
  });

  it("takes the app's own rule", () => {
    const keep = (rest: string) => rest;
    expect(workspaceHref(workspaces, acmeWest, "/o/acme/clients/42", { keep })).toBe("/o/acme-west/clients/42");
    expect(workspaceHref(workspaces, acmeWest, "/o/acme/clients", { keep: () => false })).toBe("/o/acme-west");
  });
});

describe("groupWorkspaces", () => {
  it("groups by kind in the default order, leaving out empty kinds", () => {
    expect(groupWorkspaces(workspaces).map((g) => [g.kind, g.workspaces.map((w) => w.id)])).toEqual([
      ["personal", ["me"]],
      ["rollup", ["all"]],
      ["tenant", ["acme", "acme-west"]],
    ]);
    expect(groupWorkspaces([acme]).map((g) => g.kind)).toEqual(["tenant"]);
  });

  it("follows the given order and keeps kinds it doesn't name at the end", () => {
    expect(groupWorkspaces(workspaces, ["tenant"]).map((g) => g.kind)).toEqual(["tenant", "rollup", "personal"]);
  });
});

describe("defaultWorkspace", () => {
  it("opens the remembered workspace while the viewer still has it, else the first tenant", () => {
    expect(defaultWorkspace(workspaces, "acme-west")?.id).toBe("acme-west");
    expect(defaultWorkspace(workspaces, "gone")?.id).toBe("acme");
    expect(defaultWorkspace([me, all])?.id).toBe("me");
    expect(defaultWorkspace([])).toBeUndefined();
  });
});

describe("workspaceInitials", () => {
  it("takes the first letters of the first two words", () => {
    expect(workspaceInitials("Acme Fitness Club")).toBe("AF");
    expect(workspaceInitials("acme")).toBe("AC");
    expect(workspaceInitials("  ")).toBe("");
  });
});

describe("WorkspaceScope", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  function Probe() {
    const { scope, scopeTimeZone } = useViewerScope();
    const workspace = useWorkspace();
    return (
      <p>
        {JSON.stringify(scope)}|{scopeTimeZone}|{workspace?.current?.id ?? "none"}|{workspace?.hrefFor(acmeWest)}
      </p>
    );
  }

  function renderAt(pathname: string) {
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <WorkspaceScope viewer="u-1" workspaces={workspaces} pathname={pathname} timeZone="UTC">
          <Probe />
        </WorkspaceScope>
      </QueryClientProvider>,
    );
  }

  it("scopes everything under it to the workspace in the URL", async () => {
    renderAt("/o/acme/clients/42");
    expect(await screen.findByText('{"orgId":"org-1"}|America/New_York|acme|/o/acme-west/clients')).toBeTruthy();
  });

  it("remembers the workspace per viewer", async () => {
    renderAt("/o/acme-west");
    await screen.findByText(/acme-west/);
    expect(rememberedWorkspaceId("u-1")).toBe("acme-west");
    expect(rememberedWorkspaceId("u-2")).toBeNull();
  });

  it("has no current workspace outside every workspace", async () => {
    renderAt("/sign-in");
    expect(await screen.findByText(/\{\}\|UTC\|none/)).toBeTruthy();
  });
});
