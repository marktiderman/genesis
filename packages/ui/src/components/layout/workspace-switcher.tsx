"use client";

/**
 * The workspace switcher (docs/adr/0004-workspaces.md): which organization, roll-up or personal
 * space the viewer is working in, at the top of AppShell's sidebar (`headerSlot`), as a picture
 * on the collapsed rail (`collapsedHeaderSlot`) and as the title of the phone's top bar
 * (`mobileHeaderSlot`). Each choice is a link, so switching changes the URL and the browser's
 * back button undoes it.
 *
 * It reads `WorkspaceScope` (genesis-core) for the list, the current workspace and each link,
 * so in an app with a WorkspaceScope it takes no data props. Every part can be replaced: the
 * group labels, the picture, each row, and the menu's last items (`footer`).
 */
import type { ReactNode } from "react";
import { Check, ChevronsUpDown, Layers, UserRound, type LucideIcon } from "lucide-react";

import { useWorkspace } from "@marktiderman/genesis-core/hooks";
import {
  groupWorkspaces,
  workspaceHref,
  workspaceInitials,
  WORKSPACE_KIND_ORDER,
  type Workspace,
  type WorkspaceKind,
} from "@marktiderman/genesis-core/workspaces";

import { cn } from "../../utils";
import { DefaultLink, type LinkComponent } from "../../navigation";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

/** @stability Beta */
export type WorkspaceSwitcherVariant = "sidebar" | "rail" | "bar";

/** The default heading over each kind's group in the menu. */
export const DEFAULT_WORKSPACE_KIND_LABELS: Readonly<Partial<Record<WorkspaceKind, string>>> = {
  personal: "Personal",
  rollup: "Overview",
  tenant: "Organizations",
};

/** The default picture for a kind with no image of its own; tenants show their initials. */
export const DEFAULT_WORKSPACE_KIND_ICONS: Readonly<Partial<Record<WorkspaceKind, LucideIcon>>> = {
  personal: UserRound,
  rollup: Layers,
};

/** @stability Beta */
export interface WorkspaceSwitcherProps<W extends Workspace = Workspace> {
  /**
   * `sidebar` (default): the full row for `headerSlot`. `rail`: the picture alone, for the
   * collapsed rail's `collapsedHeaderSlot`. `bar`: the name and a chevron, for the phone's top bar.
   */
  variant?: WorkspaceSwitcherVariant;
  /** Every workspace; defaults to the nearest WorkspaceScope's. */
  workspaces?: readonly W[];
  /** The current workspace; defaults to the nearest WorkspaceScope's. */
  current?: W;
  /** Where each choice goes; defaults to the WorkspaceScope's, else the workspace's landing page. */
  hrefFor?: (workspace: W) => string;
  /** The router's link (see AppShell's `linkComponent`). */
  linkComponent?: LinkComponent;
  /** The order of the kinds in the menu (default personal, roll-up, tenants). */
  order?: readonly WorkspaceKind[];
  /** Headings over each kind's group; merged over the defaults. `null` hides a heading. */
  kindLabels?: Partial<Record<WorkspaceKind, string | null>>;
  /** Pictures for kinds without an image; merged over the defaults. */
  kindIcons?: Partial<Record<WorkspaceKind, LucideIcon>>;
  /** Replaces the picture (a brand mark, a colored tile). */
  renderImage?: (workspace: W, size: "sm" | "md") => ReactNode;
  /** Replaces a row's content in the menu (the link around it stays). */
  renderItem?: (workspace: W, state: { current: boolean }) => ReactNode;
  /** The menu's last items, after a separator: "New organization", "Manage workspaces". */
  footer?: ReactNode;
  /** Shown when the URL is in no workspace. Default "Choose a workspace". */
  placeholder?: string;
  /** Accessible name of the trigger. Default "Switch workspace". */
  label?: string;
  className?: string;
}

function WorkspaceImage<W extends Workspace>({
  workspace,
  size,
  icons,
  renderImage,
}: {
  workspace: W;
  size: "sm" | "md";
  icons: Partial<Record<WorkspaceKind, LucideIcon>>;
  renderImage?: WorkspaceSwitcherProps<W>["renderImage"];
}) {
  if (renderImage) return <>{renderImage(workspace, size)}</>;
  const Icon = workspace.image ? undefined : icons[workspace.kind];
  return (
    <Avatar className={cn("shrink-0 rounded-md", size === "sm" ? "size-6" : "size-8")} aria-hidden>
      {workspace.image ? <AvatarImage src={workspace.image} alt="" /> : null}
      <AvatarFallback
        className={cn(
          "rounded-md font-semibold",
          size === "sm" ? "text-[10px]" : "text-xs",
          workspace.kind === "tenant" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {Icon ? <Icon className={size === "sm" ? "size-3.5" : "size-4"} /> : workspaceInitials(workspace.label)}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * The workspace switcher. Put it in AppShell's `headerSlot`, and the `rail` and `bar` variants in
 * `collapsedHeaderSlot` and `mobileHeaderSlot`.
 *
 * @stability Beta
 */
export function WorkspaceSwitcher<W extends Workspace = Workspace>({
  variant = "sidebar",
  workspaces: workspacesProp,
  current: currentProp,
  hrefFor: hrefForProp,
  linkComponent: Link = DefaultLink,
  order = WORKSPACE_KIND_ORDER,
  kindLabels,
  kindIcons,
  renderImage,
  renderItem,
  footer,
  placeholder = "Choose a workspace",
  label = "Switch workspace",
  className,
}: WorkspaceSwitcherProps<W>) {
  const scope = useWorkspace<W>();
  const workspaces = workspacesProp ?? scope?.workspaces ?? [];
  const current = currentProp ?? scope?.current;
  const hrefFor =
    hrefForProp ?? scope?.hrefFor ?? ((to: W) => workspaceHref(workspaces, to, current?.path));
  const labels = { ...DEFAULT_WORKSPACE_KIND_LABELS, ...kindLabels };
  const icons = { ...DEFAULT_WORKSPACE_KIND_ICONS, ...kindIcons };
  const groups = groupWorkspaces(workspaces, order);
  const name = current?.label ?? placeholder;

  const trigger =
    variant === "rail" ? (
      <Button
        type="button"
        variant="ghost"
        aria-label={`${label}: ${name}`}
        title={name}
        className="mx-auto size-10 p-0 hover:bg-sidebar-accent"
      >
        {current ? <WorkspaceImage workspace={current} size="md" icons={icons} renderImage={renderImage} /> : <ChevronsUpDown className="size-4" />}
      </Button>
    ) : variant === "bar" ? (
      <Button
        type="button"
        variant="ghost"
        aria-label={`${label}: ${name}`}
        className="h-auto min-w-0 justify-start gap-2 px-1 py-1 text-left"
      >
        {current ? <WorkspaceImage workspace={current} size="sm" icons={icons} renderImage={renderImage} /> : null}
        <span className="truncate font-semibold">{name}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Button>
    ) : (
      <Button
        type="button"
        variant="ghost"
        aria-label={`${label}: ${name}`}
        className="h-auto w-full min-w-0 justify-start gap-2 p-2 text-left hover:bg-sidebar-accent"
      >
        {current ? <WorkspaceImage workspace={current} size="md" icons={icons} renderImage={renderImage} /> : null}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">{name}</span>
          {current?.description ? (
            <span className="truncate text-xs text-muted-foreground">{current.description}</span>
          ) : null}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Button>
    );

  return (
    <div className={cn(variant === "sidebar" && "p-2", className)} data-testid="workspace-switcher">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side={variant === "rail" ? "right" : "bottom"}
          className="w-64 max-w-[calc(100vw-2rem)]"
        >
          {groups.map((group, i) => {
            const heading = labels[group.kind];
            return (
              <DropdownMenuGroup key={group.kind}>
                {i > 0 ? <DropdownMenuSeparator /> : null}
                {heading ? (
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{heading}</DropdownMenuLabel>
                ) : null}
                {group.workspaces.map((w) => {
                  const isCurrent = w.id === current?.id;
                  return (
                    <DropdownMenuItem key={w.id} asChild>
                      <Link
                        href={hrefFor(w)}
                        className="flex w-full items-center gap-2"
                        {...(isCurrent ? { "aria-current": "page" as const } : {})}
                        testID={`workspace-switcher-item-${w.id}`}
                      >
                        {renderItem ? (
                          renderItem(w, { current: isCurrent })
                        ) : (
                          <>
                            <WorkspaceImage workspace={w} size="sm" icons={icons} renderImage={renderImage} />
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate">{w.label}</span>
                              {w.description ? (
                                <span className="truncate text-xs text-muted-foreground">{w.description}</span>
                              ) : null}
                            </span>
                            {isCurrent ? <Check className="size-4 shrink-0" aria-hidden /> : null}
                          </>
                        )}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            );
          })}
          {footer ? (
            <>
              <DropdownMenuSeparator />
              {footer}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
