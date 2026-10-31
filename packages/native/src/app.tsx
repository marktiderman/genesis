/**
 * `<GenesisNativeApp>`: everything above an Expo app's screens, so the root
 * `_layout.tsx` is a few lines.
 *
 *   last-resort boundary (React Native primitives only)
 *   └ theme (GenesisThemeProvider, owning the platform color scheme; with `brandVariables`,
 *     role variables on a view around the app for NativeWind's role classes)
 *     └ keyboard (`keyboardProvider`, once, then `keyboardScroll` for form screens)
 *       └ toasts (`NativeToastProvider`, so `useToast()` works on every screen; `toast={null}` drops it)
 *       └ data (GenesisProvider over the Supabase client, the QueryClient)
 *         └ session + boot (splash held until both are known)
 *           └ blocks' roots (with `blocks`, e.g. updates: force upgrade, maintenance, banner, what's new)
 *             └ errorBoundary → `bottomSheet`'s provider, if given → your screens (or `signedOut`)
 *
 * Every error the shell catches goes to each block's `onError` (the
 * observability block reports it) and then to the app's own `onError`:
 * render, global, boot and unhandled-rejection errors, and queries and
 * mutations that failed unexpectedly (`reportQueryErrors`).
 *
 * `blocks` (`defineBlock` declarations a native shell can run) are resolved
 * once: requirements checked, boot steps run behind the splash, roots
 * mounted, slot fills put under your `slots`, Settings rows handed to
 * `useBlockSettings`.
 * Global errors, render errors and a failed boot show the `fatal` slot with
 * "Try again". Every part is a slot (`slots` / `slotProps`, `null` drops it)
 * and is also exported on its own.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { Text, View } from "react-native";
import type { QueryClient, QueryClientConfig } from "@tanstack/react-query";
import { vars } from "nativewind";
import { GenesisThemeProvider, useTheme } from "@marktiderman/genesis-design-system/theme";
import { brandRoleVariables, type CanonicalBrand } from "@marktiderman/genesis-design-system";
import { GenesisProvider, createSupabaseProvider, type DataProvider, type SupabaseClientInput } from "@marktiderman/genesis-core/provider";
import { renderSlot, type SlotPropsFor, type Slots } from "@marktiderman/genesis-core/slots";
import { KeyboardScrollProvider, type KeyboardScrollProps, type KeyboardToolbarProps } from "@marktiderman/genesis-ui-native/layouts";
import {
  GenesisModulesProvider,
  NativeSheetProvider,
  NativeToastProvider,
  type GenesisModules,
  type NativeSheetLibrary,
  type NativeToastProviderProps,
} from "@marktiderman/genesis-ui-native/components";
import { BootProvider, createBoot, type BootOptions, type BootStatus, type BootStep } from "./boot";
import {
  FatalScreen,
  GenesisErrorBoundary,
  PlainFatalScreen,
  defaultErrorUtils,
  defaultRejectionTracker,
  installGlobalErrorHandler,
  installRejectionTracker,
  type EnableRejectionTracker,
  type ErrorUtilsLike,
  type FatalScreenProps,
  type GenesisErrorBoundaryProps,
  type OnError,
} from "./errors";
import { SessionProvider, createSessionStore, type AuthClientLike } from "./auth";
import { useHeldLink, type HeldLinkAuth, type LinkHold } from "./held-link";
import { connectQueryLifecycle, createNativeQueryClient, reportQueryErrors, type QueryLifecycleOptions, type QueryPersistence } from "./query";
import { resolveBlocks } from "@marktiderman/genesis-features/blocks";
import { BlocksProvider, reportToBlocks, type NativeBlock } from "./blocks";
import type { DevtoolsSlots } from "./devtools/slots";
// Types only: the block's code is in the `/updates` entry and arrives with the `updates` prop.
import type { UpdatesBlock, UpdatesSlots } from "./updates/block";
// Types only, likewise: the push block (`/push`) arrives in `blocks`.
import type { PushSlots } from "./push/block";

/** `expo-splash-screen`, or a stand-in. Call `preventAutoHideAsync()` at module scope yourself too. */
export interface SplashModule {
  preventAutoHideAsync?: () => Promise<unknown>;
  hideAsync: () => Promise<unknown>;
}

export interface BootScreenProps {
  status: BootStatus;
}

export interface SignedOutProps {
  /** Your screens. The default renders them, for an expo-router layout that redirects. */
  children: ReactNode;
}

// A type, not an interface, so it fits the slots contract's Record constraint.
// The updates block's slots (`forceUpgrade`, `maintenance`, `updateBanner`,
// `whatsNew`) render only when the `updates` prop is given.
export type NativeAppSlots = UpdatesSlots &
  PushSlots &
  DevtoolsSlots & {
  /** Shown while booting: under the splash at launch, on its own after "Try again". Default `BootScreen`. */
  boot: BootScreenProps;
  /** A failed boot, a fatal global error or a render error. Default `FatalScreen`. */
  fatal: FatalScreenProps;
  /** The boundary around your screens. Default `GenesisErrorBoundary`. */
  errorBoundary: GenesisErrorBoundaryProps;
  /** What a signed-out user sees. Default your screens (gate them with `useSession`). */
  signedOut: SignedOutProps;
};

export interface NativeQueryClientOptions {
  /** Your own client. Default `createNativeQueryClient(config)`. */
  client?: QueryClient;
  config?: QueryClientConfig;
}

export interface GenesisNativeAppProps {
  brand: CanonicalBrand;
  /** A Supabase client (from `createGenesisSupabase` in `@marktiderman/genesis-supabase`). */
  supabase: AuthClientLike & SupabaseClientInput;
  /** The data provider. Default `createSupabaseProvider(supabase)`. */
  provider?: DataProvider;
  queryClient?: NativeQueryClientOptions;
  /**
   * Save queries to the phone: `persistQueries({ storage, keys, buster })`
   * from `@marktiderman/genesis-native/persist`. The saved cache belongs to
   * one user: it is restored only for that user and cleared when the user
   * changes (sign-out, a session that ended while the app was closed, an
   * account switch).
   */
  persist?: (client: QueryClient) => QueryPersistence;
  /** `expo-splash-screen`: hidden once boot has finished and the session is known. */
  splash?: SplashModule;
  /**
   * `KeyboardProvider` from react-native-keyboard-controller, mounted once
   * around the app. Its keyboard views (`keyboardScroll` included) do nothing
   * without it: give both or neither. Read once: it wraps the whole app, so
   * a different component later would remount everything below it. To pass
   * it props, define the wrapper at module scope, not inline.
   */
  keyboardProvider?: ComponentType<{ children: ReactNode }>;
  /**
   * Theme role variables (`--primary`, `--background`, …) to set on a view
   * around the app, over what the app's stylesheet declares on `:root`.
   * Default `false`: none are set, so the app's own variables (from
   * `createGenesisNativewindPreset({ brand })` or its brand package) stand.
   * `true` sets `brandRoleVariables(brand)` for the current mode; an object
   * sets the app's own, one map for both modes or `{ light, dark }`.
   */
  brandVariables?: boolean | Record<string, string> | { light: Record<string, string>; dark: Record<string, string> };
  /** `KeyboardAwareScrollView` from react-native-keyboard-controller, for form screens. Needs `keyboardProvider`. */
  keyboardScroll?: ComponentType<KeyboardScrollProps>;
  /**
   * `KeyboardToolbar` from react-native-keyboard-controller: previous / next /
   * done above the keyboard on Genesis's form layouts. Needs `keyboardScroll`
   * (and so `keyboardProvider`); without them it is ignored.
   */
  keyboardToolbar?: ComponentType<KeyboardToolbarProps>;
  /**
   * The optional native modules the app installed, for Genesis components to
   * use (`GenesisModulesProvider` from `@marktiderman/genesis-ui-native`):
   * FlashList, expo-image, Reanimated, expo-glass-effect, expo-symbols, a
   * lucide icon set, the @expo/ui date picker. Each one left out falls back
   * to plain React Native. Read once.
   */
  modules?: GenesisModules;
  /**
   * `@gorhom/bottom-sheet` v5, to opt every `NativeSheet` into it (snap
   * points, drag between heights): `import * as BottomSheet from "@gorhom/bottom-sheet"`,
   * then `bottomSheet={BottomSheet}`. The app mounts `NativeSheetProvider`
   * (and so the library's `BottomSheetModalProvider`) for you; the app's root
   * must still be inside gesture-handler's `GestureHandlerRootView`, with
   * Reanimated set up. Leave it out and sheets are React Native's own modal
   * (an iOS page sheet), which needs neither. Read once.
   */
  bottomSheet?: NativeSheetLibrary;
  /**
   * Toasts (`useToast()` from `@marktiderman/genesis-ui-native`): `NativeToastProvider` is
   * mounted around the screens, at the top of the screen by default (a bottom toast would sit on
   * a tab bar). Pass its options to place it, or `null` to mount your own. Read once.
   */
  toast?: Pick<NativeToastProviderProps, "position" | "disableAnimation"> | null;
  /** Follow a link held while signed out, once the user signs in. */
  links?: { hold: LinkHold; onRelease: (path: string) => void };
  /** Run before first render, in order (wipe-on-reinstall, hydrate stores, fonts). Read once. */
  steps?: readonly BootStep[];
  bootOptions?: BootOptions;
  /** Longest wait for Supabase's `getSession()` before using the stored session (offline). Default 5000 ms. */
  sessionWaitMs?: number;
  /** Default `globalThis.ErrorUtils`. */
  errorUtils?: ErrorUtilsLike;
  /** Report unhandled promise rejections to `onError`. Default Hermes's tracker; `null` turns it off. */
  rejectionTracker?: EnableRejectionTracker | null;
  /** `AppState` and NetInfo, so queries refetch on focus and know the network. */
  lifecycle?: QueryLifecycleOptions;
  /**
   * Report queries and mutations that failed for good to `onError` (and so
   * to the observability block), non-fatal, as `query` / `mutation` with the
   * key's first segment as a tag. Only unexpected errors: offline, signed
   * out, not found and the server's expected refusals are left to the
   * screen. One query opts out with `meta: { reportErrors: false }`.
   * Default true. Read once.
   */
  reportQueryErrors?: boolean;
  /**
   * Every caught error, after the blocks' own `onError` (the observability
   * block, `createObservability` from `/observability`, reports to Sentry
   * there). A throwing reporter is ignored.
   */
  onError?: OnError;
  /** After a signed-in user signs out, once the query cache is cleared. */
  onSignedOut?: () => void;
  /**
   * The updates block: `createUpdates(…)` from `@marktiderman/genesis-native/updates`
   * (force upgrade, maintenance, the update banner, what's new). Its policy
   * loads behind the splash for at most `policyTimeoutMs` and never fails the
   * boot. Read once; leave it out to turn the block off.
   */
  updates?: UpdatesBlock;
  /**
   * Blocks to run (`createUpdates(…)` is one). Resolved once at start: a
   * block whose requirement is missing, or two blocks contributing the same
   * slot, nav entry or Settings row, shows the fatal screen and reports a
   * `BlockError` to `onError`. Read once.
   */
  blocks?: readonly NativeBlock[];
  /**
   * Your features (FeatureIds) that blocks may require but that aren't
   * blocks. A block requiring anything that is neither one of `blocks` nor
   * listed here is a `BlockError`. Read once.
   */
  appFeatures?: readonly string[];
  slots?: Slots<NativeAppSlots>;
  slotProps?: SlotPropsFor<NativeAppSlots>;
  children?: ReactNode;
}

/** The default boot slot: a plain loading view (the splash covers it at launch). */
export function BootScreen(_props: BootScreenProps) {
  return (
    <View testID="genesis-boot" accessibilityRole="progressbar" style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text>Loading…</Text>
    </View>
  );
}

const PassThrough: ComponentType<SignedOutProps> = ({ children }) => <>{children}</>;

// The web provider's types don't list the native-only prop; Metro resolves the native provider.
const ThemeProvider = GenesisThemeProvider as ComponentType<{
  brand: CanonicalBrand;
  syncNativeAppearance?: boolean;
  children: ReactNode;
}>;

/**
 * The root of an Expo app: theme, keyboard, data, boot behind the splash, errors, session and held links.
 *
 * @stability Beta
 */
export function GenesisNativeApp(props: GenesisNativeAppProps) {
  // Above every provider: if one of them (or the shell's own set-up) throws,
  // this shows a screen made of nothing that can fail, and retry starts over.
  const [rootKey, setRootKey] = useState(0);
  const onErrorRef = useRef(props.onError);
  onErrorRef.current = props.onError;
  // The blocks as given, before they are resolved: an error here may come from resolving them.
  const blocksRef = useRef(givenBlocks(props));
  const splashRef = useRef(props.splash);
  splashRef.current = props.splash;
  return (
    <GenesisErrorBoundary
      key={rootKey}
      fallback={PlainFatalScreen}
      onError={(e, r) => {
        reportToBlocks(blocksRef.current, e, r);
        try {
          onErrorRef.current?.(e, r);
        } catch {
          // A failing reporter must not stop the fatal screen.
        }
        // The shell (which hides the splash) never mounted: hide it here, or the screen stays behind it.
        splashRef.current?.hideAsync().catch(() => {});
      }}
      onRetry={() => setRootKey((key) => key + 1)}
    >
      <ThemedShell {...props} />
    </GenesisErrorBoundary>
  );
}

declare const __DEV__: boolean | undefined;

const MISSING_KEYBOARD_PROVIDER =
  "GenesisNativeApp: `keyboardScroll` was given without `keyboardProvider`, so form screens won't move above the keyboard. " +
  'Pass `keyboardProvider={KeyboardProvider}` from "react-native-keyboard-controller" too.';

const TOOLBAR_WITHOUT_SCROLL =
  "GenesisNativeApp: `keyboardToolbar` was given without `keyboardScroll`, so it is ignored. " +
  'Pass `keyboardScroll={KeyboardAwareScrollView}` and `keyboardProvider={KeyboardProvider}` from "react-native-keyboard-controller" too.';

function ThemedShell(props: GenesisNativeAppProps) {
  const { brand, keyboardScroll, keyboardToolbar } = props;
  // Frozen: a new component type here (an inline wrapper) would remount the shell and reset the app.
  const [Keyboard] = useState(() => props.keyboardProvider);
  // Frozen too: an inline object would hand every component a new module set each render.
  const [modules] = useState(() => props.modules);
  const [toast] = useState(() => (props.toast === null ? null : { position: "top" as const, ...props.toast }));
  const missingProvider = Boolean(keyboardScroll) && !Keyboard;
  const toolbarWithoutScroll = Boolean(keyboardToolbar) && !keyboardScroll;
  useEffect(() => {
    if (typeof __DEV__ === "undefined" || !__DEV__) return;
    // genesis-allow-console: development-only set-up mistakes, shown as LogBox errors on purpose.
    if (missingProvider) console.error(MISSING_KEYBOARD_PROVIDER);
    if (toolbarWithoutScroll) console.error(TOOLBAR_WITHOUT_SCROLL);
  }, [missingProvider, toolbarWithoutScroll]);
  let body = <Shell {...props} />;
  // Inside the modules: a toast animates with Reanimated and draws Liquid Glass when the app gave them.
  if (toast) body = <NativeToastProvider {...toast}>{body}</NativeToastProvider>;
  if (modules) body = <GenesisModulesProvider modules={modules}>{body}</GenesisModulesProvider>;
  if (keyboardScroll) body = <KeyboardScrollProvider component={keyboardScroll} toolbar={keyboardToolbar}>{body}</KeyboardScrollProvider>;
  if (Keyboard) body = <Keyboard>{body}</Keyboard>;
  return (
    <ThemeProvider brand={brand} syncNativeAppearance>
      {props.brandVariables ? (
        <BrandVariables brand={brand} given={props.brandVariables}>
          {body}
        </BrandVariables>
      ) : (
        body
      )}
    </ThemeProvider>
  );
}

/**
 * Theme role variables (`--primary`, `--background`, …) for the current mode,
 * set on a view around the app, so NativeWind's role classes (`bg-primary` is
 * `hsl(var(--primary))`) read them instead of what `:root` declares. Only with
 * `brandVariables`: NativeWind can't tell which `:root` variables are the
 * app's own, so setting them is the app's choice.
 */
function BrandVariables({
  brand,
  given,
  children,
}: {
  brand: CanonicalBrand;
  given: NonNullable<GenesisNativeAppProps["brandVariables"]>;
  children: ReactNode;
}) {
  const { resolvedMode } = useTheme();
  const variables = useMemo(() => {
    if (given === true) return brandRoleVariables(brand);
    const perMode = given as { light?: unknown; dark?: unknown };
    if (typeof perMode.light === "object" && typeof perMode.dark === "object") return given as { light: Record<string, string>; dark: Record<string, string> };
    return { light: given as Record<string, string>, dark: given as Record<string, string> };
  }, [brand, given]);
  const style = useMemo(() => [{ flex: 1 }, vars(variables[resolvedMode])], [variables, resolvedMode]);
  return (
    <View testID="genesis-brand-variables" style={style}>
      {children}
    </View>
  );
}

const SESSION_STEP_MARGIN_MS = 15_000;

function Shell(props: GenesisNativeAppProps) {
  const { supabase, provider, queryClient: queryOptions, persist, splash, links, steps = [], bootOptions, sessionWaitMs = 5000 } = props;
  const { errorUtils, rejectionTracker, lifecycle, slotProps, children } = props;
  const latest = useRef(props);
  latest.current = props;
  const [blockList] = useState(() => givenBlocks(props));
  // Read once, like the keyboard provider: a different module later would remount the screens.
  const [bottomSheet] = useState(() => props.bottomSheet);
  const onError: OnError = (error, report) => {
    reportToBlocks(blockList, error, report);
    try {
      latest.current.onError?.(error, report);
    } catch {
      // A failing reporter must not take the shell down with it.
    }
  };
  // How many fatal screens are up (the global handler lets a second fatal error end the app).
  const fatalShown = useRef(0);

  // Created once: the shell's parts live as long as the app.
  const [parts] = useState(() => {
    const list = blockList;
    const blocks = resolveBlocks(list, props.appFeatures ? [...list.map((b) => b.id), ...props.appFeatures] : undefined, {
      platform: "native",
      slots: NATIVE_APP_SLOT_NAMES,
    });
    const client = queryOptions?.client ?? createNativeQueryClient(queryOptions?.config);
    const persistence = persist ? persist(client) : null;
    const session = createSessionStore(supabase, {
      waitMs: sessionWaitMs,
      // Another user (or nobody) now: nothing of the last user's may show or stay on disk.
      onUserChange: (previous, next) => {
        client.clear();
        void persistence?.clear();
        if (previous !== null && next === null) latest.current.onSignedOut?.();
      },
    });
    const boot = createBoot(
      [
        ...steps,
        // Blocks' steps, in dependency order (the updates block's settles within its own timeout and never throws).
        ...blocks.blocks.flatMap((block) => block.bootSteps ?? []),
        { id: "genesis:session", run: () => session.load(), timeoutMs: sessionWaitMs + SESSION_STEP_MARGIN_MS },
        // After the session, so only the cache saved for this user is restored.
        ...(persistence ? [{ id: "genesis:query-cache", run: () => persistence.restore(session.getState().userId ?? "") }] : []),
      ],
      bootOptions,
    );
    // One component type for the life of the app, so a re-render never remounts a visible fatal screen.
    function FatalFallback(fallbackProps: FatalScreenProps) {
      useEffect(() => {
        fatalShown.current++;
        return () => {
          fatalShown.current--;
        };
      }, []);
      const { slotProps: sp } = latest.current;
      const s = withBlockSlots(blocks.slots, latest.current.slots);
      return (
        // A `fatal` slot that throws falls back to the plain screen.
        <GenesisErrorBoundary fallback={PlainFatalScreen} onError={onError} onRetry={fallbackProps.retry}>
          {renderSlot(FatalScreen, s?.fatal, fallbackProps, sp?.fatal)}
        </GenesisErrorBoundary>
      );
    }
    return { client, persistence, session, boot, FatalFallback, blocks, provider: provider ?? createSupabaseProvider(supabase) };
  });
  const { boot, session, persistence, client, FatalFallback } = parts;
  const slots = withBlockSlots(parts.blocks.slots, props.slots);
  const bootState = useSyncExternalStore(boot.subscribe, boot.getState, boot.getState);
  const sessionState = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  const [fatal, setFatal] = useState<Error | null>(null);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => session.start(), [session]);
  useEffect(() => {
    void boot.start();
  }, [boot]);
  useEffect(() => {
    if (bootState.status === "failed" && bootState.error) onError(bootState.error, { fatal: true, source: "boot" });
  }, [bootState.status, bootState.error]);
  useEffect(() => {
    if (bootState.status === "ready" && persistence) return persistence.subscribe(sessionState.userId ?? "");
  }, [bootState.status, persistence, sessionState.userId]);
  useEffect(() => {
    const utils = errorUtils ?? defaultErrorUtils();
    if (!utils) return;
    return installGlobalErrorHandler({ errorUtils: utils, onError, onFatal: setFatal, alreadyFatal: () => fatalShown.current > 0 });
  }, [errorUtils]);
  useEffect(() => {
    const enable = rejectionTracker === null ? undefined : (rejectionTracker ?? defaultRejectionTracker());
    if (enable) installRejectionTracker({ enable, onError });
  }, [rejectionTracker]);
  useEffect(() => (lifecycle ? connectQueryLifecycle(lifecycle) : undefined), [lifecycle]);
  const [queryReports] = useState(() => props.reportQueryErrors !== false);
  useEffect(() => (queryReports ? reportQueryErrors(client, onError) : undefined), [client, queryReports]);

  // Splash: up until boot has finished (the session step included), or failed.
  const settled = bootState.status === "ready" || bootState.status === "failed" || fatal !== null;
  const splashHidden = useRef(false);
  useEffect(() => {
    if (!settled || !splash || splashHidden.current) return;
    splashHidden.current = true;
    splash.hideAsync().catch(() => {});
  }, [settled, splash]);

  const auth: HeldLinkAuth = bootState.status !== "ready" || sessionState.status === "loading" ? "pending" : sessionState.status;
  useHeldLink(links?.hold ?? NO_HOLD, { auth: links ? auth : "pending", onRelease: (path) => links?.onRelease(path) });

  const retry = () => {
    setFatal(null);
    setResetKey((key) => key + 1);
    if (boot.getState().status === "failed") void boot.retry();
  };

  let content: ReactNode;
  if (fatal) {
    content = <FatalFallback error={fatal} retry={retry} />;
  } else if (bootState.status === "failed" && bootState.error) {
    content = <FatalFallback error={bootState.error} retry={retry} />;
  } else if (bootState.status !== "ready") {
    content = renderSlot(BootScreen, slots?.boot, { status: bootState.status }, slotProps?.boot);
  } else {
    const screens =
      sessionState.status === "signedOut" ? renderSlot(PassThrough, slots?.signedOut, { children }, slotProps?.signedOut) : children;
    const guarded = renderSlot(
      GenesisErrorBoundary,
      slots?.errorBoundary,
      { fallback: FatalFallback, onError, resetKey, onRetry: retry, children: screens },
      slotProps?.errorBoundary,
    );
    // The first block's root is the outermost.
    content = parts.blocks.blocks.reduceRight<ReactNode>((inner, block) => {
      const Root = block.Root;
      return Root ? (
        <Root key={block.id} slots={slots} slotProps={slotProps}>
          {inner}
        </Root>
      ) : (
        inner
      );
    }, guarded);
  }

  return (
    <GenesisProvider provider={parts.provider} queryClient={client}>
      <SessionProvider store={session}>
        <BootProvider boot={boot}>
          <BlocksProvider value={parts.blocks}>
            <GenesisErrorBoundary key={resetKey} fallback={FatalFallback} onError={onError} onRetry={retry}>
              {/* Sheet content renders in the library's portal, here: below data, session, boot and blocks. */}
              {bottomSheet ? <NativeSheetProvider bottomSheet={bottomSheet}>{content}</NativeSheetProvider> : content}
            </GenesisErrorBoundary>
          </BlocksProvider>
        </BootProvider>
      </SessionProvider>
    </GenesisProvider>
  );
}

// Every slot name, checked against NativeAppSlots by the compiler: a block filling any other is a BlockError.
const SLOT_NAMES: Record<keyof NativeAppSlots, true> = {
  boot: true,
  fatal: true,
  errorBoundary: true,
  signedOut: true,
  forceUpgrade: true,
  maintenance: true,
  updateBanner: true,
  whatsNew: true,
  devtoolsFeedback: true,
  pushPrompt: true,
};
const NATIVE_APP_SLOT_NAMES: readonly string[] = Object.keys(SLOT_NAMES);

/** Blocks' slot fills under the app's own slots: the app's (a component or `null`) always win. */
function withBlockSlots(fills: Readonly<Record<string, unknown>>, own: Slots<NativeAppSlots> | undefined): Slots<NativeAppSlots> | undefined {
  if (Object.keys(fills).length === 0) return own;
  return { ...(fills as Slots<NativeAppSlots>), ...own };
}

/** `blocks`, with `updates` added when it was given on its own (given both ways, it runs once). */
function givenBlocks(props: Pick<GenesisNativeAppProps, "blocks" | "updates">): readonly NativeBlock[] {
  const given = props.blocks ?? [];
  return props.updates && !given.includes(props.updates) ? [...given, props.updates] : given;
}

const NO_HOLD: LinkHold = {
  hold: () => {},
  peek: () => null,
  take: () => null,
  clear: () => {},
  subscribe: () => () => {},
};
