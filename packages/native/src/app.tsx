/**
 * `<GenesisNativeApp>`: everything above an Expo app's screens, so the root
 * `_layout.tsx` is a few lines.
 *
 *   last-resort boundary (React Native primitives only)
 *   └ theme (GenesisThemeProvider, owning the platform color scheme)
 *     └ keyboard-aware scrolling (when `keyboardScroll` is given)
 *       └ data (GenesisProvider over the Supabase client, the QueryClient)
 *         └ session + boot (splash held until both are known)
 *           └ updates (with `updates`: force upgrade, maintenance, banner, what's new)
 *             └ errorBoundary → your screens (or `signedOut`)
 *
 * Global errors, render errors and a failed boot show the `fatal` slot with
 * "Try again". Every part is a slot (`slots` / `slotProps`, `null` drops it)
 * and is also exported on its own.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { Text, View } from "react-native";
import type { QueryClient, QueryClientConfig } from "@tanstack/react-query";
import { GenesisThemeProvider } from "@marktiderman/genesis-design-system/theme";
import type { CanonicalBrand } from "@marktiderman/genesis-design-system";
import { GenesisProvider, createSupabaseProvider, type DataProvider, type SupabaseClientInput } from "@marktiderman/genesis-core/provider";
import { renderSlot, type SlotPropsFor, type Slots } from "@marktiderman/genesis-core/slots";
import { KeyboardScrollProvider, type KeyboardScrollProps } from "@marktiderman/genesis-ui-native/layouts";
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
import { connectQueryLifecycle, createNativeQueryClient, type QueryLifecycleOptions, type QueryPersistence } from "./query";
// Types only: the block's code is in the `/updates` entry and arrives with the `updates` prop.
import type { UpdatesBlock, UpdatesSlots } from "./updates/block";

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
export type NativeAppSlots = UpdatesSlots & {
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
  /** `KeyboardAwareScrollView` from react-native-keyboard-controller, for form screens. */
  keyboardScroll?: ComponentType<KeyboardScrollProps>;
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
  /** Every caught error, for reporting (Sentry). */
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
 * The root of an Expo app: theme, keyboard scrolling, data, boot behind the splash, errors, session and held links.
 *
 * @stability Beta
 */
export function GenesisNativeApp(props: GenesisNativeAppProps) {
  // Above every provider: if one of them (or the shell's own set-up) throws,
  // this shows a screen made of nothing that can fail, and retry starts over.
  const [rootKey, setRootKey] = useState(0);
  const onErrorRef = useRef(props.onError);
  onErrorRef.current = props.onError;
  return (
    <GenesisErrorBoundary
      key={rootKey}
      fallback={PlainFatalScreen}
      onError={(e, r) => onErrorRef.current?.(e, r)}
      onRetry={() => setRootKey((key) => key + 1)}
    >
      <ThemedShell {...props} />
    </GenesisErrorBoundary>
  );
}

function ThemedShell(props: GenesisNativeAppProps) {
  const { brand, keyboardScroll } = props;
  const body = <Shell {...props} />;
  return (
    <ThemeProvider brand={brand} syncNativeAppearance>
      {keyboardScroll ? <KeyboardScrollProvider component={keyboardScroll}>{body}</KeyboardScrollProvider> : body}
    </ThemeProvider>
  );
}

const SESSION_STEP_MARGIN_MS = 15_000;

function Shell(props: GenesisNativeAppProps) {
  const { supabase, provider, queryClient: queryOptions, persist, splash, links, steps = [], bootOptions, sessionWaitMs = 5000 } = props;
  const { errorUtils, rejectionTracker, lifecycle, slots, slotProps, children } = props;
  const latest = useRef(props);
  latest.current = props;
  const onError: OnError = (error, report) => latest.current.onError?.(error, report);
  // How many fatal screens are up (the global handler lets a second fatal error end the app).
  const fatalShown = useRef(0);

  // Created once: the shell's parts live as long as the app.
  const [parts] = useState(() => {
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
        // Settles within its own timeout and never throws: a policy that can't load never blocks the app.
        ...(props.updates ? [props.updates.bootStep] : []),
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
      const { slots: s, slotProps: sp } = latest.current;
      return (
        // A `fatal` slot that throws falls back to the plain screen.
        <GenesisErrorBoundary fallback={PlainFatalScreen} onError={onError} onRetry={fallbackProps.retry}>
          {renderSlot(FatalScreen, s?.fatal, fallbackProps, sp?.fatal)}
        </GenesisErrorBoundary>
      );
    }
    return { client, persistence, session, boot, FatalFallback, updates: props.updates, provider: provider ?? createSupabaseProvider(supabase) };
  });
  const { boot, session, persistence, client, FatalFallback } = parts;
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
    const Updates = parts.updates?.Root;
    content = Updates ? (
      <Updates slots={slots} slotProps={slotProps}>
        {guarded}
      </Updates>
    ) : (
      guarded
    );
  }

  return (
    <GenesisProvider provider={parts.provider} queryClient={client}>
      <SessionProvider store={session}>
        <BootProvider boot={boot}>
          <GenesisErrorBoundary key={resetKey} fallback={FatalFallback} onError={onError} onRetry={retry}>
            {content}
          </GenesisErrorBoundary>
        </BootProvider>
      </SessionProvider>
    </GenesisProvider>
  );
}

const NO_HOLD: LinkHold = {
  hold: () => {},
  peek: () => null,
  take: () => null,
  clear: () => {},
  subscribe: () => () => {},
};
