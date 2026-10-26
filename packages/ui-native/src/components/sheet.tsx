/**
 * Sheet / BottomSheet — modal that slides up from the bottom.
 *
 * Use for non-blocking selections, filters, and short flows that benefit
 * from preserving screen context. For blocking confirmations, use
 * <NativeDialog>. For full-screen flows, use a navigation route.
 *
 * By default this is React Native's own `Modal`, which needs nothing mounted
 * above it: the system page sheet on iOS (swipe down to close) and a bottom
 * panel over a scrim on Android (back button or a tap on the scrim closes
 * it). Content gets its own safe area (`useSafeAreaInsets` inside the sheet
 * is the sheet's), and the bottom inset is padded. Put scrolling content in
 * `NativeSheetScrollView`. The sheet doesn't move above the keyboard.
 *
 * `@gorhom/bottom-sheet` (snap points, drag between heights) is used only
 * when the app opts in by mounting `<NativeSheetProvider bottomSheet={…}>`
 * (or passing `bottomSheet` to `GenesisNativeApp`), never because the
 * library happens to be installed: it throws on open unless its
 * `BottomSheetModalProvider` is mounted, and it needs gesture-handler's
 * `GestureHandlerRootView` at the root and Reanimated set up.
 * `snapPoints` and `initialSnapIndex` apply only to that path.
 *
 * A short menu or form passes `fitContent`: the sheet is as tall as what is in it.
 *
 * A sheet that is a screen of its own (a link can open it) belongs in the
 * router instead: an expo-router screen with `presentation: "formSheet"` and
 * `sheetAllowedDetents` (e.g. `[0.5, 1]`) is the system sheet with detents.
 *
 * @stability Beta
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { AccessibilityInfo, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View, type ScrollViewProps, type ViewStyle } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeRoles } from "../hooks/use-theme-roles";

export interface NativeSheetProps {
  /** Controlled visibility. */
  open: boolean;
  /** Fired when the user dismisses the sheet (backdrop, swipe down, Android back). Set `open` false in it. */
  onOpenChange: (open: boolean) => void;
  /** Snap points, with `@gorhom/bottom-sheet` only (see `NativeSheetProvider`). e.g. ["25%", "50%", "90%"]. */
  snapPoints?: (string | number)[];
  /** Index of initial snap point, with `@gorhom/bottom-sheet` only. Default 0. */
  initialSnapIndex?: number;
  /** Keep the sheet open when the user taps the backdrop, swipes it down or presses Android back. Default false. */
  disableBackdropDismiss?: boolean;
  /**
   * As tall as its content (up to 90% of the screen) instead of the full page sheet, for a short
   * menu or form. On iOS this is a bottom panel over a scrim, like Android's (a tap on the scrim
   * or the VoiceOver escape gesture closes it; it doesn't follow a swipe down), and it moves above
   * the keyboard. Under `NativeSheetProvider` the library sizes it (`enableDynamicSizing`) and
   * `snapPoints` is ignored. Default false.
   */
  fitContent?: boolean;
  children: ReactNode;
  testID?: string;
}

type AnyComponent = ComponentType<Record<string, unknown>>;

/**
 * The parts of `@gorhom/bottom-sheet` (v5) the sheet uses. Pass the whole
 * module: `import * as BottomSheet from "@gorhom/bottom-sheet"`.
 */
export interface NativeSheetLibrary {
  BottomSheetModal: unknown;
  BottomSheetView: unknown;
  BottomSheetBackdrop: unknown;
  BottomSheetModalProvider: unknown;
  /** Used by `NativeSheetScrollView` when present. */
  BottomSheetScrollView?: unknown;
}

const REQUIRED_EXPORTS = ["BottomSheetModal", "BottomSheetView", "BottomSheetBackdrop", "BottomSheetModalProvider"] as const;

const SheetLibraryContext = createContext<NativeSheetLibrary | null>(null);

export interface NativeSheetProviderProps {
  /**
   * `@gorhom/bottom-sheet` v5 (`import * as BottomSheet from "@gorhom/bottom-sheet"`).
   * Read once. The app must also wrap its root in gesture-handler's
   * `GestureHandlerRootView` and set Reanimated up, as the library requires.
   * Sheet content renders in the library's portal, inside this provider:
   * mount it below the providers sheets read (data, session, navigation).
   */
  bottomSheet: NativeSheetLibrary;
  children: ReactNode;
}

/**
 * Opts every `NativeSheet` below it into `@gorhom/bottom-sheet` and mounts
 * the library's `BottomSheetModalProvider`. A module missing any export the
 * sheet needs is reported with `console.error` and ignored, so sheets fall
 * back to the native modal instead of crashing on open.
 *
 * @stability Beta
 */
export function NativeSheetProvider({ bottomSheet, children }: NativeSheetProviderProps) {
  // Frozen: a different module later would remount everything below the provider.
  const [library] = useState(() => (isSheetLibrary(bottomSheet) ? bottomSheet : null));
  const [problem] = useState(() => (library ? null : invalidLibraryMessage(bottomSheet)));
  useEffect(() => {
    if (problem) console.error(problem);
  }, [problem]);
  if (!library) return <>{children}</>;
  const Provider = library.BottomSheetModalProvider as ComponentType<{ children: ReactNode }>;
  return (
    <SheetLibraryContext.Provider value={library}>
      <Provider>{children}</Provider>
    </SheetLibraryContext.Provider>
  );
}

function isSheetLibrary(value: unknown): value is NativeSheetLibrary {
  if (!value || typeof value !== "object") return false;
  const mod = value as Record<string, unknown>;
  return REQUIRED_EXPORTS.every((name) => mod[name] != null);
}

function invalidLibraryMessage(value: unknown): string {
  const mod = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const missing = REQUIRED_EXPORTS.filter((name) => mod[name] == null);
  return (
    `NativeSheetProvider: \`bottomSheet\` is missing ${missing.join(", ")}, so sheets use the native modal. ` +
    'Pass the whole module: `import * as BottomSheet from "@gorhom/bottom-sheet"`.'
  );
}

/** @stability Beta */
export function NativeSheet(props: NativeSheetProps) {
  const library = useContext(SheetLibraryContext);
  if (library) return <LibrarySheet library={library} {...props} />;
  return <ModalSheet {...props} />;
}

/**
 * A `ScrollView` for sheet content: the library's `BottomSheetScrollView`
 * under `NativeSheetProvider` (so scrolling and dragging the sheet don't
 * fight), React Native's otherwise. Sized to its content until it reaches
 * the sheet's height.
 *
 * @stability Beta
 */
export function NativeSheetScrollView({ style, ...props }: ScrollViewProps) {
  const library = useContext(SheetLibraryContext);
  const Scroll = (library?.BottomSheetScrollView as ComponentType<ScrollViewProps> | undefined) ?? ScrollView;
  const own: ViewStyle = { flexGrow: 0 };
  return <Scroll style={[own, ...(Array.isArray(style) ? style : style ? [style] : [])]} {...props} />;
}

type SheetHandle = { present: () => void; dismiss: () => void };

function LibrarySheet({
  library,
  open,
  onOpenChange,
  snapPoints = ["50%", "90%"],
  initialSnapIndex = 0,
  disableBackdropDismiss = false,
  fitContent = false,
  testID,
  children,
}: NativeSheetProps & { library: NativeSheetLibrary }) {
  const sheet = useRef<SheetHandle | null>(null);
  // What the app asked for last, read when the library reports a dismiss: a dismiss
  // that finishes after the app reopened the sheet is not the user closing it.
  const wanted = useRef(open);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  // Child refs are attached before this runs, so the first render presents too.
  useEffect(() => {
    wanted.current = open;
    if (open) sheet.current?.present();
    else sheet.current?.dismiss();
  }, [open]);

  const BottomSheetModal = library.BottomSheetModal as AnyComponent;
  const BottomSheetView = library.BottomSheetView as AnyComponent;
  const BottomSheetBackdrop = library.BottomSheetBackdrop as AnyComponent;

  const onDismiss = useCallback(() => {
    if (wanted.current) {
      wanted.current = false;
      onOpenChangeRef.current(false);
    }
  }, []);
  const backdrop = useCallback(
    (p: Record<string, unknown>) => (
      <BottomSheetBackdrop
        {...p}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior={disableBackdropDismiss ? "none" : "close"}
      />
    ),
    [BottomSheetBackdrop, disableBackdropDismiss],
  );

  return (
    <BottomSheetModal
      ref={sheet}
      snapPoints={fitContent ? undefined : snapPoints}
      index={fitContent ? 0 : initialSnapIndex}
      // v5 sizes to the content by default and adds that as a snap point, which would shift the
      // indexes: only a sheet that fits its content asks for it, and then it is the only one.
      enableDynamicSizing={fitContent}
      onDismiss={onDismiss}
      enablePanDownToClose={!disableBackdropDismiss}
      backdropComponent={backdrop}
    >
      <BottomSheetView testID={testID ?? "native-sheet"}>{children}</BottomSheetView>
    </BottomSheetModal>
  );
}

/**
 * Whether Reduce Motion is on, or `null` until the system has answered: a
 * sheet mounted open waits for it, since the presentation animation is
 * chosen when the sheet is presented.
 */
function useReduceMotionAnswer(): boolean | null {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => mounted && setReduced(value),
      () => mounted && setReduced(false),
    );
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (value: boolean) => setReduced(value));
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}

/**
 * React Native's `Modal`, which needs no provider. iOS: the system page
 * sheet (`presentationStyle="pageSheet"`), following the finger when swiped
 * down (`allowSwipeDismissal`); with `disableBackdropDismiss` a swipe only
 * asks and the sheet springs back. Android: a transparent modal with a scrim
 * and a panel at the bottom, drawn under the system bars. `fitContent` on iOS: the same bottom
 * panel, kept above the keyboard.
 */
function ModalSheet({ open, onOpenChange, disableBackdropDismiss = false, fitContent = false, testID, children }: NativeSheetProps) {
  const reducedMotion = useReduceMotionAnswer();
  const roles = useThemeRoles();
  const requestClose = () => {
    if (!disableBackdropDismiss) onOpenChange(false);
  };
  const visible = open && reducedMotion !== null;
  const animationType = reducedMotion ? "none" : "slide";
  const id = testID ?? "native-sheet";

  const ios = Platform.OS === "ios";
  if (ios && !fitContent) {
    return (
      <Modal
        visible={visible}
        animationType={animationType}
        presentationStyle="pageSheet"
        allowSwipeDismissal={!disableBackdropDismiss}
        backdropColor={roles.background}
        onRequestClose={requestClose}
      >
        <SafeAreaProvider>
          <SheetBody
            testID={id}
            onAccessibilityEscape={disableBackdropDismiss ? undefined : requestClose}
            style={{ flex: 1, backgroundColor: roles.background }}
          >
            {children}
          </SheetBody>
        </SafeAreaProvider>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={requestClose}
    >
      <SafeAreaProvider>
        <KeyboardAvoidingView behavior={ios ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            testID={`${id}-backdrop`}
            accessibilityRole="button"
            accessibilityLabel="Close"
            disabled={disableBackdropDismiss}
            importantForAccessibility={disableBackdropDismiss ? "no-hide-descendants" : "auto"}
            onPress={requestClose}
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.4)" }}
          />
          <SheetBody
            testID={id}
            onAccessibilityEscape={disableBackdropDismiss ? undefined : requestClose}
            style={{
              maxHeight: "90%",
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              backgroundColor: roles.surface,
              paddingTop: 12,
            }}
          >
            <View
              style={{ alignSelf: "center", width: 32, height: 4, borderRadius: 2, marginBottom: 8, backgroundColor: roles.tertiaryLabel }}
            />
            {children}
          </SheetBody>
        </KeyboardAvoidingView>
      </SafeAreaProvider>
    </Modal>
  );
}

/** The sheet's root, padded by the sheet's own bottom inset (the home indicator, the navigation bar). */
function SheetBody({
  testID,
  style,
  onAccessibilityEscape,
  children,
}: {
  testID: string;
  style: ViewStyle;
  onAccessibilityEscape?: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View testID={testID} accessibilityViewIsModal onAccessibilityEscape={onAccessibilityEscape} style={{ ...style, paddingBottom: insets.bottom }}>
      {children}
    </View>
  );
}
