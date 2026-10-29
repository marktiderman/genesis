/**
 * The demo app: a small multi-tenant business app on Genesis, running in the
 * browser on in-memory data. Three invented organizations are workspaces
 * (WorkspaceScope + WorkspaceSwitcher in the AppShell header); the role a
 * visitor tries (owner, staff, client) narrows the menu, the guards and the
 * rows; Reset puts the sample data back.
 */
import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useParams } from "react-router";
import { GenesisProvider } from "@marktiderman/genesis-core/provider";
import { WorkspaceScope } from "@marktiderman/genesis-core/hooks";
import { FeatureGateProvider } from "@marktiderman/genesis-features/gate/react";
import { AppShell, WorkspaceSwitcher, type NavItem } from "@marktiderman/genesis-ui/layout";
import { ReactRouterLink, useReactRouterActivePath } from "@marktiderman/genesis-ui/router/react-router";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@marktiderman/genesis-ui";
import { Bot, CalendarDays, ClipboardList, Database, Home, LayoutDashboard, MessagesSquare, RotateCcw, Settings, Users } from "lucide-react";
import { DemoContext, type DemoState } from "../demo/context";
import { demoGate } from "../demo/features";
import { createDemoProvider } from "../demo/provider";
import { CLIENT_SELF, demoWorkspaces, orgById, ROLES, type DemoRole } from "../demo/tenants";

const ROLE_KEY = "genesis-demo:role";

function readRole(): DemoRole | null {
  try {
    const v = window.localStorage.getItem(ROLE_KEY);
    return v === "owner" || v === "staff" || v === "client" ? v : null;
  } catch {
    return null;
  }
}

export default function DemoLayout() {
  const { pathname } = useLocation();
  const { ws = "" } = useParams();
  const activePath = useReactRouterActivePath();
  // The prerendered page is the owner's; a visitor's own pick applies once the page runs.
  const [role, setRoleState] = useState<DemoRole>("owner");
  useEffect(() => {
    const saved = readRole();
    if (saved) setRoleState(saved);
  }, []);
  const setRole = (next: DemoRole) => {
    setRoleState(next);
    try {
      window.localStorage.setItem(ROLE_KEY, next);
    } catch {
      // Private mode: the pick lasts for this visit.
    }
  };

  const [resets, setResets] = useState(0);
  const provider = useMemo(() => createDemoProvider(), [resets]);
  const [overridesByOrg, setOverridesByOrg] = useState<Record<string, DemoState["overrides"]>>({});

  const workspaces = useMemo(() => demoWorkspaces(role), [role]);
  const org = orgById(ws);
  const overrides = overridesByOrg[ws] ?? { off: [], flags: {} };
  const gate = useMemo(() => demoGate(org, overrides), [org, overrides]);
  const self = role === "client" ? CLIENT_SELF[ws] : undefined;
  const base = `/demo/${ws}`;
  const href = (path = "") => (path ? `${base}/${path}` : base);
  const on = (id: string) => gate.answers[id]?.on !== false;

  const nav: NavItem[] = !ws
    ? [{ to: "/demo", icon: Home, label: "Organizations", end: true }]
    : role === "client"
      ? [
          { to: href(), icon: LayoutDashboard, label: "Overview", end: true },
          ...(self ? [{ to: href(`clients/${self}`), icon: Users, label: "My record" }] : []),
          { to: href("chat"), icon: MessagesSquare, label: "Messages" },
        ]
      : [
          { to: href(), icon: LayoutDashboard, label: "Overview", end: true },
          { to: href("clients"), icon: Users, label: org?.clientNoun ? `${org.clientNoun}s` : "Clients" },
          { to: href("bookings"), icon: CalendarDays, label: "Bookings" },
          ...(on("demo-intake") && org ? [{ to: href("intake"), icon: ClipboardList, label: "Intake form" }] : []),
          { to: href("chat"), icon: MessagesSquare, label: "Messages" },
          ...(on("demo-assistant") ? [{ to: href("assistant"), icon: Bot, label: "Assistant" }] : []),
          ...(role === "owner" && on("demo-data-studio") ? [{ to: href("data"), icon: Database, label: "Data Studio" }] : []),
          ...(role === "owner" && org ? [{ to: href("settings"), icon: Settings, label: "Settings" }] : []),
        ];

  const state: DemoState = {
    org,
    ws,
    role,
    self,
    provider,
    overrides,
    setOverrides: (next) => setOverridesByOrg((all) => ({ ...all, [ws]: next })),
    href,
  };

  const roleControls = (
    <div className="space-y-2 px-1">
      <Select value={role} onValueChange={(v) => setRole(v as DemoRole)}>
        <SelectTrigger aria-label="View as" data-testid="demo-role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              View as {r.label.toLowerCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button testID="demo-button-1" variant="ghost" size="sm" className="w-full justify-start" onClick={() => setResets((n) => n + 1)} data-testid="demo-reset">
        <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
        Reset demo data
      </Button>
    </div>
  );

  return (
    <GenesisProvider key={resets} provider={provider}>
      <WorkspaceScope workspaces={workspaces} pathname={pathname} viewer={self ?? `demo-${role}`}>
        <FeatureGateProvider snapshot={gate}>
          <DemoContext.Provider value={state}>
            <AppShell
              appName="Demo"
              appLogo="D"
              navItems={nav}
              subNav="tabs"
              headerSlot={<WorkspaceSwitcher linkComponent={ReactRouterLink} placeholder="Pick an organization" />}
              collapsedHeaderSlot={<WorkspaceSwitcher variant="rail" linkComponent={ReactRouterLink} />}
              mobileHeaderSlot={<WorkspaceSwitcher variant="bar" linkComponent={ReactRouterLink} placeholder="Pick an organization" />}
              footer={roleControls}
              linkComponent={ReactRouterLink}
              activePath={activePath}
              optionsStorageKey="genesis-demo:app-shell"
            >
              <Outlet />
            </AppShell>
          </DemoContext.Provider>
        </FeatureGateProvider>
      </WorkspaceScope>
    </GenesisProvider>
  );
}
