/**
 * Workspaces (docs/adr/0004-workspaces.md): where the viewer is working, chosen first and kept in
 * the URL. A workspace is one tenant (an organization), the roll-up across them, or the viewer's
 * own personal space. Everything inside it is scoped to it: its `scope` is the `ResourceScope`
 * every view reads, and its path prefixes every URL inside it.
 *
 * Router-free and DOM-free, like `navigation`: web and native shells share it.
 */

import type { ResourceScope } from "./hooks/viewer-scope";
import type { GenesisViewerRoles } from "./viewer";

/**
 * The kinds of workspace. Genesis ships three; an app adds its own by module augmentation, and
 * the switcher groups and orders them like the built-in ones:
 *
 * ```ts
 * declare module "@marktiderman/genesis-core/workspaces" {
 *   interface GenesisWorkspaceKinds {
 *     location: true;
 *   }
 * }
 * ```
 *
 * @stability Beta
 */
export interface GenesisWorkspaceKinds {
  /** One tenant: an organization the viewer is a member or staff of. */
  tenant: true;
  /** The roll-up across every tenant the viewer works in. */
  rollup: true;
  /** The viewer's own things, belonging to no tenant. */
  personal: true;
}

/** @stability Beta */
export type WorkspaceKind = keyof GenesisWorkspaceKinds;

/**
 * One place the viewer can work in.
 *
 * @stability Beta
 */
export interface Workspace {
  /** Unique among the viewer's workspaces. For a tenant, usually its URL segment. */
  id: string;
  kind: WorkspaceKind;
  /** Its name: the organization's name, "All organizations", "Personal". */
  label: string;
  /** A second line in the switcher: the viewer's role there, a location. */
  description?: string;
  /**
   * Where it starts, and the prefix of every URL inside it: `/o/acme`, `/all`, `/me`. Matched at
   * segment boundaries, so `/o/acme` never matches `/o/acme-west`.
   */
  path: string;
  /** What views read inside it: `{ orgId }`, `{ orgId: [...] }`, `{ personId }`. */
  scope: ResourceScope;
  /** The viewer's roles here, for view guards (see `GenesisViewerRoles`). */
  roles?: GenesisViewerRoles;
  /** The workspace's IANA time zone, for columns read on the scope's clock. */
  timeZone?: string | null;
  /** Its picture: a logo URL, else initials made from `label`. */
  image?: string;
  /** Anything else the app needs; Genesis never reads it. */
  meta?: Readonly<Record<string, unknown>>;
}

/** The kinds in their default order: personal, roll-up, then each tenant. */
export const WORKSPACE_KIND_ORDER: readonly WorkspaceKind[] = ["personal", "rollup", "tenant"];

function trimPath(path: string): string {
  const bare = path.split(/[?#]/)[0] ?? "";
  // Trailing slashes off, keeping "/" itself. A loop, not /\/+$/, which is slow on many slashes.
  let end = bare.length;
  while (end > 1 && bare[end - 1] === "/") end--;
  return bare.slice(0, end);
}

function within(pathname: string, prefix: string): boolean {
  const p = trimPath(pathname);
  const w = trimPath(prefix);
  if (w === "/") return true;
  return p === w || p.startsWith(`${w}/`);
}

/**
 * The workspace a URL is in: the one whose `path` is the longest prefix of `pathname`, or
 * undefined when the URL is in none (a sign-in page, the app's front door).
 *
 * @stability Beta
 */
export function workspaceAt<W extends Workspace>(workspaces: readonly W[], pathname: string): W | undefined {
  let best: W | undefined;
  for (const w of workspaces) {
    if (within(pathname, w.path) && (!best || trimPath(w.path).length > trimPath(best.path).length)) best = w;
  }
  return best;
}

/**
 * The path inside a workspace: `/o/acme/clients/42` in `/o/acme` is `/clients/42`; the workspace's
 * own landing page is `/`.
 *
 * @stability Beta
 */
export function pathInWorkspace(workspace: Pick<Workspace, "path">, pathname: string): string {
  const w = trimPath(workspace.path);
  const p = trimPath(pathname);
  if (!within(p, w)) return "/";
  const rest = w === "/" ? p : p.slice(w.length);
  return rest || "/";
}

/** @stability Beta */
export interface WorkspaceHrefOptions {
  /**
   * Whether to keep the viewer's place when switching: given the path inside the current
   * workspace (`/clients`) and the two workspaces, return the path to open in the target, or
   * false for its landing page. By default the place is kept between workspaces of the same kind,
   * up to the first segment (a list, not one record that belongs to the old workspace):
   * `/o/acme/clients/42` switches to `/o/globex/clients`.
   */
  keep?: (rest: string, from: Workspace, to: Workspace) => string | false;
}

/** The default `keep`: the same kind keeps the section (the first segment), never a record. */
export function keepSection(rest: string, from: Workspace, to: Workspace): string | false {
  if (from.kind !== to.kind) return false;
  const section = rest.split("/").filter(Boolean)[0];
  return section ? `/${section}` : false;
}

/**
 * Where switching to `to` goes from `pathname`. The URL moves with the viewer: it lands in the same
 * section of the new workspace when that makes sense (see `keep`), else on its landing page.
 *
 * @stability Beta
 */
export function workspaceHref(
  workspaces: readonly Workspace[],
  to: Workspace,
  pathname: string | undefined,
  options: WorkspaceHrefOptions = {},
): string {
  const from = pathname === undefined ? undefined : workspaceAt(workspaces, pathname);
  if (!from || from.id === to.id || pathname === undefined) return to.path;
  const kept = (options.keep ?? keepSection)(pathInWorkspace(from, pathname), from, to);
  if (!kept || kept === "/") return to.path;
  const base = trimPath(to.path);
  return `${base === "/" ? "" : base}${kept.startsWith("/") ? kept : `/${kept}`}`;
}

/** @stability Beta */
export interface WorkspaceGroup<W extends Workspace = Workspace> {
  kind: WorkspaceKind;
  workspaces: W[];
}

/**
 * The workspaces grouped by kind, in `order` (default {@link WORKSPACE_KIND_ORDER}, then any kind
 * an app added), each group in the order given. Empty groups are left out.
 *
 * @stability Beta
 */
export function groupWorkspaces<W extends Workspace>(
  workspaces: readonly W[],
  order: readonly WorkspaceKind[] = WORKSPACE_KIND_ORDER,
): WorkspaceGroup<W>[] {
  const kinds = [...order];
  for (const w of workspaces) if (!kinds.includes(w.kind)) kinds.push(w.kind);
  return kinds
    .map((kind) => ({ kind, workspaces: workspaces.filter((w) => w.kind === kind) }))
    .filter((g) => g.workspaces.length > 0);
}

/**
 * The workspace to open when the URL names none (the app's front door): the remembered one if the
 * viewer still has it, else the first tenant, else the first workspace.
 *
 * @stability Beta
 */
export function defaultWorkspace<W extends Workspace>(workspaces: readonly W[], rememberedId?: string | null): W | undefined {
  return (
    (rememberedId ? workspaces.find((w) => w.id === rememberedId) : undefined) ??
    workspaces.find((w) => w.kind === "tenant") ??
    workspaces[0]
  );
}

/**
 * Initials for a workspace with no image: the first letters of its first two words.
 *
 * @stability Beta
 */
export function workspaceInitials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0]![0], words[1]![0]] : [...(words[0] ?? "")].slice(0, 2);
  return letters.join("").toUpperCase();
}
