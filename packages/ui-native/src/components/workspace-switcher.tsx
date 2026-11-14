/**
 * WorkspaceSwitcher — where the viewer is working (one organization, the roll-up, or personal),
 * and a sheet to switch: the twin of genesis-ui's WorkspaceSwitcher, on the same workspaces.
 *
 * It reads the nearest WorkspaceScope (genesis-core) when `workspaces` and `current` aren't
 * passed. The grouping, order, search, initials and badge words are genesis-core's
 * (`groupWorkspaces`, `filterWorkspaces`, `workspaceInitials`, `workspaceBadgeLabel`), so the
 * phone lists the same workspaces, in the same order, as the web.
 *
 * The phone navigates with its own router: `onSelect` gets the workspace and the href to go to
 * (the scope's `hrefFor`, keeping the viewer's place when it can). Put it in a screen's header
 * (`headerTitle`) or at the top of a tab.
 *
 * @stability Beta
 */
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useWorkspace } from "@marktiderman/genesis-core/hooks";
import {
  DEFAULT_WORKSPACE_KIND_LABELS,
  WORKSPACE_KIND_ORDER,
  WORKSPACE_SWITCHER_SEARCH_THRESHOLD,
  filterWorkspaces,
  groupWorkspaces,
  hasWorkspaceBadge,
  workspaceBadgeLabel,
  workspaceHref,
  workspaceInitials,
  type Workspace,
  type WorkspaceKind,
} from "@marktiderman/genesis-core/workspaces";
import { NativeAvatar } from "./avatar";
import { NativeBadge } from "./badge";
import { NativeListItem } from "./list-item";
import { NativeSearchBar } from "./search-bar";
import { NativeSectionListHeader } from "./section-list";
import { NativeSheet, NativeSheetScrollView } from "./sheet";
import { cn } from "../utils";

export interface NativeWorkspaceSwitcherProps<W extends Workspace = Workspace> {
  /** Every workspace; defaults to the nearest WorkspaceScope's. */
  workspaces?: readonly W[];
  /** The current workspace; defaults to the nearest WorkspaceScope's. */
  current?: W;
  /** The viewer picked a workspace: navigate to `href`. */
  onSelect: (workspace: W, href: string) => void;
  /** Where each choice goes; defaults to the WorkspaceScope's, else the workspace's landing page. */
  hrefFor?: (workspace: W) => string;
  /** The order of the kinds (default personal, roll-up, tenants). */
  order?: readonly WorkspaceKind[];
  /** Headings over each kind's group; `null` hides one. */
  kindLabels?: Partial<Record<WorkspaceKind, string | null>>;
  /** Replaces the picture (a brand mark). */
  renderImage?: (workspace: W, size: number) => ReactNode;
  /** What a screen reader hears for a badge. Default "3 new" for a number. */
  badgeLabel?: (workspace: W, value: string | number) => string;
  /** A search box over the list. `"auto"` past seven workspaces. Default `"auto"`. */
  search?: boolean | "auto";
  searchPlaceholder?: string;
  emptyText?: string;
  /** Shown when the viewer is in no workspace. Default "Choose a workspace". */
  placeholder?: string;
  /** The sheet's title and the trigger's hint. Default "Switch workspace". */
  label?: string;
  /** Rows at the bottom of the sheet ("Create an organization"). */
  actions?: readonly { id: string; label: string; onPress: () => void }[];
  /** Controlled open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** `row` (default): picture, name and description. `compact`: the name and a chevron, for a header. */
  variant?: "row" | "compact";
  className?: string;
  testID?: string;
}

const NO_WORKSPACES: readonly Workspace[] = [];

export function NativeWorkspaceSwitcher<W extends Workspace = Workspace>({
  workspaces: workspacesProp,
  current: currentProp,
  onSelect,
  hrefFor: hrefForProp,
  order = WORKSPACE_KIND_ORDER,
  kindLabels,
  renderImage,
  badgeLabel = workspaceBadgeLabel,
  search = "auto",
  searchPlaceholder = "Find a workspace",
  emptyText = "No workspaces found",
  placeholder = "Choose a workspace",
  label = "Switch workspace",
  actions,
  open: openProp,
  onOpenChange,
  variant = "row",
  className,
  testID = "workspace-switcher",
}: NativeWorkspaceSwitcherProps<W>) {
  const scope = useWorkspace<W>();
  const workspaces = workspacesProp ?? scope?.workspaces ?? (NO_WORKSPACES as readonly W[]);
  const current = currentProp ?? scope?.current;
  const hrefFor = hrefForProp ?? scope?.hrefFor ?? ((to: W) => workspaceHref(workspaces, to, current?.path));
  const labels = { ...DEFAULT_WORKSPACE_KIND_LABELS, ...kindLabels };
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const [query, setQuery] = useState("");
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
    if (!next) setQuery("");
  };
  const showSearch = search === true || (search === "auto" && workspaces.length > WORKSPACE_SWITCHER_SEARCH_THRESHOLD);
  const groups = groupWorkspaces(showSearch ? filterWorkspaces(workspaces, query) : workspaces, order);

  const picture = (w: W | undefined, size: number) =>
    w && renderImage ? renderImage(w, size) : <NativeAvatar size={size} src={w?.image ?? null} fallback={w ? workspaceInitials(w.label) : "?"} alt="" />;

  const pick = (w: W) => {
    setOpen(false);
    if (w.id !== current?.id) onSelect(w, hrefFor(w));
  };

  return (
    <>
      <Pressable
        testID={`${testID}-trigger`}
        accessibilityRole="button"
        accessibilityLabel={current ? `${current.label}${current.description ? `, ${current.description}` : ""}` : placeholder}
        accessibilityHint={label}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        className={cn("min-h-[44px] flex-row items-center gap-3", variant === "row" ? "rounded-lg px-3 py-2" : "px-1", className)}
      >
        {variant === "row" ? <View accessibilityElementsHidden>{picture(current, 32)}</View> : null}
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className={cn("text-foreground", variant === "row" ? "text-base font-semibold" : "text-base font-semibold")}>
            {current?.label ?? placeholder}
          </Text>
          {variant === "row" && current?.description ? (
            <Text numberOfLines={1} className="text-xs text-muted-foreground">
              {current.description}
            </Text>
          ) : null}
        </View>
        <Text className="text-muted-foreground" accessibilityElementsHidden>
          ⌄
        </Text>
      </Pressable>
      <NativeSheet open={open} onOpenChange={setOpen} testID={`${testID}-sheet`} snapPoints={["60%", "90%"]}>
        <NativeSheetScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          <Text accessibilityRole="header" className="px-4 pb-2 pt-1 text-lg font-semibold text-foreground">
            {label}
          </Text>
          {showSearch ? (
            <View className="px-4 pb-2">
              <NativeSearchBar testID={`${testID}-search`} value={query} onChange={setQuery} placeholder={searchPlaceholder} showCancel={false} />
            </View>
          ) : null}
          {groups.length === 0 ? (
            <Text testID={`${testID}-empty`} className="px-4 py-6 text-center text-sm text-muted-foreground">
              {emptyText}
            </Text>
          ) : (
            groups.map((group) => (
              <View key={group.kind} accessibilityRole="radiogroup">
                {labels[group.kind] ? <NativeSectionListHeader title={labels[group.kind]!} /> : null}
                {group.workspaces.map((w) => {
                  const selected = w.id === current?.id;
                  const badge = hasWorkspaceBadge(w.badge) ? w.badge : null;
                  return (
                    <NativeListItem
                      key={w.id}
                      testID={`${testID}-option-${w.id}`}
                      title={w.label}
                      subtitle={w.description}
                      leading={picture(w, 32)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      // One element: its badge's words go in its name, or they're never read.
                      accessibilityLabel={[w.label, w.description, badge !== null ? badgeLabel(w, badge) : null].filter(Boolean).join(", ")}
                      trailing={
                        <View className="flex-row items-center gap-2">
                          {badge !== null ? (
                            <NativeBadge variant="secondary" accessibilityLabel={badgeLabel(w, badge)}>
                              {String(badge)}
                            </NativeBadge>
                          ) : null}
                          {selected ? <Text className="text-base text-primary-text">✓</Text> : null}
                        </View>
                      }
                      onPress={() => pick(w)}
                    />
                  );
                })}
              </View>
            ))
          )}
          {actions?.length ? (
            <View className="mt-2 border-t border-border">
              {actions.map((a) => (
                <NativeListItem
                  key={a.id}
                  testID={`${testID}-action-${a.id}`}
                  title={a.label}
                  onPress={() => {
                    setOpen(false);
                    a.onPress();
                  }}
                />
              ))}
            </View>
          ) : null}
        </NativeSheetScrollView>
      </NativeSheet>
    </>
  );
}
