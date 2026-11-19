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
import type { HelpAnswerResponse } from "../help-ask";
import type { OfficeHours } from "../office-hours";
import type { SupportChatClient } from "../chat";
import { fill, resolveSupportCopy, type SupportCopy, type SupportCopyOverrides } from "../copy";
import { composeCollectors, createContextCollector, type ContextCollector, type FeedbackSink, type ScreenshotContentType } from "../record";
import type { Diagnostics } from "../diagnostics/create";
import { DIAGNOSTICS_DEFAULTS } from "../diagnostics/report";
import { listenForShake, type AccelerometerLike, type ShakeOptions, type ViewShotLike } from "./modules";
import { SendDiagnosticsRow } from "./diagnostics";
import { supportSettingValues, type SupportSettingsInput, type SupportSettingValues } from "../settings";
import { inZone, stripZone, zoneOf } from "../routes";

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
  /**
   * genesis-chat's client (`createChatClient(supabase)`): with the support-chat block's migration
   * applied, a report's thread runs on genesis-chat (live, with files). Without it, support_replies.
   */
  chat?: SupportChatClient;
  /** Opens a path (expo-router's `router.push`). */
  navigate: (href: string) => void;
  /**
   * The tenant the messenger's tickets and articles belong to: usually the viewer's current
   * workspace, or a function that reads it now. Left out, the app's own.
   */
  tenantId?: string | null | (() => string | null);
  /** Calls your endpoint for `answerHelpQuestion`, with the person's token: a plain `fetch`, as this is made outside React. Without it (or with the tenant's AI off) search is all there is. */
  askAi?: (questionId: string) => Promise<HelpAnswerResponse>;
  /** The person hasn't agreed to share with the AI's vendor: opens your screen for that. */
  onAiConsent?: () => void;
  /**
   * How soon people hear back, in your words, after "We usually reply" ("within a few hours",
   * "in under a day"): `useStartConversation` says it, and `useSupportThread` under a conversation
   * nobody has answered yet. The same as `SupportMessenger`'s on the web.
   */
  replyExpectation?: string;
  /** When someone answers. Outside them, the same screens say you're away and when you're back, in the person's own time. */
  officeHours?: OfficeHours;
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
  /**
   * The app's other navigation zones, as route prefixes (`["/admin", "/coach"]`): each is its own
   * stack with support mounted under it (`/admin` + `basePath`). A link support opens stays in the
   * zone the person is in, and `SupportRoute` renders the right screen in each, so one route file
   * per zone (two with an index) replaces a copy of every screen. Leave it out with one zone.
   */
  zones?: readonly string[];
  /**
   * What `SupportRoute` needs from the router (expo-router): `Screen` sets the stack header
   * (`Stack.Screen`), `useSearchParams` reads `?q=` and `?collection=` on the help center
   * (`useLocalSearchParams`). Without them, no header options and no search params.
   */
  router?: {
    Screen?: ComponentType<{ options?: Record<string, unknown> }>;
    useSearchParams?: () => Readonly<Record<string, string | string[] | undefined>>;
  };
  copy?: SupportCopyOverrides;
  /** The Settings rows' section (default `support`), or `false` for none. */
  settings?: false | { section?: string };
  /** `false` leaves the idea board out. */
  ideas?: boolean;
  /**
   * The context dump (`createDiagnostics`): sent on a shake (`dumpOnShake`) and with every piece
   * of feedback (`dumpOnFeedback`, linked by `diagnosticsId`), kept up to date with the route,
   * and offered as "Send diagnostics" in the devtools overlay.
   */
  diagnostics?: Diagnostics;
  /** React Native's `AppState`: queued dumps go when the app comes to the front, and `session.foreground` follows it. */
  appState?: { addEventListener(type: "change", listener: (state: string) => void): { remove(): void } };
  /** `@react-native-community/netinfo`: queued dumps go when the connection is back. */
  netInfo?: { addEventListener(listener: (state: { isConnected: boolean | null }) => void): () => void };
  /** Send a dump when the phone is shaken. Default true. */
  dumpOnShake?: boolean;
  /** Send a dump with every piece of feedback. Default true. */
  dumpOnFeedback?: boolean;
  /**
   * Where feedback goes instead of the Supabase client: `diagnostics.feedbackSink` for an app whose
   * feedback goes to its own API (`httpTransport`), screenshots and dump in one request.
   */
  feedbackSink?: FeedbackSink;
  /** Every caught error, for reporting. None of them reaches the person as a crash. */
  onError?: (error: Error, where: "capture" | "shake" | "diagnostics") => void;
  /**
   * Genesis settings: what `resolveSettings` (or genesis-supabase's `resolveAppSettings`) returned,
   * the values alone, or a function that reads them now (the person's `shake.enabled` is read at
   * each shake). It decides the idea board (`support.ideas`), the Settings rows
   * (`support.feedback`, `support.inbox`), the reply expectation, shake to report (`shake.*`) and
   * the dump (`diagnostics.*`). An option given here wins over its setting. Without either, the
   * `max` preset: everything on.
   */
  appSettings?: SupportSettingsInput | (() => SupportSettingsInput | null | undefined);
}

export interface SupportBlock extends NativeBlock<typeof SUPPORT_BLOCK_ID> {
  /** The options with the settings applied (an option the app gave wins over its setting). */
  readonly options: SupportOptions;
  /** Support's settings now (the `max` preset where none are given). */
  settings(): SupportSettingValues;
  readonly client: SupportClient;
  readonly copy: SupportCopy;
  readonly paths: SupportPaths;
  readonly collector: ContextCollector;
  /** The context dump, when the app passed `diagnostics`. */
  readonly diagnostics: Diagnostics | null;
  /** Capture the screen (if it can and `screenshot` isn't false), then open the feedback screen. */
  openFeedback(options?: { screenshot?: boolean; extra?: Record<string, unknown>; delayMs?: number }): Promise<void>;
  /** Hand the feedback screen what it opens with (`takePending` empties it). */
  takePending(): PendingFeedback | null;
  peekPending(): PendingFeedback | null;
  subscribePending(listener: () => void): () => void;
  /** The route the person is on, as the root last saw it. */
  currentRoute(): string | null;
  /** The navigation zone the person is in (one of `zones`), or "" for none. */
  zone(): string;
  readonly Root: ComponentType<NativeBlockRootProps>;
}

const SupportContext = createContext<SupportBlock | null>(null);

/** How long to let an overlay whose `close` returns nothing slide away before capturing. */
const LEGACY_CLOSE_MS = 400;

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

/** The options with the settings filled in where the app left an option out. */
function applySettings(options: SupportOptions, s: SupportSettingValues): SupportOptions {
  const shake: SupportOptions["shake"] =
    options.shake === false || !s.support.feedback
      ? false
      : { threshold: s.shake.threshold, jolts: s.shake.jolts, windowMs: s.shake.windowMs, cooldownMs: s.shake.cooldownMs, ...(options.shake ?? {}) };
  const replyExpectation = options.replyExpectation ?? s.support.replyExpectation ?? undefined;
  return {
    ...options,
    ideas: options.ideas ?? s.support.ideas,
    ...(replyExpectation !== undefined ? { replyExpectation } : {}),
    shake,
    // Diagnostics off: no dump anywhere (shake, feedback, the devtools row), whatever was passed.
    ...(s.diagnostics.enabled ? {} : { diagnostics: undefined }),
    dumpOnShake: options.dumpOnShake ?? s.diagnostics.dumpOnShake,
    dumpOnFeedback: options.dumpOnFeedback ?? s.diagnostics.dumpOnFeedback,
  };
}

export function createSupport(given: SupportOptions): SupportBlock {
  const readSettings = (): SupportSettingValues => supportSettingValues(typeof given.appSettings === "function" ? given.appSettings() : given.appSettings);
  const initialSettings = readSettings();
  const options = applySettings(given, initialSettings);
  const copy = resolveSupportCopy(options.copy);
  const paths = supportPaths(options.basePath);
  const client = createSupportClient(options.supabase, { chat: options.chat, ...(options.tenantId !== undefined ? { tenantId: options.tenantId } : {}) });
  const platform = options.platform ?? Platform.OS;
  let route: string | null = null;
  const zones = options.zones ?? [];
  // Every link support opens stays in the zone the person is in.
  const appNavigate = options.navigate;
  options.navigate = (href: string) => appNavigate(inZone(href, zoneOf(route ?? "", zones)));
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
    feedback: initialSettings.support.feedback,
    inbox: initialSettings.support.inbox,
    useHelpSubtitle: () => {
      const unread = useUnreadReplies();
      return unread ? fill(copy.settings.unreadReplies, { count: unread }) : null;
    },
  });

  const report = (error: unknown, where: "capture" | "shake" | "diagnostics") => {
    try {
      options.onError?.(error instanceof Error ? error : new Error(String(error)), where);
    } catch {
      // a failing reporter never breaks support
    }
  };

  let opening = false;
  // The devtools overlay's "Send feedback" (its `devtoolsFeedback` slot): closes the overlay,
  // waits for its sheet to be gone (a capture during the dismissal caught the sheet half way
  // down), then captures the screen under it and opens the feedback screen with the debug report.
  function DevtoolsFeedback({ debugInfo, close }: { debugInfo: string; close: () => Promise<void> | void }) {
    return (
      <NativeButton
        variant="outline"
        testID="genesis-support-devtools-feedback"
        onPress={async () => {
          const closed = close();
          // An overlay whose close doesn't say when it's done: give its sheet time to leave.
          await (closed instanceof Promise ? closed : new Promise((resolve) => setTimeout(resolve, LEGACY_CLOSE_MS)));
          void block.openFeedback({ extra: { debugInfo: debugInfo.slice(0, 8000) } });
        }}
      >
        {copy.settings.sendFeedback}
      </NativeButton>
    );
  }

  // The devtools overlay's "Send diagnostics" (its `devtoolsDiagnostics` slot), beside "Copy debug info".
  function DevtoolsDiagnostics({ copy: copyText }: { copy: (text: string) => unknown }) {
    return <SendDiagnosticsRow diagnostics={options.diagnostics ?? null} copy={copyText} copyText={copy.diagnostics} hideHint testID="genesis-support-devtools-diagnostics" />;
  }

  const block: SupportBlock = {
    ...declaration,
    contributes: {
      ...declaration.contributes,
      slots: {
        devtoolsFeedback: DevtoolsFeedback as ComponentType<never>,
        ...(options.diagnostics && initialSettings.diagnostics.sendFromSettings ? { devtoolsDiagnostics: DevtoolsDiagnostics as ComponentType<never> } : {}),
      },
    },
    diagnostics: options.diagnostics ?? null,
    platforms: ["native"],
    options,
    settings: readSettings,
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
    zone: () => zoneOf(route ?? "", zones),
    Root: function SupportRoot({ children }) {
      const current = (options.useCurrentRoute ?? noRoute)();
      useEffect(() => {
        if (current) route = current;
        if (current) options.diagnostics?.recordRoute(current);
      }, [current]);
      useEffect(() => {
        const diagnostics = options.diagnostics;
        if (!diagnostics) return;
        const flush = () => void diagnostics.flush().catch((error: unknown) => report(error, "diagnostics"));
        const app = options.appState?.addEventListener("change", (state) => {
          diagnostics.setForeground(state === "active");
          if (state === "active") flush();
        });
        let wasConnected: boolean | null = null;
        const stopNet = options.netInfo?.addEventListener((state) => {
          if (state.isConnected && wasConnected === false) flush();
          wasConnected = state.isConnected;
        });
        return () => {
          app?.remove();
          stopNet?.();
        };
      }, []);
      useEffect(() => {
        if (!options.accelerometer || options.shake === false) return;
        try {
          return listenForShake(
            options.accelerometer,
            () => {
              // Already on a support screen: shaking again does nothing.
              if (route && stripZone(route, zones).startsWith(paths.inbox)) return;
              // The person turned shake to report off (shake.enabled is theirs to change).
              if (!readSettings().shake.enabled) return;
              if (options.diagnostics && (options.dumpOnShake ?? DIAGNOSTICS_DEFAULTS.dumpOnShake)) {
                options.diagnostics.send({ trigger: "shake" }).catch((error: unknown) => report(error, "diagnostics"));
              }
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
