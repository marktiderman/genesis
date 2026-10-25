/**
 * Blocks on native: `defineBlock` declarations (from
 * `@marktiderman/genesis-features/blocks`) with the two things only a native
 * shell can run, boot steps behind the splash and a root around the screens.
 * `<GenesisNativeApp blocks={[…]}>` resolves them once, runs their steps,
 * mounts their roots, puts their slot fills under the app's own `slots`, and
 * hands their Settings rows to `useBlockSettings`.
 */
import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import type { SlotPropsFor, Slots } from "@marktiderman/genesis-core/slots";
import type { BlockDef, BlockSettingsRow, Contributed, ResolvedBlocks } from "@marktiderman/genesis-features/blocks";
import type { BootStep } from "./boot";
import type { ErrorReport } from "./errors";
import type { NativeAppSlots } from "./app";

/** What a block's `Root` is given: the app's slots, with every block's fills merged under them. @stability Beta */
export interface NativeBlockRootProps {
  slots?: Slots<NativeAppSlots>;
  slotProps?: SlotPropsFor<NativeAppSlots>;
  children?: ReactNode;
}

/**
 * A block a native shell can run. `contributes.slots` fills `GenesisNativeApp`
 * slots by name (the app's own `slots` win).
 *
 * @stability Beta
 */
export interface NativeBlock<Id extends string = string> extends BlockDef<Id, ComponentType<never>> {
  /** Run behind the splash after the app's own `steps`, before the session. A step that fails fails the boot, so keep them bounded. */
  readonly bootSteps?: readonly BootStep[];
  /** Mounted around the screens, inside the shell's error boundary. The first block's root is the outermost. */
  readonly Root?: ComponentType<NativeBlockRootProps>;
  /**
   * Every error the shell catches (render, global, boot, rejection), before
   * the app's own `onError`. The observability block reports them here. A
   * throw is ignored.
   */
  readonly onError?: (error: Error, report: ErrorReport) => void;
}

/** @internal Hand an error to each block's `onError`; one that throws never stops the rest. */
export function reportToBlocks(blocks: readonly NativeBlock[], error: Error, report: ErrorReport): void {
  for (const block of blocks) {
    if (!block.onError) continue;
    try {
      block.onError(error, report);
    } catch {
      // A failing reporter must not take the error path down with it.
    }
  }
}

const BlocksContext = createContext<ResolvedBlocks<NativeBlock> | null>(null);

/** @internal Provided by GenesisNativeApp. */
export const BlocksProvider = BlocksContext.Provider;

/**
 * The resolved blocks: their ids, nav entries, Settings rows, routes and the
 * rest, each tagged with its FeatureId. Throws outside `GenesisNativeApp`.
 *
 * @stability Beta
 */
export function useBlocks(): ResolvedBlocks<NativeBlock> {
  const blocks = useContext(BlocksContext);
  if (!blocks) throw new Error("useBlocks: no blocks. Render inside <GenesisNativeApp>.");
  return blocks;
}

/** A Settings section as `SettingsPage` from `@marktiderman/genesis-ui-native` takes it. @stability Beta */
export interface BlockSettingsSection<R extends { id: string; title: string } = SettingsRowLike> {
  id: string;
  title?: string;
  footnote?: string;
  rows: R[];
}

/** The row fields a block can fill. @stability Beta */
export interface SettingsRowLike {
  id: string;
  title: string;
  subtitle?: string;
  showChevron?: boolean;
  onPress?: () => void;
  testID?: string;
}

/** @stability Beta */
export interface UseBlockSettingsOptions {
  /** Open a row's `href` (expo-router's `router.push`). Without it, rows with an `href` aren't pressable. */
  navigate?: (href: string) => void;
  /** Titles for sections a block names that `sections` doesn't have. Default the section id. */
  sectionTitles?: Readonly<Record<string, string>>;
}

/**
 * The app's Settings sections with every block's rows added: each row goes
 * at the end of the section its `section` names (by `order`, then block
 * order), and a section no one has yet is added after the rest.
 *
 * Calls each row's `useSubtitle` hook, so call it unconditionally at the top
 * of the Settings screen. The blocks are fixed for the life of the app, so
 * the hooks run in the same order on every render.
 *
 * @stability Beta
 */
export function useBlockSettings<R extends SettingsRowLike>(
  sections: readonly BlockSettingsSection<R>[],
  options: UseBlockSettingsOptions = {},
): BlockSettingsSection<R | SettingsRowLike>[] {
  const blocks = useContext(BlocksContext);
  const rows = blocks?.settings ?? [];
  // The same hooks in the same order every render: `rows` never changes once the shell has resolved it.
  const subtitles = rows.map((row) => row.useSubtitle?.());
  return mergeBlockSettings(sections, rows, subtitles, options);
}

/** The merge `useBlockSettings` does, without hooks (subtitles already read). @stability Beta */
export function mergeBlockSettings<R extends SettingsRowLike>(
  sections: readonly BlockSettingsSection<R>[],
  rows: readonly Contributed<BlockSettingsRow>[],
  subtitles: readonly (string | null | undefined)[] = [],
  options: UseBlockSettingsOptions = {},
): BlockSettingsSection<R | SettingsRowLike>[] {
  const out: BlockSettingsSection<R | SettingsRowLike>[] = sections.map((s) => ({ ...s, rows: [...s.rows] }));
  rows.forEach((row, i) => {
    let section = out.find((s) => s.id === row.section);
    if (!section) {
      section = { id: row.section, title: options.sectionTitles?.[row.section] ?? row.section, rows: [] };
      out.push(section);
    }
    const { navigate } = options;
    const href = row.href;
    section.rows.push({
      id: row.id,
      title: row.title,
      subtitle: subtitles[i] ?? row.subtitle,
      testID: row.testID,
      ...(href && navigate ? { showChevron: true, onPress: () => navigate(href) } : {}),
    });
  });
  return out;
}
