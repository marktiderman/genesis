/**
 * `createPush(options)`: the push block. Pass the result to
 * `<GenesisNativeApp blocks={[push]}>` (removing it turns the block off), or
 * render `<PushRoot block={push}>` yourself, inside the session provider.
 *
 * It is a `defineBlock` declaration (`id: "push"`): it contributes a Settings
 * row for the notification settings (`useBlockSettings`, href
 * `/settings/notifications`), a boot step that reads the permission behind
 * the splash (bounded, never fails), and names migration 0005.
 *
 *   PushRoot
 *   ├ follows the session: registers this device's token on sign-in (only
 *   │ once permission is granted), forgets it on sign-out, clears the badge
 *   ├ routes a tapped notification (the one that launched the app too)
 *   │ through normalizeLink; signed out, the link is held until sign-in
 *   ├ decides what shows while the app is open (the foreground handler)
 *   ├ your screens
 *   └ pushPrompt  (the soft pre-prompt, only after `usePushPrompt().offer()`)
 *
 * The block never asks for permission by itself, and never at launch.
 * Every part is a slot or a primitive, and a hook (`usePushPermission`, …).
 */
import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { View } from "react-native";
import { renderSlot, type SlotPropsFor, type Slots } from "@marktiderman/genesis-core/slots";
import { defineBlock } from "@marktiderman/genesis-features/blocks";
import { useSession } from "../auth";
import type { NativeBlock, NativeBlockRootProps } from "../blocks";
import type { BootStep } from "../boot";
import { delay } from "../updates/store";
import type { LinkHold } from "../held-link";
import type { LinkOptions } from "../links";
import type { NotificationPreferences, PushBackend } from "./backend";
import {
  report,
  type NotificationLike,
  type NotificationResponseLike,
  type NotificationsModuleLike,
  type PermissionRequestLike,
  type PushAppStateLike,
  type PushOnError,
  type PushStorageLike,
} from "./modules";
import {
  canPush,
  createPermissionStore,
  createPromptStore,
  type PermissionState,
  type PermissionStore,
  type PromptOptions,
  type PromptState,
  type PromptStore,
  type PushPermissionStatus,
} from "./permission";
import { createPreferencesStore, type ChannelImportance, type NotificationCategory, type PreferencesState, type PreferencesStore } from "./preferences";
import { createRegistration, type Registration, type RegistrationState } from "./registration";
import { notificationData, pathForResponse } from "./routing";
import { PushPromptSheet, type PushPromptProps } from "./screens";

/** An Android channel beyond the categories' own (one per category is made for you). */
export interface PushChannel {
  id: string;
  name: string;
  description?: string;
  importance?: ChannelImportance;
}

/** A notification category and its buttons. */
export interface PushDeviceCategory {
  identifier: string;
  actions: readonly {
    id: string;
    title: string;
    textInput?: { placeholder?: string; submitTitle?: string };
    opensApp?: boolean;
    destructive?: boolean;
    requiresAuth?: boolean;
  }[];
  previewPlaceholder?: string;
}

// A type, not an interface, so it fits the slots contract's Record constraint.
export type PushSlots = {
  /** The soft pre-prompt, shown after `usePushPrompt().offer()`. Default `PushPromptSheet`. */
  pushPrompt: PushPromptProps;
};

export interface PushOptions {
  /** `import * as Notifications from "expo-notifications"`. Without it the block does nothing (web, tests). */
  notifications?: NotificationsModuleLike;
  /** `Platform.OS`. */
  platform: string;
  /** The EAS project id (`Constants.expoConfig?.extra?.eas?.projectId`). Without it there is no push token; the block says so once through `onError`. */
  projectId?: string | null;
  /** The installed version, kept with the device row (`Application.nativeApplicationVersion`). */
  appVersion?: string | null;
  /** Devices and preferences: `supabasePushBackend(supabase)`. */
  backend: PushBackend;
  /** The kinds of notification the app sends; each is a toggle in NotificationSettings and an Android channel. */
  categories?: readonly NotificationCategory[];
  /** More Android channels. A `default` channel is always made. */
  channels?: readonly PushChannel[];
  /**
   * Notification categories with action buttons (Reply, Mark as read),
   * registered on the device when the block starts. A push names one in its
   * `categoryId`; a tap on a button reaches `onResponse` (`notificationAction`
   * reads it). genesis-notifications' registry makes these (`deviceCategories()`).
   */
  deviceCategories?: readonly PushDeviceCategory[];
  /** Makes this install's id, for a backend that uses one (`usesInstallationId`). Default `crypto.randomUUID`; pass expo-crypto's on Hermes. */
  randomUUID?: () => string;
  /** AsyncStorage: this device's token (to forget it after sign-out), the prompt's "Not now"s. */
  storage?: PushStorageLike;
  /** `AppState`: read the permission again on coming to the front (the person may have changed it in Settings). */
  appState?: PushAppStateLike;
  /** `Linking.openSettings`, for "Turn on in Settings" once the system won't ask again. */
  openSettings?: () => unknown;
  /** Where a tap goes: the app's deep-link options, so a pushed path is normalized like any link. */
  links?: LinkOptions;
  /** Open a tapped notification's path (`router.push`). Without it a tap opens nothing, and says so through `onError`. */
  onOpen?: (path: string) => void;
  /** Where a tap that arrives signed out waits for sign-in: the same `linkHold` as GenesisNativeApp's `links.hold`. */
  hold?: LinkHold;
  /**
   * The Settings row the block contributes (`useBlockSettings`), or `false`
   * for none. Default `{ title: "Notifications", section: "notifications", href: "/settings/notifications" }`;
   * its subtitle is the permission's status (`statusLabels`).
   */
  settingsRow?: false | { title?: string; section?: string; href?: string };
  /** The words for each permission status (the Settings row's subtitle, NotificationSettings' default). */
  statusLabels?: Partial<Record<PushPermissionStatus, string>>;
  /** Every tap and action, after routing (an action button, analytics). */
  onResponse?: (response: NotificationResponseLike) => void;
  /** Show a notification that arrives while the app is open? Default yes; `useSuppressNotifications` adds rules. */
  foreground?: (notification: NotificationLike) => boolean;
  /** The iOS permissions asked for. Default alert, badge and sound. */
  permissions?: PermissionRequestLike;
  prompt?: PromptOptions;
  /** Clear the badge whenever the app comes to the front. Default false (the server sets it). */
  clearBadgeOnForeground?: boolean;
  /** Storage key prefix. Default `"genesis:push"`. */
  storageKeyPrefix?: string;
  /** Every caught error, for reporting; none of them breaks the app. */
  onError?: PushOnError;
  now?: () => number;
}

/** The FeatureId of the push block. */
export const PUSH_BLOCK_ID = "push";

/** The default words for each permission status. */
export const PUSH_STATUS_LABELS: Record<PushPermissionStatus, string> = {
  unknown: "Checking…",
  undetermined: "Off",
  granted: "On",
  provisional: "Delivered quietly",
  denied: "Off in Settings",
  unavailable: "Not available on this device",
};

export interface PushBlock extends NativeBlock<typeof PUSH_BLOCK_ID> {
  readonly options: PushOptions;
  readonly permission: PermissionStore;
  readonly registration: Registration;
  readonly preferences: PreferencesStore;
  readonly prompt: PromptStore;
  readonly categories: readonly NotificationCategory[];
  readonly badge: { set(count: number): Promise<void>; clear(): Promise<void> };
  /** Follow this signed-in user (null when signed out). `PushRoot` calls it from the session. */
  setUser(userId: string | null): void;
  /** Hide notifications that match while the app is open (the thread on screen); returns the removal. */
  suppress(match: (data: Record<string, unknown>, notification: NotificationLike) => boolean): () => void;
  /** Make the Android channels (once; again after a failure). */
  ensureChannels(): Promise<void>;
  /** Start the foreground handler and the listeners; returns the stop. `PushRoot` calls it. */
  start(): () => void;
  /** Reads the permission behind the splash, at most a second; never fails the boot. */
  readonly bootSteps: readonly BootStep[];
  readonly Root: ComponentType<NativeBlockRootProps>;
}

/** Expo's `AndroidImportance` numbers (checked against expo-notifications 58.1). */
const IMPORTANCE: Record<ChannelImportance, number> = { min: 3, low: 4, default: 5, high: 6, max: 7 };
/** `AndroidNotificationVisibility.PRIVATE`: on a secure lock screen, Android shows that there is one, not what it says. */
const VISIBILITY_PRIVATE = 2;

/** Build the block once, at module scope, next to your Supabase client. */
export function createPush(options: PushOptions): PushBlock {
  const { notifications, platform, storage, onError, now = Date.now } = options;
  const prefix = options.storageKeyPrefix ?? "genesis:push";
  const categories = options.categories ?? [];
  let userId: string | null = null;
  let startedAt: number | null = null;
  let channelsMade: Promise<void> | null = null;
  const suppressors = new Set<(data: Record<string, unknown>, notification: NotificationLike) => boolean>();

  const ensureChannels = (): Promise<void> => {
    if (!notifications || platform !== "android") return Promise.resolve();
    channelsMade ??= (async () => {
      const all = [
        { id: "default", name: "Notifications", importance: "default" as ChannelImportance, description: undefined as string | undefined },
        ...categories.map((c) => ({ id: c.id, name: c.title, importance: c.importance ?? "default", description: c.description })),
        ...(options.channels ?? []).map((c) => ({ ...c, importance: c.importance ?? "default" })),
      ];
      for (const channel of all) {
        await notifications.setNotificationChannelAsync(channel.id, {
          name: channel.name,
          importance: IMPORTANCE[channel.importance],
          description: channel.description ?? null,
          lockscreenVisibility: VISIBILITY_PRIVATE,
          showBadge: true,
        });
      }
    })().catch((error) => {
      channelsMade = null;
      throw error;
    });
    return channelsMade;
  };

  let categoriesMade = false;
  const registerDeviceCategories = async () => {
    const set = notifications?.setNotificationCategoryAsync;
    if (categoriesMade || !notifications || !set || !options.deviceCategories?.length) return;
    categoriesMade = true;
    for (const c of options.deviceCategories) {
      try {
        await set.call(
          notifications,
          c.identifier,
          c.actions.map((a) => ({
            identifier: a.id,
            buttonTitle: a.title,
            ...(a.textInput ? { textInput: { placeholder: a.textInput.placeholder ?? "", submitButtonTitle: a.textInput.submitTitle ?? a.title } } : {}),
            options: { opensAppToForeground: a.opensApp ?? false, isDestructive: a.destructive ?? false, isAuthenticationRequired: a.requiresAuth ?? false },
          })),
          c.previewPlaceholder ? { previewPlaceholder: c.previewPlaceholder } : undefined,
        );
      } catch (error) {
        categoriesMade = false;
        report(onError, error, "categories");
      }
    }
  };

  const permission = createPermissionStore({ notifications, request: options.permissions, beforeRequest: ensureChannels, onError });
  const registration = createRegistration({
    notifications,
    backend: options.backend,
    projectId: options.projectId,
    platform,
    appVersion: options.appVersion,
    storage,
    storageKeyPrefix: prefix,
    ensureChannels,
    isCurrent: (id) => userId === id,
    now,
    randomUUID: options.randomUUID,
    onError,
  });
  const preferences = createPreferencesStore({ backend: options.backend, categories, onError });
  const prompt = createPromptStore({
    ...options.prompt,
    permission,
    storage,
    storageKey: `${prefix}:prompt`,
    signedIn: () => userId !== null,
    startedAt: () => startedAt,
    now,
    onError,
  });

  const badge = {
    async set(count: number) {
      try {
        await notifications?.setBadgeCountAsync(Math.max(0, Math.floor(count)));
      } catch (error) {
        report(onError, error, "badge");
      }
    },
    clear: () => badge.set(0),
  };

  // Granted later (the prompt, Settings, another screen) while signed in: register now. The
  // first read (from "unknown") is left to setUser, which registers after it.
  let lastStatus = permission.getState().status;
  permission.subscribe(() => {
    const status = permission.getState().status;
    if (status !== lastStatus && lastStatus !== "unknown" && canPush(status) && userId) void registration.sync(userId);
    lastStatus = status;
  });

  const row = options.settingsRow;
  const labels = { ...PUSH_STATUS_LABELS, ...options.statusLabels };
  const declaration = defineBlock<typeof PUSH_BLOCK_ID, ComponentType<never>>({
    id: PUSH_BLOCK_ID,
    platforms: ["native"],
    contributes: {
      settings:
        row === false
          ? []
          : [
              {
                id: "notifications",
                section: row?.section ?? "notifications",
                title: row?.title ?? "Notifications",
                href: row?.href ?? "/settings/notifications",
                testID: "genesis-push-settings",
                // Bound to this block, so it needs no provider above the Settings screen.
                useSubtitle: () => labels[useSyncExternalStore(permission.subscribe, permission.getState, permission.getState).status],
              },
            ],
      routes: [{ path: row === false ? "/settings/notifications" : (row?.href ?? "/settings/notifications"), description: "Notification settings: categories, quiet hours, previews", signedIn: true }],
      migrations: [
        { package: "@marktiderman/genesis-supabase", file: "migrations/0005_genesis_push.sql", test: "migrations/tests/0005_genesis_push.test.sql" },
      ],
      privacy: {
        collects: [{ type: "device ID", purposes: ["app functionality"], linked: true, tracking: false }],
        notes: [
          "Keeps this device's push token against the signed-in person, to send them notifications; forgotten on sign-out and account deletion.",
          "Keeps notification preferences (categories, quiet hours and time zone, previews) per person.",
        ],
      },
    },
  });
  const bootStep: BootStep = {
    id: "genesis:push",
    // Bounded and never rejects (refresh reports its own errors), so it can't fail or hold the boot.
    run: () => Promise.race([permission.refresh(), delay(1000)]).then(() => undefined),
    timeoutMs: 3000,
  };

  const block: PushBlock = {
    ...declaration,
    bootSteps: [bootStep],
    options,
    permission,
    registration,
    preferences,
    prompt,
    categories,
    badge,
    ensureChannels,
    setUser(next) {
      if (next === userId) return;
      const previous = userId;
      userId = next;
      if (previous !== null) {
        // Signed out or switched: this phone stops getting the last person's pushes, and shows none of their count.
        void registration.forget();
        void badge.clear();
        preferences.reset();
        prompt.hide();
      }
      if (next !== null) {
        void preferences.load(next);
        void permission.refresh().then((status) => {
          if (canPush(status) && userId === next) void registration.sync(next);
        });
      }
    },
    suppress(match) {
      suppressors.add(match);
      return () => {
        suppressors.delete(match);
      };
    },
    start() {
      startedAt = now();
      if (!notifications) return () => {};
      notifications.setNotificationHandler({
        handleNotification: async (notification) => {
          let show = true;
          try {
            const data = notificationData(notification);
            show = !userId ? false : ![...suppressors].some((match) => match(data, notification)) && (options.foreground?.(notification) ?? true);
          } catch (error) {
            report(onError, error, "routing");
          }
          // Nothing of a push that isn't shown, the badge included (it may be the last person's).
          return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: show };
        },
      });
      void registration.flush();
      void permission.refresh();
      void registerDeviceCategories();
      const tokenSubscription = notifications.addPushTokenListener(() => {
        // The OS rotated the device token: fetch the Expo token again and register it.
        if (userId) void registration.sync(userId, { force: true });
      });
      const appSubscription = options.appState?.addEventListener("change", (state) => {
        if (state !== "active") return;
        // Back in front: a forget that failed offline goes now, and this phone's registration is
        // confirmed (it may have failed, or another login may have taken the token since).
        void registration.flush();
        void permission.refresh().then((status) => {
          if (canPush(status) && userId) void registration.sync(userId);
        });
        if (options.clearBadgeOnForeground && userId) void badge.clear();
      });
      return () => {
        startedAt = null;
        notifications.setNotificationHandler(null);
        tokenSubscription.remove();
        appSubscription?.remove();
      };
    },
    Root: function PushBlockRoot({ slots, slotProps, children }: NativeBlockRootProps) {
      return (
        <PushRoot block={block} slots={slots} slotProps={slotProps}>
          {children}
        </PushRoot>
      );
    },
  };
  return block;
}

const PushContext = createContext<PushBlock | null>(null);

/** Provides the block to the hooks, without rendering any of its parts (rung 4). */
export function PushProvider({ block, children }: { block: PushBlock; children?: ReactNode }) {
  return <PushContext.Provider value={block}>{children}</PushContext.Provider>;
}

/** The block from `PushProvider` / `PushRoot` / `GenesisNativeApp`. Throws outside one. */
export function usePush(): PushBlock {
  const block = useContext(PushContext);
  if (!block) throw new Error("usePush: no push block. Put `createPush(…)` in GenesisNativeApp's `blocks`, or wrap in <PushProvider>.");
  return block;
}

/** The block, or null when push is off: for a screen that works either way. */
export function useOptionalPush(): PushBlock | null {
  return useContext(PushContext);
}

export function usePushPermissionState(): PermissionState {
  const { permission } = usePush();
  return useSyncExternalStore(permission.subscribe, permission.getState, permission.getState);
}

export function usePushRegistration(): RegistrationState {
  const { registration } = usePush();
  return useSyncExternalStore(registration.subscribe, registration.getState, registration.getState);
}

export function useNotificationPreferences(): PreferencesState & { update: PreferencesStore["update"] } {
  const { preferences } = usePush();
  const state = useSyncExternalStore(preferences.subscribe, preferences.getState, preferences.getState);
  return { ...state, update: preferences.update };
}

/** The soft prompt: `offer("to hear when someone replies")` at the right moment. */
export function usePushPrompt(): PromptState & Pick<PromptStore, "offer" | "accept" | "decline"> {
  const { prompt } = usePush();
  const state = useSyncExternalStore(prompt.subscribe, prompt.getState, prompt.getState);
  return { ...state, offer: prompt.offer, accept: prompt.accept, decline: prompt.decline };
}

/** The badge: `set(unread)`, `clear()`. */
export function useBadge(): PushBlock["badge"] {
  return usePush().badge;
}

/**
 * Hide notifications that match while this screen is open (`data` is the
 * notification's `data`): a chat screen hides pushes for its own thread.
 * Does nothing without a push block.
 */
export function useSuppressNotifications(match: ((data: Record<string, unknown>) => boolean) | null) {
  const block = useOptionalPush();
  const latest = useRef(match);
  latest.current = match;
  const active = match !== null;
  useEffect(() => (block && active ? block.suppress((data) => latest.current?.(data) ?? false) : undefined), [block, active]);
}

export interface PushRootProps {
  block: PushBlock;
  /** Where a tap that arrives signed out waits for sign-in (GenesisNativeApp passes its `links.hold`). */
  hold?: LinkHold;
  /** Open a path; used when the block's own `onOpen` isn't given. */
  onOpen?: (path: string) => void;
  slots?: Slots<PushSlots>;
  slotProps?: SlotPropsFor<PushSlots>;
  children?: ReactNode;
}

/** The block's parts around your screens. Must be inside GenesisNativeApp's session (or a `SessionProvider`). */
export function PushRoot({ block, hold, onOpen, slots, slotProps, children }: PushRootProps) {
  const { status, userId } = useSession();
  useEffect(() => block.start(), [block]);
  useEffect(() => {
    if (status === "loading") return;
    block.setUser(status === "signedIn" ? userId : null);
  }, [block, status, userId]);
  useTapRouting(block, status, hold, onOpen);

  return (
    <PushProvider block={block}>
      <View style={{ flex: 1 }}>
        {children}
        <PushPromptPart slots={slots} slotProps={slotProps} />
      </View>
    </PushProvider>
  );
}

function PushPromptPart({ slots, slotProps }: Pick<PushRootProps, "slots" | "slotProps">) {
  const prompt = usePushPrompt();
  if (!prompt.visible) return null;
  return renderSlot(
    PushPromptSheet,
    slots?.pushPrompt,
    { reason: prompt.reason, accept: () => void prompt.accept(), decline: () => void prompt.decline() },
    slotProps?.pushPrompt,
  );
}

/**
 * Taps: the one that launched the app (read once), then each one while it
 * runs. Signed in, the path opens on the next tick (after the navigator has
 * mounted); signed out, it is held and GenesisNativeApp follows it after
 * sign-in. Each notification is followed once, however many ways it arrives.
 */
function useTapRouting(block: PushBlock, status: string, hold: LinkHold | undefined, onOpen: ((path: string) => void) | undefined) {
  const auth = useRef(status);
  auth.current = status;
  const latest = useRef({ hold, onOpen });
  latest.current = { hold, onOpen };
  const waiting = useRef<string | null>(null);

  const follow = (path: string) => {
    const open = block.options.onOpen ?? latest.current.onOpen;
    if (auth.current === "signedIn") {
      if (!open) {
        report(block.options.onError, new Error("push: a tapped notification has nowhere to go; pass `onOpen` to createPush (router.push)."), "setup");
        return;
      }
      // After this render: at a cold start the router's navigator mounts with the screens.
      setTimeout(() => {
        try {
          open(path);
        } catch (error) {
          report(block.options.onError, error, "routing");
        }
      }, 0);
    } else if (auth.current === "signedOut") {
      const hold = block.options.hold ?? latest.current.hold;
      if (hold) hold.hold(path);
      else report(block.options.onError, new Error("push: a notification tapped while signed out was dropped; pass `hold` (your linkHold) to createPush."), "setup");
    } else {
      waiting.current = path;
    }
  };

  useEffect(() => {
    if (status === "loading" || waiting.current === null) return;
    const path = waiting.current;
    waiting.current = null;
    follow(path);
  }, [status]);

  useEffect(() => {
    const notifications = block.options.notifications;
    if (!notifications) return;
    const seen = new Set<string>();
    const handle = (response: NotificationResponseLike | null) => {
      if (!response) return;
      try {
        const id = response.notification.request.identifier;
        if (seen.has(id)) return;
        seen.add(id);
        if (response.actionIdentifier === notifications.DEFAULT_ACTION_IDENTIFIER) {
          const path = pathForResponse(response, block.options.links);
          if (path) follow(path);
        }
        block.options.onResponse?.(response);
      } catch (error) {
        report(block.options.onError, error, "routing");
      }
    };
    try {
      handle(notifications.getLastNotificationResponse());
      notifications.clearLastNotificationResponse();
    } catch (error) {
      report(block.options.onError, error, "routing");
    }
    const subscription = notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, [block]);
}

export type { NotificationPreferences };
