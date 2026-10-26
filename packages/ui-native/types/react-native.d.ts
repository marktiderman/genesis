// Minimal RN type stubs for compilation without react-native installed.
// Consumers provide the real react-native package as a peer dependency.

declare module "react-native" {
  import type { ComponentType } from "react";

  export interface ViewStyle {
    [key: string]: any;
  }

  export interface TextStyle {
    [key: string]: any;
  }

  export interface ImageStyle {
    [key: string]: any;
  }

  export interface AccessibilityState {
    disabled?: boolean;
    selected?: boolean;
    checked?: boolean | "mixed";
    busy?: boolean;
    expanded?: boolean;
  }

  export interface AccessibilityValue {
    min?: number;
    max?: number;
    now?: number;
    text?: string;
  }

  export interface ViewProps {
    style?: ViewStyle | ViewStyle[];
    className?: string;
    children?: React.ReactNode;
    accessible?: boolean;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    accessibilityHint?: string;
    accessibilityState?: AccessibilityState;
    accessibilityValue?: AccessibilityValue;
    accessibilityLiveRegion?: "none" | "polite" | "assertive";
    accessibilityElementsHidden?: boolean;
    accessibilityViewIsModal?: boolean;
    importantForAccessibility?: "auto" | "yes" | "no" | "no-hide-descendants";
    onAccessibilityEscape?: () => void;
    pointerEvents?: "none" | "auto" | "box-none" | "box-only";
    onLayout?: (e: any) => void;
    collapsable?: boolean;
    testID?: string;
    ref?: React.Ref<any>;
  }

  export interface TextProps {
    style?: TextStyle | TextStyle[];
    className?: string;
    children?: React.ReactNode;
    numberOfLines?: number;
    accessible?: boolean;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    accessibilityHint?: string;
    accessibilityState?: AccessibilityState;
    accessibilityElementsHidden?: boolean;
    importantForAccessibility?: "auto" | "yes" | "no" | "no-hide-descendants";
    /** iOS: the Dynamic Type text style this text scales with. */
    dynamicTypeRamp?:
      | "caption2"
      | "caption1"
      | "footnote"
      | "subheadline"
      | "callout"
      | "body"
      | "headline"
      | "title3"
      | "title2"
      | "title1"
      | "largeTitle";
    onPress?: () => void;
    testID?: string;
    nativeID?: string;
  }

  export interface TextInputProps {
    style?: TextStyle | TextStyle[];
    className?: string;
    value?: string;
    defaultValue?: string;
    onChangeText?: (text: string) => void;
    onBlur?: (e: any) => void;
    onFocus?: (e: any) => void;
    onSubmitEditing?: (e: any) => void;
    placeholder?: string;
    placeholderTextColor?: string;
    editable?: boolean;
    multiline?: boolean;
    numberOfLines?: number;
    secureTextEntry?: boolean;
    keyboardType?: string;
    returnKeyType?: string;
    autoCapitalize?: "none" | "sentences" | "words" | "characters";
    autoCorrect?: boolean;
    autoFocus?: boolean;
    maxLength?: number;
    accessible?: boolean;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    accessibilityHint?: string;
    accessibilityState?: AccessibilityState;
    clearButtonMode?: "never" | "while-editing" | "unless-editing" | "always";
    /** iOS AutoFill hint, e.g. "emailAddress", "password", "newPassword". */
    textContentType?: string;
    /** Android Autofill and web autocomplete hint, e.g. "email", "current-password". */
    autoComplete?: string;
    /** What the return key does: "submit" keeps the keyboard open, "blurAndSubmit" closes it. */
    submitBehavior?: "submit" | "blurAndSubmit" | "newline";
    testID?: string;
    ref?: React.Ref<any>;
  }

  export interface AccessibilityInfoModule {
    isReduceMotionEnabled(): Promise<boolean>;
    /** iOS: the Reduce Transparency setting. */
    isReduceTransparencyEnabled?(): Promise<boolean>;
    addEventListener(
      eventName: string,
      handler: (...args: any[]) => void
    ): { remove(): void };
  }

  export interface DimensionsModule {
    get(dim: "window" | "screen"): { width: number; height: number; scale: number; fontScale: number };
    addEventListener(
      type: "change",
      handler: (...args: any[]) => void
    ): { remove(): void };
  }

  export interface PanResponderGestureState {
    dx: number;
    dy: number;
    vx: number;
    vy: number;
    moveX: number;
    moveY: number;
  }

  export interface PanResponderInstance {
    panHandlers: Record<string, any>;
  }

  export interface PressableProps {
    style?: ViewStyle | ViewStyle[] | ((state: { pressed: boolean }) => ViewStyle | ViewStyle[]);
    className?: string;
    onPress?: () => void;
    onLongPress?: () => void;
    disabled?: boolean;
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
    accessible?: boolean;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    accessibilityHint?: string;
    accessibilityState?: AccessibilityState;
    accessibilityValue?: AccessibilityValue;
    importantForAccessibility?: "auto" | "yes" | "no" | "no-hide-descendants";
    accessibilityLiveRegion?: "none" | "polite" | "assertive";
    accessibilityActions?: ReadonlyArray<{ name: string; label?: string }>;
    onAccessibilityAction?: (event: { nativeEvent: { actionName: string } }) => void;
    onPressIn?: () => void;
    onPressOut?: () => void;
    testID?: string;
    ref?: React.Ref<any>;
    hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
  }

  export interface ImageProps {
    style?: ImageStyle | ImageStyle[];
    className?: string;
    source: { uri: string } | number;
    resizeMode?: "cover" | "contain" | "stretch" | "center";
    onError?: (e: any) => void;
    onLoad?: () => void;
    accessible?: boolean;
    accessibilityLabel?: string;
    testID?: string;
  }

  export interface SwitchProps {
    value?: boolean;
    onValueChange?: (value: boolean) => void;
    disabled?: boolean;
    trackColor?: { false?: string; true?: string };
    thumbColor?: string;
    accessibilityState?: AccessibilityState;
    testID?: string;
  }

  export interface ModalProps {
    visible?: boolean;
    transparent?: boolean;
    animationType?: "none" | "slide" | "fade";
    /** iOS. */
    presentationStyle?: "fullScreen" | "pageSheet" | "formSheet" | "overFullScreen";
    /** iOS: a swipe down dismisses (then `onRequestClose`); otherwise it only asks. */
    allowSwipeDismissal?: boolean;
    /** The container's color when not `transparent`. */
    backdropColor?: string | OpaqueColorValue;
    /** Android. */
    statusBarTranslucent?: boolean;
    /** Android. */
    navigationBarTranslucent?: boolean;
    onRequestClose?: () => void;
    onDismiss?: () => void;
    children?: React.ReactNode;
    testID?: string;
  }

  export interface ActivityIndicatorProps {
    size?: "small" | "large" | number;
    color?: string;
    animating?: boolean;
    accessibilityLabel?: string;
    testID?: string;
  }

  export interface ScrollViewProps extends ViewProps {
    contentContainerStyle?: ViewStyle | ViewStyle[];
    contentContainerClassName?: string;
    contentInsetAdjustmentBehavior?:
      | "automatic"
      | "scrollableAxes"
      | "never"
      | "always";
    horizontal?: boolean;
    showsVerticalScrollIndicator?: boolean;
    showsHorizontalScrollIndicator?: boolean;
    keyboardShouldPersistTaps?: "always" | "never" | "handled";
    bounces?: boolean;
    scrollEnabled?: boolean;
    refreshControl?: React.ReactElement | undefined;
    onContentSizeChange?: (width: number, height: number) => void;
  }

  export interface SectionListProps<
    T,
    SectionT extends { data: ReadonlyArray<T> } = { data: ReadonlyArray<T> },
  > extends ScrollViewProps {
    sections: ReadonlyArray<SectionT>;
    renderItem?: (info: {
      item: T;
      index: number;
      section: SectionT;
    }) => React.ReactNode;
    renderSectionHeader?: (info: {
      section: SectionT;
    }) => React.ReactNode;
    keyExtractor?: (item: T, index: number) => string;
    ItemSeparatorComponent?: ComponentType;
    refreshing?: boolean;
    onRefresh?: () => void;
    stickySectionHeadersEnabled?: boolean;
  }

  export interface RefreshControlProps {
    refreshing: boolean;
    onRefresh?: () => void;
    tintColor?: string;
    title?: string;
    titleColor?: string;
    colors?: string[];
    progressBackgroundColor?: string;
    testID?: string;
  }

  export interface KeyboardAvoidingViewProps extends ViewProps {
    behavior?: "height" | "position" | "padding";
    keyboardVerticalOffset?: number;
    enabled?: boolean;
  }

  export interface StatusBarProps {
    barStyle?: "default" | "light-content" | "dark-content";
    backgroundColor?: string;
    translucent?: boolean;
    hidden?: boolean;
    animated?: boolean;
    networkActivityIndicatorVisible?: boolean;
  }

  export type ColorSchemeName = "light" | "dark" | null | undefined;

  /** A color string, or an opaque platform color from `PlatformColor`. */
  export type OpaqueColorValue = symbol & { __TYPE__: "Color" };
  export type ColorValue = string | OpaqueColorValue;
  export function PlatformColor(...names: string[]): OpaqueColorValue;

  export interface AppearanceModule {
    getColorScheme(): ColorSchemeName;
    addChangeListener(
      cb: (preferences: { colorScheme: ColorSchemeName }) => void,
    ): { remove(): void };
  }

  export interface FlatListProps<T> {
    data: T[] | null | undefined;
    renderItem: (info: { item: T; index: number }) => React.ReactNode;
    keyExtractor?: (item: T, index: number) => string;
    style?: ViewStyle | ViewStyle[];
    contentContainerStyle?: ViewStyle | ViewStyle[];
    ListHeaderComponent?: React.ReactNode | ComponentType;
    ListFooterComponent?: React.ReactNode | ComponentType;
    ListEmptyComponent?: React.ReactNode | ComponentType;
    ItemSeparatorComponent?: ComponentType;
    horizontal?: boolean;
    numColumns?: number;
    onEndReached?: () => void;
    onEndReachedThreshold?: number;
    refreshing?: boolean;
    onRefresh?: () => void;
    refreshControl?: React.ReactElement | undefined;
    contentInsetAdjustmentBehavior?: "automatic" | "scrollableAxes" | "never" | "always";
    keyboardShouldPersistTaps?: "always" | "never" | "handled";
    testID?: string;
  }

  export const View: ComponentType<ViewProps>;
  export const Text: ComponentType<TextProps>;
  export const TextInput: ComponentType<TextInputProps>;
  export const Pressable: ComponentType<PressableProps>;
  export const Image: ComponentType<ImageProps>;
  export const Switch: ComponentType<SwitchProps>;
  export const Modal: ComponentType<ModalProps>;
  export const ActivityIndicator: ComponentType<ActivityIndicatorProps>;
  export const ScrollView: ComponentType<ScrollViewProps>;
  export const SafeAreaView: ComponentType<ViewProps>;
  export const RefreshControl: ComponentType<RefreshControlProps>;
  export const KeyboardAvoidingView: ComponentType<KeyboardAvoidingViewProps>;
  export const StatusBar: ComponentType<StatusBarProps>;
  export const Appearance: AppearanceModule;
  export interface AlertButton {
    text?: string;
    onPress?: () => void;
    style?: "default" | "cancel" | "destructive";
  }

  export interface AlertOptions {
    cancelable?: boolean;
    onDismiss?: () => void;
    /** iOS-only: forces a specific UI style for the alert (RN 0.76+). */
    userInterfaceStyle?: "light" | "dark" | "unspecified";
  }

  export const Alert: {
    alert(
      title: string,
      message?: string,
      buttons?: AlertButton[],
      options?: AlertOptions,
    ): void;
  };

  export class FlatList<T> extends React.Component<FlatListProps<T>> {}
  export class SectionList<
    T,
    SectionT extends { data: ReadonlyArray<T> } = { data: ReadonlyArray<T> },
  > extends React.Component<SectionListProps<T, SectionT>> {}

  export const StyleSheet: {
    /** The thinnest line the screen can draw (one physical pixel). */
    hairlineWidth: number;
    create: <T>(styles: T) => T;
    flatten: (style: unknown) => Record<string, any>;
  };

  export const Platform: {
    OS: "ios" | "android" | "web";
    /** Android API level (number) or iOS version (string). */
    Version: number | string;
    select: <T>(specifics: { ios?: T; android?: T; web?: T; default?: T }) => T;
  };

  export const Animated: {
    View: ComponentType<ViewProps & { style?: any; pointerEvents?: string }>;
    Text: ComponentType<TextProps & { style?: any }>;
    Value: new (value: number) => {
      setValue: (value: number) => void;
      interpolate: (config: any) => any;
    };
    timing: (value: any, config: any) => { start: (callback?: () => void) => void };
    sequence: (animations: any[]) => { start: (callback?: () => void) => void };
    parallel: (animations: any[]) => { start: (callback?: () => void) => void };
    loop: (animation: any) => { start: () => void; stop: () => void };
    spring: (value: any, config: any) => { start: (callback?: () => void) => void };
    decay: (value: any, config: any) => { start: (callback?: () => void) => void };
  };

  export const Easing: {
    linear: any;
    ease: any;
    inOut: (easing: any) => any;
  };

  export interface EmitterSubscription {
    remove: () => void;
  }

  export const AccessibilityInfo: AccessibilityInfoModule;
  export const Dimensions: DimensionsModule;
  export const PanResponder: {
    create(config: {
      onStartShouldSetPanResponder?: (e: any, g: PanResponderGestureState) => boolean;
      onStartShouldSetPanResponderCapture?: (e: any, g: PanResponderGestureState) => boolean;
      onMoveShouldSetPanResponder?: (e: any, g: PanResponderGestureState) => boolean;
      onMoveShouldSetPanResponderCapture?: (e: any, g: PanResponderGestureState) => boolean;
      onPanResponderMove?: (e: any, g: PanResponderGestureState) => void;
      onPanResponderRelease?: (e: any, g: PanResponderGestureState) => void;
      onPanResponderGrant?: (e: any, g: PanResponderGestureState) => void;
      onPanResponderTerminate?: (e: any, g: PanResponderGestureState) => void;
      onPanResponderTerminationRequest?: (e: any, g: PanResponderGestureState) => boolean;
      onShouldBlockNativeResponder?: (e: any, g: PanResponderGestureState) => boolean;
    }): PanResponderInstance;
  };
}

declare module "nativewind" {
  export function cssInterop(
    component: any,
    mapping: Record<string, string>
  ): any;
}

declare module "lucide-react-native" {
  import type { ComponentType } from "react";

  interface IconProps {
    size?: number;
    color?: string;
    strokeWidth?: number;
    className?: string;
  }

  export const Loader2: ComponentType<IconProps>;
  export const X: ComponentType<IconProps>;
  export const Check: ComponentType<IconProps>;
  export const ChevronDown: ComponentType<IconProps>;
  export const ChevronUp: ComponentType<IconProps>;
  export const ChevronLeft: ComponentType<IconProps>;
  export const ChevronRight: ComponentType<IconProps>;
  export const AlertCircle: ComponentType<IconProps>;
  export const Info: ComponentType<IconProps>;
  export const AlertTriangle: ComponentType<IconProps>;
  export const User: ComponentType<IconProps>;
  export const Plus: ComponentType<IconProps>;
  export const Minus: ComponentType<IconProps>;
  export const Edit: ComponentType<IconProps>;
  export const Trash: ComponentType<IconProps>;
  export const Search: ComponentType<IconProps>;
  export const Filter: ComponentType<IconProps>;
  export const Eye: ComponentType<IconProps>;
  export const EyeOff: ComponentType<IconProps>;
  export const Menu: ComponentType<IconProps>;
  export const Settings: ComponentType<IconProps>;
  export const Heart: ComponentType<IconProps>;
  export const Star: ComponentType<IconProps>;
  export const Home: ComponentType<IconProps>;
  // The icons `src/icons/lucide.ts` maps (lucide-react-native >= 0.475 names).
  export const ArrowLeft: ComponentType<IconProps>;
  export const Bell: ComponentType<IconProps>;
  export const Calendar: ComponentType<IconProps>;
  export const CircleCheck: ComponentType<IconProps>;
  export const CircleX: ComponentType<IconProps>;
  export const Clock: ComponentType<IconProps>;
  export const Ellipsis: ComponentType<IconProps>;
  export const ExternalLink: ComponentType<IconProps>;
  export const Funnel: ComponentType<IconProps>;
  export const House: ComponentType<IconProps>;
  export const Lock: ComponentType<IconProps>;
  export const LogOut: ComponentType<IconProps>;
  export const Mail: ComponentType<IconProps>;
  export const Pencil: ComponentType<IconProps>;
  export const RefreshCw: ComponentType<IconProps>;
  export const Share: ComponentType<IconProps>;
  export const Trash2: ComponentType<IconProps>;
  export const TriangleAlert: ComponentType<IconProps>;
  // Chat's (genesis-chat/native).
  export const ArrowUp: ComponentType<IconProps>;
  export const Camera: ComponentType<IconProps>;
  export const Copy: ComponentType<IconProps>;
  export const File: ComponentType<IconProps>;
  export const Image: ComponentType<IconProps>;
  export const MessageCircle: ComponentType<IconProps>;
  export const Mic: ComponentType<IconProps>;
  export const Paperclip: ComponentType<IconProps>;
  export const Pause: ComponentType<IconProps>;
  export const Pin: ComponentType<IconProps>;
  export const Play: ComponentType<IconProps>;
  export const Reply: ComponentType<IconProps>;
  export const SquarePen: ComponentType<IconProps>;
  export const Download: ComponentType<IconProps>;
  export const Smile: ComponentType<IconProps>;
}
