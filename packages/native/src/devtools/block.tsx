/**
 * `createDevtools(options)`: the devtools overlay, for development, preview
 * and internal builds only. A hold with three fingers (in every build), a
 * shake (with an accelerometer) or "Open devtools" in React Native's dev menu
 * opens a sheet with:
 *
 * - the version signature, the update channel and a channel switch (the
 *   updates block's guarded `channels`: on only where it allows it);
 * - the signed-in user's id, the blocks in effect (`useBlocks`) and the
 *   app's flags;
 * - the recent breadcrumbs and errors (the observability block's, scrubbed);
 * - the server's base URL;
 * - "Copy debug info", "Crash test", "Clear cache" and "Sign out";
 * - the `devtoolsFeedback` slot, which the support block fills with
 *   "Send feedback".
 *
 * Keep it out of production bundles: import this entry only behind a
 * condition Metro can fold at build time (see the README), and pass
 * `enabled` from a fact of the binary as a second lock. With `enabled`
 * false the block mounts nothing and listens to nothing.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { Alert, Modal, ScrollView, Share, View, type GestureResponderEvent } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { renderSlot } from "@marktiderman/genesis-core/slots";
import { NativeButton, NativeInput, NativeText } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { defineBlock } from "@marktiderman/genesis-features/blocks";
import { useSession } from "../auth";
import { useBlocks, type NativeBlock, type NativeBlockRootProps } from "../blocks";
import { useRecentActivity, type ObservabilityBlock } from "../observability/block";
import { scrubString, scrubUrl } from "../observability/scrub";
import type { UpdatesBlock } from "../updates/block";
import type { ChannelSwitchResult } from "../updates/channels";
import { versionSignature, type VersionSignature } from "../updates/signature";
import { createHoldDetector, createShakeDetector, type AccelerometerLike } from "./gestures";
import { buildDebugInfo } from "./info";
import type { DevtoolsFeedbackProps } from "./slots";

/** The FeatureId of the devtools overlay. */
export const DEVTOOLS_BLOCK_ID = "devtools-overlay";

/** React Native's `DevSettings` (development builds only), or a stand-in. */
export interface DevSettingsLike {
  addMenuItem(title: string, handler: () => void): void;
}

export interface DevtoolsOptions {
  /**
   * Must be explicitly true: `__DEV__` or a fact of the binary (a `.dev` or
   * `.preview` bundle id). False mounts nothing.
   */
  enabled: boolean;
  /** The updates block: the signature, the channel and the channel switch. */
  updates?: UpdatesBlock;
  /** Without the updates block: the signature to show (`versionSignature(…)`). */
  signature?: VersionSignature;
  /** The observability block: recent breadcrumbs and errors. */
  observability?: ObservabilityBlock | null;
  /** The server the app talks to (the Supabase URL). Shown without its query string. */
  baseUrl?: string;
  /** The app's switches and flags, shown by name and value. */
  flags?: Readonly<Record<string, unknown>>;
  /** `Accelerometer` from expo-sensors: shake to open. Without it, the hold and the dev menu still work. */
  accelerometer?: AccelerometerLike;
  /** `DevSettings` from react-native: "Open devtools" in the dev menu (development builds). */
  devSettings?: DevSettingsLike;
  /** The hold that opens the overlay, or `false` for none. Default three fingers for 800 ms. */
  hold?: false | { fingers?: number; holdMs?: number };
  /** Copy text (`Clipboard.setStringAsync` from expo-clipboard). Default the share sheet, which has Copy. */
  copy?: (text: string) => unknown;
  /** More to clear after the query cache (the persisted cache, MMKV). */
  clearCache?: () => unknown;
  /** Sign out (`supabase.auth.signOut()`). Without it, the action is hidden. */
  signOut?: () => unknown;
}

export interface DevtoolsState {
  open: boolean;
}

export interface DevtoolsBlock extends NativeBlock<typeof DEVTOOLS_BLOCK_ID> {
  readonly enabled: boolean;
  readonly options: DevtoolsOptions;
  open(): void;
  /** Closes the overlay. Resolves once its sheet has finished sliding away (or at once if it isn't up). */
  close(): Promise<void>;
  getState(): DevtoolsState;
  subscribe(listener: () => void): () => void;
}

/** Build the overlay once, at module scope. @stability Beta */
export function createDevtools(options: DevtoolsOptions): DevtoolsBlock {
  const enabled = options.enabled === true;
  let state: DevtoolsState = { open: false };
  const listeners = new Set<() => void>();
  const set = (next: DevtoolsState) => {
    if (next.open === state.open) return;
    state = next;
    listeners.forEach((l) => l());
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const getState = () => state;

  // Waiting for the sheet to be gone: its dismissal is animated, and a screenshot taken before it
  // ends catches the sheet on its way down. Resolved by the modal's `onDismiss`, or after
  // DISMISS_FALLBACK_MS where a platform doesn't report it.
  let sheetShown = false;
  let dismissed: Array<() => void> = [];
  const settleDismissed = () => {
    sheetShown = false;
    const waiting = dismissed;
    dismissed = [];
    waiting.forEach((resolve) => resolve());
  };
  const close = (): Promise<void> => {
    set({ open: false });
    if (!sheetShown) return Promise.resolve();
    return new Promise<void>((resolve) => dismissed.push(resolve));
  };

  const declaration = defineBlock<typeof DEVTOOLS_BLOCK_ID, ComponentType<never>>({
    id: DEVTOOLS_BLOCK_ID,
    platforms: ["native"],
    contributes: {
      privacy: { notes: ["Development, preview and internal builds only; shows on the device what the app knows about itself and sends nothing."] },
    },
  });

  // Thrown while rendering, so it takes the path a real render error takes. The shell's
  // "Try again" remounts the root, whose state starts without the crash.
  function CrashTest(): null {
    throw new Error("Devtools crash test: a render error on purpose.");
  }

  let menuAdded = false;
  function DevtoolsRoot({ slots, slotProps, children }: NativeBlockRootProps) {
    const { open } = useSyncExternalStore(subscribe, getState, getState);
    const [crash, setCrash] = useState(false);
    // The sheet stays mounted after `open` turns false, so the modal animates out and reports
    // when it's gone (`onDismiss`); then it unmounts.
    const [mounted, setMounted] = useState(open);
    const shown = open || mounted;
    useEffect(() => {
      if (open) {
        setMounted(true);
        sheetShown = true;
        return;
      }
      if (!mounted) return;
      const fallback = setTimeout(() => {
        setMounted(false);
        settleDismissed();
      }, DISMISS_FALLBACK_MS);
      return () => clearTimeout(fallback);
    }, [open, mounted]);
    const onDismissed = () => {
      if (getState().open) return;
      setMounted(false);
      settleDismissed();
    };

    useEffect(() => {
      // React Native has no way to remove a dev menu item: add it once per process.
      if (!options.devSettings || menuAdded) return;
      menuAdded = true;
      options.devSettings.addMenuItem("Open devtools", () => set({ open: true }));
    }, []);

    useEffect(() => {
      const accelerometer = options.accelerometer;
      if (!accelerometer) return;
      let subscription: { remove(): void } | null = null;
      let stopped = false;
      const detector = createShakeDetector({ onShake: () => set({ open: true }) });
      void (async () => {
        try {
          if (accelerometer.isAvailableAsync && !(await accelerometer.isAvailableAsync())) return;
          if (stopped) return;
          accelerometer.setUpdateInterval?.(100);
          subscription = accelerometer.addListener((reading) => detector.sample(reading));
        } catch {
          // No accelerometer here (a simulator): the hold and the dev menu still open it.
        }
      })();
      return () => {
        stopped = true;
        subscription?.remove();
      };
    }, []);

    const hold = useRef(options.hold === false ? null : createHoldDetector({ ...(options.hold || {}), onTrigger: () => set({ open: true }) }));
    useEffect(() => () => hold.current?.cancel(), []);
    const onTouches = hold.current ? (event: GestureResponderEvent) => hold.current?.touches(event.nativeEvent.touches.length) : undefined;

    return (
      <View style={{ flex: 1 }} onTouchStart={onTouches} onTouchMove={onTouches} onTouchEnd={onTouches} onTouchCancel={onTouches}>
        {children}
        {crash ? <CrashTest /> : null}
        {shown ? (
          <DevtoolsSheet
            visible={open}
            onDismissed={onDismissed}
            block={block}
            Feedback={slots?.devtoolsFeedback}
            feedbackProps={slotProps?.devtoolsFeedback}
            onCrash={() => {
              set({ open: false });
              setCrash(true);
            }}
          />
        ) : null}
      </View>
    );
  }

  const block: DevtoolsBlock = {
    ...declaration,
    enabled,
    options,
    open: () => enabled && set({ open: true }),
    close,
    getState,
    subscribe,
    ...(enabled ? { Root: DevtoolsRoot } : {}),
  };
  return block;
}

function NoFeedback(_props: DevtoolsFeedbackProps) {
  return null;
}

function useSignature(options: DevtoolsOptions): VersionSignature | null {
  const updates = options.updates;
  const [requested, setRequested] = useState<string | null>(null);
  useEffect(() => {
    if (!updates) return;
    let alive = true;
    void updates.channels.requested().then((value) => alive && setRequested(value));
    return () => {
      alive = false;
    };
  }, [updates]);
  return useMemo(() => {
    if (!updates) return options.signature ?? null;
    if (!requested) return updates.signature;
    const { application, updates: modules, platform } = updates.options;
    return versionSignature({ application, updates: modules, platform, requestedChannel: requested });
  }, [updates, requested, options.signature]);
}

const RESULT_TEXT: Record<ChannelSwitchResult["kind"], string> = {
  reloading: "Reloading…",
  blocked: "Set; it applies on the next launch (something is mid-edit).",
  unavailable: "Not available in this build.",
  error: "Set, but checking or reloading failed.",
};

/** Longest wait for the sheet's `onDismiss` before treating it as gone. */
const DISMISS_FALLBACK_MS = 800;

interface SheetProps {
  visible: boolean;
  onDismissed: () => void;
  block: DevtoolsBlock;
  Feedback: ComponentType<DevtoolsFeedbackProps> | null | undefined;
  feedbackProps: Partial<DevtoolsFeedbackProps> | undefined;
  onCrash: () => void;
}

// Layout by `style`, not `className`: this package is compiled before the app's NativeWind
// transform runs, so a class on React Native's own View would do nothing.
function Row({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 4 }} testID={testID}>
      <NativeText preset="label">{label}</NativeText>
      <NativeText preset="body-sm" className="text-right text-muted-foreground" style={{ flex: 1 }} selectable>
        {value}
      </NativeText>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const roles = useThemeRoles();
  return (
    <View style={{ gap: 4, borderTopWidth: 1, borderTopColor: roles.separator, paddingTop: 12 }}>
      <NativeText preset="label" accessibilityRole="header">
        {title}
      </NativeText>
      {children}
    </View>
  );
}

function DevtoolsSheet({ visible, onDismissed, block, Feedback, feedbackProps, onCrash }: SheetProps) {
  const { options } = block;
  const roles = useThemeRoles();
  const { userId } = useSession();
  const blocks = useBlocks();
  const recent = useRecentActivity(options.observability ?? null);
  const signature = useSignature(options);
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const channels = options.updates?.channels;
  const close = () => block.close();
  const closeForFeedback = () => block.close();

  const info = () =>
    buildDebugInfo({ signature, userId, blocks: [...blocks.ids], flags: options.flags, baseUrl: options.baseUrl ?? null, recent });

  const run = (label: string, action: () => unknown) => {
    Promise.resolve()
      .then(action)
      .then(
        () => setStatus(`${label}: done`),
        (error: unknown) => setStatus(`${label}: ${error instanceof Error ? error.message : "failed"}`),
      );
  };

  const copy = () => run("Copy debug info", () => (options.copy ? options.copy(info()) : Share.share({ message: info() })));
  const clearCache = () =>
    run("Clear cache", async () => {
      queryClient.clear();
      await options.clearCache?.();
    });
  const confirm = (title: string, body: string, action: string, onConfirm: () => void) =>
    Alert.alert(title, body, [
      { text: "Cancel", style: "cancel" },
      { text: action, style: "destructive", onPress: onConfirm },
    ]);
  const switchChannel = () => {
    if (!channels) return;
    run("Switch channel", async () => {
      const result = await channels.switchTo(channel);
      setStatus(RESULT_TEXT[result.kind]);
    });
  };
  const resetChannel = () => {
    if (!channels) return;
    run("Build channel", async () => {
      const result = await channels.reset();
      setStatus(RESULT_TEXT[result.kind]);
    });
  };

  const flags = Object.entries(options.flags ?? {});
  return (
    // React Native's own modal, as a page sheet on iOS: it needs no provider above it (a bottom-sheet
    // library's modal does), so the overlay opens whatever the app has mounted.
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => void close()}
      onDismiss={onDismissed}
      testID="genesis-devtools"
    >
      <ScrollView style={{ flex: 1, backgroundColor: roles.background }} contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 48 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <NativeText preset="h3" accessibilityRole="header">
            Devtools
          </NativeText>
          <NativeButton variant="ghost" size="sm" onPress={() => void close()} testID="genesis-devtools-close">
            Close
          </NativeButton>
        </View>
        {status ? (
          <NativeText preset="body-sm" testID="genesis-devtools-status">
            {status}
          </NativeText>
        ) : null}

        <Section title="Build">
          <NativeText preset="body-sm" selectable testID="genesis-devtools-signature">
            {signature?.text ?? "Version unknown (no updates block)"}
          </NativeText>
        </Section>

        {channels ? (
          <Section title="Update channel">
            <Row label="Channel" value={signature?.requestedChannel ?? signature?.channel ?? "none"} testID="genesis-devtools-channel" />
            {channels.enabled ? (
              <>
                <NativeInput
                  value={channel}
                  onChangeText={setChannel}
                  placeholder="pr-42"
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Channel to switch to"
                  testID="genesis-devtools-channel-input"
                />
                <NativeButton size="sm" onPress={switchChannel} disabled={!channel.trim()} testID="genesis-devtools-channel-switch">
                  Switch and reload
                </NativeButton>
              </>
            ) : (
              <NativeText preset="body-sm" className="text-muted-foreground">
                Switching is off in this build.
              </NativeText>
            )}
            <NativeButton size="sm" variant="ghost" onPress={resetChannel} testID="genesis-devtools-channel-reset">
              Back to the build's channel
            </NativeButton>
          </Section>
        ) : null}

        <Section title="Session">
          <Row label="User id" value={userId ?? "signed out"} testID="genesis-devtools-user" />
          <Row label="Server" value={options.baseUrl ? scrubUrl(options.baseUrl) : "unknown"} testID="genesis-devtools-server" />
        </Section>

        <Section title="Blocks and flags">
          <Row label="Blocks" value={blocks.ids.size > 0 ? [...blocks.ids].join(", ") : "none"} testID="genesis-devtools-blocks" />
          {flags.map(([name, value]) => (
            <Row key={name} label={name} value={typeof value === "string" ? scrubString(value) : String(value)} testID={`genesis-devtools-flag-${name}`} />
          ))}
        </Section>

        <Section title={`Errors (${recent.errors.length})`}>
          {recent.errors.length === 0 ? <NativeText preset="body-sm">None</NativeText> : null}
          {recent.errors
            .slice(-10)
            .reverse()
            .map((e) => (
              <NativeText key={`${e.at}-${e.message}`} preset="body-sm" testID="genesis-devtools-error">
                {`${e.fatal ? "fatal " : ""}${e.source} · ${e.name}: ${e.message}`}
              </NativeText>
            ))}
        </Section>

        <Section title={`Breadcrumbs (${recent.breadcrumbs.length})`}>
          {recent.breadcrumbs.length === 0 ? <NativeText preset="body-sm">None</NativeText> : null}
          {recent.breadcrumbs
            .slice(-15)
            .reverse()
            .map((c, i) => (
              <NativeText key={`${c.timestamp ?? 0}-${i}`} preset="body-sm" testID="genesis-devtools-breadcrumb">
                {`${c.category} · ${c.message ?? ""}`}
              </NativeText>
            ))}
        </Section>

        <Section title="Actions">
          <View style={{ gap: 8 }}>
            <NativeButton size="sm" variant="outline" onPress={copy} testID="genesis-devtools-copy">
              Copy debug info
            </NativeButton>
            {renderSlot(NoFeedback, Feedback, { debugInfo: info(), close: closeForFeedback }, feedbackProps)}
            <NativeButton size="sm" variant="outline" onPress={clearCache} testID="genesis-devtools-clear-cache">
              Clear cache
            </NativeButton>
            <NativeButton
              size="sm"
              variant="outline"
              onPress={() => confirm("Crash test", "This throws a render error: the fatal screen shows and the error is reported.", "Crash", onCrash)}
              testID="genesis-devtools-crash"
            >
              Crash test
            </NativeButton>
            {options.signOut ? (
              <NativeButton
                size="sm"
                variant="destructive"
                onPress={() => confirm("Sign out", "Sign out of this device?", "Sign out", () => run("Sign out", options.signOut as () => unknown))}
                testID="genesis-devtools-sign-out"
              >
                Sign out
              </NativeButton>
            ) : null}
          </View>
        </Section>
      </ScrollView>
    </Modal>
  );
}
