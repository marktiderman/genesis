/**
 * `createSupport(options)`: the support block for `GenesisNativeApp`.
 *
 *   <GenesisNativeApp blocks={[support]} appFeatures={["account"]}>
 *
 * It adds "Send feedback" and "Help" to Settings (`useBlockSettings`), names
 * its routes and migration 0006, and its root listens for a shake (with an
 * accelerometer): the screen is captured and the feedback screen opens with
 * it, ready to mark up. `useSupport().openFeedback()` does the same from a
 * button anywhere (a devtools panel's "Send feedback" slot, a help icon).
 *
 * The screens are the app's route files, each a Genesis layout fed by a hook
 * from here (`useSupportInbox` → `InboxPage`, `useSupportThread` →
 * `ThreadPage`, `useIdeaBoard` → `InboxPage`, `FeedbackForm` in
 * `SettingsSubPage`).
 */
import { createContext, useContext, useEffect, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { Dimensions, Platform } from "react-native";
import type { NativeBlock, NativeBlockRootProps } from "@marktiderman/genesis-native";
import { useQuery } from "@tanstack/react-query";
import { NativeButton } from "@marktiderman/genesis-ui-native/components";
import { defineSupportBlock, supportPaths, SUPPORT_BLOCK_ID, type SupportPaths } from "../block";
import { createSupportClient, type SupportClient, type SupportSupabase } from "../client";
import { fill, resolveSupportCopy, type SupportCopy, type SupportCopyOverrides } from "../copy";
import { composeCollectors, createContextCollector, type ContextCollector, type ScreenshotContentType } from "../record";
import { listenForShake, type AccelerometerLike, type ShakeOptions, type ViewShotLike } from "./modules";

/** A screenshot waiting for the feedback screen. `uri` is a data URI. */
export interface PendingScreenshot {
  uri: string;
  contentType: ScreenshotContentType;
  width: number;
  height: number;
}

/** What the feedback screen opens with: where the person was, and maybe a screenshot of it. */
export interface PendingFeedback {
  route: string | null;
  screenshot: PendingScreenshot | null;
  /** Extra context to send with the report (the devtools overlay's debug report). */
  extra?: Record<string, unknown>;
}

export interface SupportOptions {
  /** The app's Supabase client (migration 0006 applied). */
  supabase: SupportSupabase;
  /** Opens a path (expo-router's `router.push`). */
  navigate: (href: string) => void;
  /** `Platform.OS`. Default from React Native. */
  platform?: string;
  /** The version signature sent with each report (`useVersionSignature().short`, or a function that reads it). */
  appVersion?: string | (() => string | undefined);
  /** The current route, as a hook (expo-router's `usePathname`). The root calls it. */
  useCurrentRoute?: () => string;
  /** More context (device facts, the update id). Merged over the defaults. */
  collector?: ContextCollector;
  /** `react-native-view-shot`. Without it there are no screenshots. */
  viewShot?: ViewShotLike;
  /** `expo-sensors`' `Accelerometer`. Without it (or with `shake: false`) shaking does nothing. */
  accelerometer?: AccelerometerLike;
  shake?: false | ShakeOptions;
  /** Default `/support`. The route files live under it. */
  basePath?: string;
  copy?: SupportCopyOverrides;
  /** The Settings rows' section (default `support`), or `false` for none. */
  settings?: false | { section?: string };
  /** `false` leaves the idea board out. */
  ideas?: boolean;
  /** Every caught error, for reporting. None of them reaches the person as a crash. */
  onError?: (error: Error, where: "capture" | "shake") => void;
}

export interface SupportBlock extends NativeBlock<typeof SUPPORT_BLOCK_ID> {
  readonly options: SupportOptions;
  readonly client: SupportClient;
  readonly copy: SupportCopy;
  readonly paths: SupportPaths;
  readonly collector: ContextCollector;
  /** Capture the screen (if it can and `screenshot` isn't false), then open the feedback screen. */
  openFeedback(options?: { screenshot?: boolean; extra?: Record<string, unknown>; delayMs?: number }): Promise<void>;
  /** Hand the feedback screen what it opens with (`takePending` empties it). */
  takePending(): PendingFeedback | null;
  peekPending(): PendingFeedback | null;
  subscribePending(listener: () => void): () => void;
  /** The route the person is on, as the root last saw it. */
  currentRoute(): string | null;
  readonly Root: ComponentType<NativeBlockRootProps>;
}

const SupportContext = createContext<SupportBlock | null>(null);

/** The support block, from `GenesisNativeApp blocks` (or `SupportProvider`). Throws outside one. */
export function useSupport(): SupportBlock {
  const block = useContext(SupportContext);
  if (!block) throw new Error("useSupport: no support block. Pass `blocks={[createSupport(…)]}` to GenesisNativeApp, or wrap in <SupportProvider>.");
  return block;
}

/** The same block, or `null` when support is off (for a button that hides itself). */
export function useOptionalSupport(): SupportBlock | null {
  return useContext(SupportContext);
}

export function SupportProvider({ block, children }: { block: SupportBlock; children?: ReactNode }) {
  return <SupportContext.Provider value={block}>{children}</SupportContext.Provider>;
}

export const SUPPORT_QUERY_ROOT = "genesis-support";

/** How many reports have a staff reply the person hasn't read. */
export function useUnreadReplies(): number {
  const block = useSupport();
  const { data } = useQuery({ queryKey: [SUPPORT_QUERY_ROOT, "reports"], queryFn: () => block.client.myReports(), staleTime: 60_000 });
  return (data ?? []).filter((r) => r.unread).length;
}

export function createSupport(options: SupportOptions): SupportBlock {
  const copy = resolveSupportCopy(options.copy);
  const paths = supportPaths(options.basePath);
  const client = createSupportClient(options.supabase);
  const platform = options.platform ?? Platform.OS;
  let route: string | null = null;
  let pending: PendingFeedback | null = null;
  const listeners = new Set<() => void>();
  const setPending = (next: PendingFeedback | null) => {
    pending = next;
    for (const l of listeners) l();
  };

  const defaults = createContextCollector({
    platform,
    appVersion: typeof options.appVersion === "function" ? options.appVersion : () => options.appVersion as string | undefined,
    route: () => route ?? undefined,
    device: () => {
      const screen = Dimensions.get("screen");
      return { os: platform, osVersion: String(Platform.Version), screen: { width: Math.round(screen.width), height: Math.round(screen.height), scale: screen.scale } };
    },
  });
  const collector = options.collector ? composeCollectors(defaults, options.collector) : defaults;

  const declaration = defineSupportBlock({
    basePath: options.basePath,
    copy: options.copy,
    settings: options.settings,
    ideas: options.ideas,
    useHelpSubtitle: () => {
      const unread = useUnreadReplies();
      return unread ? fill(copy.settings.unreadReplies, { count: unread }) : null;
    },
  });

  const report = (error: unknown, where: "capture" | "shake") => {
    try {
      options.onError?.(error instanceof Error ? error : new Error(String(error)), where);
    } catch {
      // a failing reporter never breaks support
    }
  };

  let opening = false;
  // The devtools overlay's "Send feedback" (its `devtoolsFeedback` slot): closes the overlay,
  // captures the screen under it and opens the feedback screen with the debug report attached.
  function DevtoolsFeedback({ debugInfo, close }: { debugInfo: string; close: () => void }) {
    return (
      <NativeButton
        variant="outline"
        testID="genesis-support-devtools-feedback"
        onPress={() => {
          close();
          void block.openFeedback({ extra: { debugInfo: debugInfo.slice(0, 8000) }, delayMs: 400 });
        }}
      >
        {copy.settings.sendFeedback}
      </NativeButton>
    );
  }

  const block: SupportBlock = {
    ...declaration,
    contributes: { ...declaration.contributes, slots: { devtoolsFeedback: DevtoolsFeedback as ComponentType<never> } },
    platforms: ["native"],
    options,
    client,
    copy,
    paths,
    collector,
    async openFeedback({ screenshot = true, extra, delayMs = 0 } = {}) {
      if (opening) return;
      opening = true;
      try {
        // Let a sheet that is closing (the devtools overlay) get out of the picture first.
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        let shot: PendingScreenshot | null = null;
        if (screenshot && options.viewShot) {
          try {
            const uri = await options.viewShot.captureScreen({ format: "jpg", quality: 0.8, result: "data-uri" });
            const window = Dimensions.get("window");
            const scale = Dimensions.get("screen").scale || 1;
            shot = { uri, contentType: "image/jpeg", width: Math.round(window.width * scale), height: Math.round(window.height * scale) };
          } catch (error) {
            report(error, "capture");
          }
        }
        setPending({ route, screenshot: shot, extra });
        options.navigate(paths.feedback);
      } finally {
        opening = false;
      }
    },
    takePending() {
      const p = pending;
      if (p) setPending(null);
      return p;
    },
    peekPending: () => pending,
    subscribePending(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    currentRoute: () => route,
    Root: function SupportRoot({ children }) {
      const current = (options.useCurrentRoute ?? noRoute)();
      useEffect(() => {
        if (current) route = current;
      }, [current]);
      useEffect(() => {
        if (!options.accelerometer || options.shake === false) return;
        try {
          return listenForShake(
            options.accelerometer,
            () => {
              // Already on a support screen: shaking again does nothing.
              if (route && route.startsWith(paths.inbox)) return;
              void block.openFeedback();
            },
            options.shake || {},
          );
        } catch (error) {
          report(error, "shake");
          return undefined;
        }
      }, []);
      return <SupportProvider block={block}>{children}</SupportProvider>;
    },
  };
  return block;
}

function noRoute(): string {
  return "";
}

/** The pending feedback, re-rendering when it changes. */
export function usePendingFeedback(): PendingFeedback | null {
  const block = useSupport();
  return useSyncExternalStore(block.subscribePending, block.peekPending, block.peekPending);
}
