/**
 * `<GenesisNativeApp>`: everything above an Expo app's screens, so the root
 * `_layout.tsx` is a few lines.
 *
 *   theme (GenesisThemeProvider, owning the platform color scheme)
 *   └ keyboard-aware scrolling (when `keyboardScroll` is given)
 *     └ data (GenesisProvider over the Supabase client, a persisted QueryClient)
 *       └ session + boot (splash held until both are known)
 *         └ updateBanner + errorBoundary → your screens (or `signedOut`)
 *
 * Global errors and render errors show the `fatal` slot with "Try again".
 * Every part is a slot (`slots` / `slotProps`, `null` drops it) and is also
 * exported on its own: `createBoot`/`useBoot`, `GenesisErrorBoundary`,
 * `installGlobalErrorHandler`, `createNativeQueryClient`/`createQueryPersistence`,
 * `createSessionStore`/`useSession`, `normalizeLink`, `useHeldLink`.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
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
  defaultErrorUtils,
  installGlobalErrorHandler,
  type ErrorUtilsLike,
  type FatalScreenProps,
  type GenesisErrorBoundaryProps,
  type OnError,
} from "./errors";
import { SessionProvider, createSessionStore, type AuthClientLike } from "./auth";
import { useHeldLink, type LinkHold } from "./held-link";
import {
  connectQueryLifecycle,
  createNativeQueryClient,
  createQueryPersistence,
  type AsyncStorageLike,
  type QueryLifecycleOptions,
} from "./query";

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
export type NativeAppSlots = {
  /** Shown while booting, under the splash. Default nothing. */
  boot: BootScreenProps;
  /** A failed boot, a fatal global error or a render error. Default `FatalScreen`. */
  fatal: FatalScreenProps;
  /** The boundary around your screens. Default `GenesisErrorBoundary`. */
  errorBoundary: GenesisErrorBoundaryProps;
  /** What a signed-out user sees. Default your screens (gate them with `useSession`). */
  signedOut: SignedOutProps;
  /** Above your screens, for the updates block. Default nothing. */
  updateBanner: Record<string, never>;
};

export interface NativeQueryClientOptions {
  /** Your own client. Default `createNativeQueryClient(config)`. */
  client?: QueryClient;
  config?: QueryClientConfig;
  /** Save these queries to `storage`; needs `storage`. */
  persist?: {
    /** Query-key roots to save. */
    keys: readonly string[];
    /** The app version; a new one discards the saved cache. */
    buster: string;
    /** Default 24 hours. */
    maxAge?: number;
    /** Write at most this often. Default 1000 ms. */
    throttleMs?: number;
  };
}

export interface GenesisNativeAppProps {
  brand: CanonicalBrand;
  /** A Supabase client (from `createGenesisSupabase` in `@marktiderman/genesis-supabase`). */
  supabase: AuthClientLike & SupabaseClientInput;
  /** The data provider. Default `createSupabaseProvider(supabase)`. */
  provider?: DataProvider;
  queryClient?: NativeQueryClientOptions;
  /** Async storage (AsyncStorage, MMKV…) for the query cache. */
  storage?: AsyncStorageLike;
  /** `expo-splash-screen`: hidden once boot has finished and the session is known. */
  splash?: SplashModule;
  /** `KeyboardAwareScrollView` from react-native-keyboard-controller, for form screens. */
  keyboardScroll?: ComponentType<KeyboardScrollProps>;
  /** Release a held deep link once signed in. */
  links?: { hold: LinkHold; onRelease: (path: string) => void };
  /** Run before first render, in order (wipe-on-reinstall, hydrate stores, fonts). Read once. */
  steps?: readonly BootStep[];
  bootOptions?: BootOptions;
  /** Default `globalThis.ErrorUtils`. */
  errorUtils?: ErrorUtilsLike;
  /** `AppState` and NetInfo, so queries refetch on focus and know the network. */
  lifecycle?: QueryLifecycleOptions;
  /** Every caught error, for reporting (Sentry). */
  onError?: OnError;
  /** After sign-out, once the query cache is cleared. */
  onSignedOut?: () => void;
  slots?: Slots<NativeAppSlots>;
  slotProps?: SlotPropsFor<NativeAppSlots>;
  children?: ReactNode;
}

const NoBootScreen: ComponentType<BootScreenProps> = () => null;
const NoUpdateBanner: ComponentType<Record<string, never>> = () => null;
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
  const { brand, keyboardScroll, children } = props;
  const body = <Shell {...props}>{children}</Shell>;
  return (
    <ThemeProvider brand={brand} syncNativeAppearance>
      {keyboardScroll ? <KeyboardScrollProvider component={keyboardScroll}>{body}</KeyboardScrollProvider> : body}
    </ThemeProvider>
  );
}

function Shell({
  supabase,
  provider,
  queryClient: queryOptions,
  storage,
  splash,
  links,
  steps = [],
  bootOptions,
  errorUtils,
  lifecycle,
  onError,
  onSignedOut,
  slots,
  slotProps,
  children,
}: GenesisNativeAppProps) {
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onSignedOutRef = useRef(onSignedOut);
  onSignedOutRef.current = onSignedOut;

  // Created once: the shell's parts live as long as the app.
  const [parts] = useState(() => {
    const client = queryOptions?.client ?? createNativeQueryClient(queryOptions?.config);
    const persist = queryOptions?.persist;
    const persistence = persist && storage ? createQueryPersistence({ queryClient: client, storage, ...persist }) : null;
    const session = createSessionStore(supabase, {
      onSignedOut: () => {
        client.clear();
        void persistence?.clear();
        onSignedOutRef.current?.();
      },
    });
    const boot = createBoot(
      [
        ...steps,
        ...(persistence ? [{ id: "genesis:query-cache", run: () => persistence.restore() }] : []),
        { id: "genesis:session", run: () => session.load() },
      ],
      bootOptions,
    );
    return { client, persistence, session, boot, provider: provider ?? createSupabaseProvider(supabase) };
  });
  const { boot, session, persistence, client } = parts;
  const bootState = useSyncExternalStore(boot.subscribe, boot.getState, boot.getState);
  const sessionState = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  const [fatal, setFatal] = useState<Error | null>(null);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => session.start(), [session]);
  useEffect(() => {
    void boot.start();
  }, [boot]);
  useEffect(() => {
    if (bootState.status === "failed" && bootState.error) {
      onErrorRef.current?.(bootState.error, { fatal: true, source: "boot" });
    }
  }, [bootState.status, bootState.error]);
  useEffect(() => {
    if (bootState.status === "ready" && persistence) return persistence.subscribe();
  }, [bootState.status, persistence]);
  useEffect(() => {
    const utils = errorUtils ?? defaultErrorUtils();
    if (!utils) return;
    return installGlobalErrorHandler({ errorUtils: utils, onError: (e, r) => onErrorRef.current?.(e, r), onFatal: setFatal });
  }, [errorUtils]);
  useEffect(() => (lifecycle ? connectQueryLifecycle(lifecycle) : undefined), [lifecycle]);

  // Splash: up until boot has finished (the session step included), or failed.
  const settled = bootState.status === "ready" || bootState.status === "failed" || fatal !== null;
  const splashHidden = useRef(false);
  useEffect(() => {
    if (!settled || !splash || splashHidden.current) return;
    splashHidden.current = true;
    splash.hideAsync().catch(() => {});
  }, [settled, splash]);

  useHeldLink(links?.hold ?? NO_HOLD, {
    ready: Boolean(links) && bootState.status === "ready" && sessionState.status === "signedIn",
    onRelease: (path) => links?.onRelease(path),
  });

  const retry = useCallback(() => {
    setFatal(null);
    setResetKey((key) => key + 1);
    if (boot.getState().status === "failed") void boot.retry();
  }, [boot]);

  const fatalSlot = slots?.fatal;
  const fatalExtra = slotProps?.fatal;
  const Fallback = useMemo<ComponentType<FatalScreenProps>>(
    () => (fallbackProps) => renderSlot(FatalScreen, fatalSlot, fallbackProps, fatalExtra),
    [fatalSlot, fatalExtra],
  );

  let content: ReactNode;
  if (fatal) {
    content = <Fallback error={fatal} retry={retry} />;
  } else if (bootState.status === "failed" && bootState.error) {
    content = <Fallback error={bootState.error} retry={retry} />;
  } else if (bootState.status !== "ready") {
    content = renderSlot(NoBootScreen, slots?.boot, { status: bootState.status }, slotProps?.boot);
  } else {
    const screens = sessionState.status === "signedOut"
      ? renderSlot(PassThrough, slots?.signedOut, { children }, slotProps?.signedOut)
      : children;
    content = (
      <>
        {renderSlot(NoUpdateBanner, slots?.updateBanner, {}, slotProps?.updateBanner)}
        {renderSlot(
          GenesisErrorBoundary,
          slots?.errorBoundary,
          {
            fallback: Fallback,
            onError: (e, r) => onErrorRef.current?.(e, r),
            resetKey,
            onRetry: retry,
            children: screens,
          },
          slotProps?.errorBoundary,
        )}
      </>
    );
  }

  return (
    <GenesisProvider provider={parts.provider} queryClient={client}>
      <SessionProvider store={session}>
        <BootProvider boot={boot}>
          <GenesisErrorBoundary key={resetKey} fallback={Fallback} onError={(e, r) => onErrorRef.current?.(e, r)} onRetry={retry}>
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
