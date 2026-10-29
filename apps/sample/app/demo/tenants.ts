/**
 * The demo's three invented organizations and the roles a visitor can try.
 * Each organization is a Genesis workspace: a URL prefix and the scope every
 * view inside reads (`{ orgId }`), so switching changes the data with no
 * screen code.
 */
import type { Workspace } from "@marktiderman/genesis-core/workspaces";

export type DemoRole = "owner" | "staff" | "client";

declare module "@marktiderman/genesis-core" {
  interface GenesisViewerRoles {
    /** The role the visitor is trying in the current organization. */
    demoRole?: DemoRole;
  }
  interface ResourceScope {
    orgId?: string | readonly string[];
  }
}

export interface Org {
  id: string;
  name: string;
  kind: string;
  /** The word this business uses for a client. */
  clientNoun: string;
  /** Features this organization switched off (see features.ts). */
  off: string[];
  /** What it pays for. */
  entitlements: string[];
}

export const ORGS: Org[] = [
  { id: "harbor", name: "Harbor Studio", kind: "Design agency", clientNoun: "Client", off: [], entitlements: ["demo-data-studio"] },
  { id: "summit", name: "Summit Fitness", kind: "Fitness studio", clientNoun: "Member", off: ["demo-intake"], entitlements: [] },
  { id: "maple", name: "Maple Property Co.", kind: "Property manager", clientNoun: "Tenant", off: [], entitlements: ["demo-data-studio"] },
];

export const ROLES: Array<{ id: DemoRole; label: string; description: string }> = [
  { id: "owner", label: "Owner", description: "Everything, including settings and the Data Studio." },
  { id: "staff", label: "Staff", description: "Clients, bookings, chat and the assistant; no settings." },
  { id: "client", label: "Client", description: "Only their own record, bookings and chat." },
];

/** The signed-in client when the role is "client": the first client of each organization. */
export const CLIENT_SELF: Record<string, string> = { harbor: "harbor-c1", summit: "summit-c1", maple: "maple-c1" };

export function demoWorkspaces(role: DemoRole): Workspace[] {
  const tenants: Workspace[] = ORGS.map((o) => ({
    id: o.id,
    kind: "tenant",
    label: o.name,
    description: `${o.kind} · ${ROLES.find((r) => r.id === role)!.label}`,
    path: `/demo/${o.id}`,
    scope: { orgId: o.id },
    roles: { demoRole: role },
    timeZone: "America/New_York",
  }));
  // The roll-up: every organization at once, for an owner of all three.
  const rollup: Workspace = {
    id: "all",
    kind: "rollup",
    label: "All organizations",
    description: "Every organization's data together",
    path: "/demo/all",
    scope: { orgId: ORGS.map((o) => o.id) },
    roles: { demoRole: role },
  };
  return role === "owner" ? [rollup, ...tenants] : tenants;
}

export const orgById = (id: string | undefined) => ORGS.find((o) => o.id === id);

const STAFF_PAGES = ["", "clients", "bookings", "intake", "chat", "assistant"];
const OWNER_PAGES = [...STAFF_PAGES, "data", "settings"];

/**
 * Whether a role may open a page of a workspace (`path` is the part after
 * `/demo/<ws>/`). The menu lists only these pages and the shell sends any
 * other address back to the workspace's overview, so the two never disagree.
 * A client opens the overview, their own record and their messages.
 */
export function canOpen(role: DemoRole, self: string | undefined, path: string): boolean {
  const [page = "", id] = path.split("/");
  if (role === "client") return page === "" || page === "chat" || (page === "clients" && !!self && id === self);
  return (role === "owner" ? OWNER_PAGES : STAFF_PAGES).includes(page);
}
