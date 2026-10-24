/**
 * `createUpdates(options)`: the updates block. Pass the result to
 * `<GenesisNativeApp updates={updates}>` (removing that line turns the block
 * off), or render `<UpdatesRoot block={updates}>` yourself.
 *
 *   UpdatesRoot
 *   ├ forceUpgrade  (blocking: below the policy's minimum version)
 *   ├ maintenance   (blocking: the policy's maintenance switch, fetched live)
 *   └ your screens
 *     ├ updateBanner (non-blocking: an update is downloaded; reload on tap)
 *     └ whatsNew     (release notes, once per version)
 *
 * Every renderer is a slot, a primitive (`ForceUpgradeScreen`, …) and a hook
 * (`useForceUpgrade`, …).
 */
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { View } from "react-native";
import { renderSlot, type SlotPropsFor, type Slots } from "@marktiderman/genesis-core/slots";
import { createUpdateChecker, createReloadGuard, type ReloadGuard, type UpdateChecker, type UpdateCheckState } from "./checker";
import { createChannelSwitcher, type ChannelSwitcher } from "./channels";
import { delay } from "./store";
import {
  WEEK_MS,
  createPolicyStore,
  validTimeout,
  evaluatePolicy,
  type PolicyState,
  type PolicyStore,
  type ReleaseNote,
  type UpdatePolicySource,
  type UpdateVerdict,
} from "./policy";
import { versionSignature, type VersionSignature } from "./signature";
import { createWhatsNewStore, type WhatsNewState, type WhatsNewStore } from "./whats-new";
import {
  ForceUpgradeScreen,
  MaintenanceScreen,
  UpdateBanner,
  WhatsNewSheet,
  type ForceUpgradeProps,
  type MaintenanceProps,
  type UpdateBannerProps,
  type WhatsNewProps,
} from "./screens";
import { toError, type ApplicationLike, type UpdatesAppStateLike, type UpdatesModuleLike, type UpdatesOnError, type UpdatesStorageLike } from "./modules";

// A type, not an interface, so it fits the slots contract's Record constraint.
export type UpdatesSlots = {
  /** Blocking. Default `ForceUpgradeScreen`. */
  forceUpgrade: ForceUpgradeProps;
  /** Blocking. Default `MaintenanceScreen`. */
  maintenance: MaintenanceProps;
  /** Over your screens while an update is downloaded. Default `UpdateBanner`. */
  updateBanner: UpdateBannerProps;
  /** Once per version. Default `WhatsNewSheet`. */
  whatsNew: WhatsNewProps;
};

export interface UpdatesOptions {
  /** `Platform.OS`. Force upgrade applies to `ios` and `android` only. */
  platform: string;
  /** `expo-application`: the installed version. Without it, nothing is ever forced and notes never show. */
  application?: ApplicationLike;
  /** `expo-updates`. Without it (or with updates off), no banner and no channel switching. */
  updates?: UpdatesModuleLike;
  /** Min versions, maintenance and notes. Without it, only `notes` and the banner. */
  policy?: UpdatePolicySource;
  /** AsyncStorage: the policy cache, the version whose notes were seen, the picked channel. */
  storage?: UpdatesStorageLike;
  /** `AppState`: ask again when the app comes to the front. */
  appState?: UpdatesAppStateLike;
  /** `Linking.openURL`, for the store link. */
  openURL?: (url: string) => unknown;
  /** Extra say over reloading (return false to hold it off); `useBlockReload` covers forms. */
  canReload?: () => boolean;
  /** Release notes written in the app, merged with the policy's. */
  notes?: readonly ReleaseNote[];
  /** `false` turns what's new off. */
  whatsNew?: boolean;
  /** Channel switching, for development and preview builds only: `{ enabled: __DEV__ || isPreview }`. */
  channels?: { enabled: boolean };
  /** The longest the first policy load holds the splash. Default 3000 ms. */
  policyTimeoutMs?: number;
  /** How old a cached policy may be and still force an upgrade. Default 7 days. */
  cacheMaxAgeMs?: number;
  /** Ask for the policy again on coming to the front at most this often. Default 5 minutes. */
  policyRefreshMs?: number;
  /** Check for an update on coming to the front at most this often. Default 15 minutes. */
  checkIntervalMs?: number;
  /** `reloadAsync`'s reload screen (background color, spinner). */
  reloadScreenOptions?: object;
  /** Storage key prefix. Default `"genesis:updates"`. */
  storageKeyPrefix?: string;
  /** Every caught error, for reporting. None of them blocks anyone. */
  onError?: UpdatesOnError;
  now?: () => number;
}

export interface UpdatesBlock {
  readonly options: UpdatesOptions;
  readonly policy: PolicyStore;
  readonly checker: UpdateChecker;
  readonly guard: ReloadGuard;
  readonly whatsNew: WhatsNewStore;
  /** Channel switching: `switchTo` throws unless `channels.enabled` was passed; `reset` always works. */
  readonly channels: ChannelSwitcher;
  /** The signature from the modules, without the picked channel (see `useVersionSignature`). */
  readonly signature: VersionSignature;
  /** Loads the policy and the seen version behind the splash; never fails, done within `policyTimeoutMs`. */
  readonly bootStep: { id: string; run: () => Promise<void>; timeoutMs: number };
  /** Start following the app's state; returns the stop. `UpdatesRoot` calls it. */
  start(): () => void;
  /** The block's root, for `GenesisNativeApp`. */
  readonly Root: ComponentType<Omit<UpdatesRootProps, "block">>;
}

/** Build the block once, at module scope, next to your Supabase client. */
export function createUpdates(options: UpdatesOptions): UpdatesBlock {
  const {
    platform,
    application,
    updates,
    policy: source,
    storage,
    appState,
    canReload,
    channels,
    policyRefreshMs = 5 * 60_000,
    checkIntervalMs = 15 * 60_000,
    reloadScreenOptions,
    storageKeyPrefix = "genesis:updates",
    onError,
    now = Date.now,
  } = options;
  const policyTimeoutMs = validTimeout(options.policyTimeoutMs, 3000);
  const guard = createReloadGuard(canReload);
  const policy = createPolicyStore({
    source: source ?? { load: async () => null },
    storage: source ? storage : undefined,
    cacheKey: `${storageKeyPrefix}:policy`,
    timeoutMs: policyTimeoutMs,
    now,
    onError,
  });
  const checker = createUpdateChecker({ updates, guard, reloadScreenOptions, now, onError });
  const whatsNew = createWhatsNewStore({
    storage: options.whatsNew === false ? undefined : storage,
    version: options.whatsNew === false ? null : (application?.nativeApplicationVersion ?? null),
    storageKey: `${storageKeyPrefix}:seen-version`,
    onError,
  });
  const switcher = createChannelSwitcher({
    updates,
    enabled: channels?.enabled === true,
    guard,
    storage,
    storageKey: `${storageKeyPrefix}:channel`,
    reloadScreenOptions,
    onError,
  });
  const signature = versionSignature({ application, updates, platform });

  const allNotes = (): ReleaseNote[] => [...(options.notes ?? []), ...(policy.getState().policy?.notes ?? [])];
  const syncNotes = () => {
    const state = policy.getState();
    // Final once the policy has answered from the network (or there is none): no more notes can arrive.
    whatsNew.update(allNotes(), !source || state.origin === "network");
  };
  policy.subscribe(syncNotes);

  let loaded: Promise<void> | null = null;
  // Bounded and never rejects, so the boot step can't time out or fail the boot (a stalled storage read included).
  const load = () => {
    loaded ??= Promise.race([Promise.all([policy.load(), whatsNew.load()]), delay(policyTimeoutMs)])
      .then(syncNotes)
      .catch((error) => {
        try {
          onError?.(toError(error), "storage");
        } catch {
          // ignore a failing reporter
        }
      });
    return loaded;
  };

  const block: UpdatesBlock = {
    options,
    policy,
    checker,
    guard,
    whatsNew,
    channels: switcher,
    signature,
    bootStep: { id: "genesis:updates", run: load, timeoutMs: policyTimeoutMs + 5000 },
    start() {
      void load();
      void checker.check();
      const subscription = appState?.addEventListener("change", (state) => {
        if (state !== "active") return;
        void policy.refreshIfDue(policyRefreshMs);
        void checker.checkIfDue(checkIntervalMs);
      });
      return () => subscription?.remove();
    },
    Root: function UpdatesBlockRoot(props) {
      return <UpdatesRoot block={block} {...props} />;
    },
  };
  return block;
}

const UpdatesContext = createContext<UpdatesBlock | null>(null);

/** Provides the block to the hooks, without rendering any of its parts (rung 4). */
export function UpdatesProvider({ block, children }: { block: UpdatesBlock; children?: ReactNode }) {
  return <UpdatesContext.Provider value={block}>{children}</UpdatesContext.Provider>;
}

/** The block from `UpdatesProvider` / `UpdatesRoot` / `GenesisNativeApp`. Throws outside one. */
export function useUpdates(): UpdatesBlock {
  const block = useContext(UpdatesContext);
  if (!block) throw new Error("useUpdates: no updates block. Pass `updates={createUpdates(…)}` to GenesisNativeApp, or wrap in <UpdatesProvider>.");
  return block;
}

/**
 * Hold reloads off while `active` (a form with unsaved changes):
 * `useBlockReload(form.formState.isDirty)`. Does nothing without an updates
 * block, so a screen can call it whether or not the block is on.
 */
export function useBlockReload(active: boolean) {
  const block = useContext(UpdatesContext);
  useEffect(() => (active && block ? block.guard.block() : undefined), [active, block]);
}

export function useUpdatePolicy(): PolicyState {
  const { policy } = useUpdates();
  return useSyncExternalStore(policy.subscribe, policy.getState, policy.getState);
}

/** What the policy says now: `ok`, `forceUpgrade` or `maintenance`. */
export function useUpdateVerdict(): UpdateVerdict {
  const block = useUpdates();
  const state = useUpdatePolicy();
  const { platform, application, cacheMaxAgeMs = WEEK_MS, now = Date.now } = block.options;
  return useMemo(
    () => evaluatePolicy(state, { platform, installedVersion: application?.nativeApplicationVersion ?? null, now: now(), cacheMaxAgeMs }),
    [state, platform, application, cacheMaxAgeMs, now],
  );
}

/** The force-upgrade screen's props, or `null` when this version is supported. */
export function useForceUpgrade(): ForceUpgradeProps | null {
  const block = useUpdates();
  const verdict = useUpdateVerdict();
  const { refreshing } = useUpdatePolicy();
  if (verdict.kind !== "forceUpgrade") return null;
  const { storeUrl } = verdict;
  return {
    minimumVersion: verdict.minimumVersion,
    installedVersion: verdict.installedVersion,
    storeUrl,
    checking: refreshing,
    retry: () => void block.policy.refresh(),
    openStore: () => {
      if (!block.options.openURL) return;
      Promise.resolve()
        .then(() => block.options.openURL?.(storeUrl))
        .catch((error) => block.options.onError?.(toError(error), "policy"));
    },
  };
}

/** The maintenance screen's props, or `null` when maintenance is off (or not known live). */
export function useMaintenance(): MaintenanceProps | null {
  const block = useUpdates();
  const verdict = useUpdateVerdict();
  const { refreshing } = useUpdatePolicy();
  if (verdict.kind !== "maintenance") return null;
  return { message: verdict.message, retrying: refreshing, retry: () => void block.policy.refresh() };
}

export function useUpdateCheck(): UpdateCheckState {
  const { checker } = useUpdates();
  return useSyncExternalStore(checker.subscribe, checker.getState, checker.getState);
}

/** True when a reload would be allowed now. */
export function useCanReload(): boolean {
  const { guard } = useUpdates();
  return useSyncExternalStore(guard.subscribe, guard.canReload, guard.canReload);
}

/** The banner's props, or `null` when there is nothing to show. */
export function useUpdateBanner(): UpdateBannerProps | null {
  const { checker } = useUpdates();
  const state = useUpdateCheck();
  const canReload = useCanReload();
  if ((state.status !== "ready" && state.status !== "reloading") || state.dismissed) return null;
  return {
    canReload,
    blocked: state.blocked,
    reloading: state.status === "reloading",
    reload: () => void checker.reload(),
    dismiss: () => checker.dismiss(),
  };
}

/** The notes to show now, or `null`. */
export function useWhatsNew(): WhatsNewProps | null {
  const block = useUpdates();
  const state: WhatsNewState = useSyncExternalStore(block.whatsNew.subscribe, block.whatsNew.getState, block.whatsNew.getState);
  if (state.status !== "showing") return null;
  return { notes: state.notes, version: block.options.application?.nativeApplicationVersion ?? null, dismiss: () => block.whatsNew.dismiss() };
}

/** The version signature, with the channel picked on this device once it has been read. */
export function useVersionSignature(): VersionSignature {
  const block = useUpdates();
  const [requested, setRequested] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void block.channels.requested().then((value) => alive && setRequested(value));
    return () => {
      alive = false;
    };
  }, [block]);
  return useMemo(() => {
    if (!requested) return block.signature;
    const { application, updates, platform } = block.options;
    return versionSignature({ application, updates, platform, requestedChannel: requested });
  }, [block, requested]);
}

export interface UpdatesRootProps {
  block: UpdatesBlock;
  slots?: Slots<UpdatesSlots>;
  slotProps?: SlotPropsFor<UpdatesSlots>;
  children?: ReactNode;
}

/** The block's parts around your screens. */
export function UpdatesRoot({ block, slots, slotProps, children }: UpdatesRootProps) {
  useEffect(() => block.start(), [block]);
  return (
    <UpdatesProvider block={block}>
      <UpdatesParts slots={slots} slotProps={slotProps}>
        {children}
      </UpdatesParts>
    </UpdatesProvider>
  );
}

const FILL = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as const;

function UpdatesParts({ slots, slotProps, children }: Omit<UpdatesRootProps, "block">) {
  const forceUpgrade = useForceUpgrade();
  const maintenance = useMaintenance();
  const banner = useUpdateBanner();
  const whatsNew = useWhatsNew();
  // An ejected blocking slot (`null`) falls through to the screens: a block that is turned off never blocks.
  const blocking =
    forceUpgrade && slots?.forceUpgrade !== null
      ? renderSlot(ForceUpgradeScreen, slots?.forceUpgrade, forceUpgrade, slotProps?.forceUpgrade)
      : maintenance && slots?.maintenance !== null
        ? renderSlot(MaintenanceScreen, slots?.maintenance, maintenance, slotProps?.maintenance)
        : null;
  // The screens stay mounted under a blocking screen, so a block that starts and ends
  // mid-session (maintenance on, then off) keeps a half-filled form and the navigation state.
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        pointerEvents={blocking ? "none" : "auto"}
        accessibilityElementsHidden={Boolean(blocking)}
        importantForAccessibility={blocking ? "no-hide-descendants" : "auto"}
      >
        {children}
      </View>
      {!blocking && banner ? renderSlot(UpdateBanner, slots?.updateBanner, banner, slotProps?.updateBanner) : null}
      {!blocking && whatsNew ? renderSlot(WhatsNewSheet, slots?.whatsNew, whatsNew, slotProps?.whatsNew) : null}
      {blocking ? (
        <View style={FILL} testID="genesis-updates-blocking">
          {blocking}
        </View>
      ) : null}
    </View>
  );
}
