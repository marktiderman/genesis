/**
 * @feat:chat
 * The pieces the native chat screens are drawn from, as the platform's Messages app draws them on
 * iOS 26: its colors (`useChatColors`, from the design system's chat roles, so the brand never
 * moves them), its sizes and type, its feel (haptics and motion through Genesis's tokens), an SF
 * Symbol with Genesis's icon as the fallback, a contact's face (a picture, or initials on the grey
 * gradient), a Liquid Glass panel and circle (solid where glass can't be drawn), the glass menu,
 * and the long-press layer (the screen softens, the pressed thing is drawn again in place, a menu
 * opens under it).
 *
 * Glass comes from genesis-ui-native (`useLiquidGlass`: `GenesisModules.glass`, off under Reduce
 * Transparency), symbols from `GenesisModules.symbol`, haptics from `useHaptics`, overlays from
 * `NativeFullScreenModal`. Without those modules each piece is the solid, icon-font version.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Dimensions, Platform, PlatformColor, Pressable, View, type ColorValue, type PressableProps, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolveChatRoles, type ChatAccent, type ChatRole } from "@marktiderman/genesis-design-system";
import { NativeFullScreenModal, NativeIcon, NativeImage, NativeText, useGenesisModules, useLiquidGlass, type NativeIconName } from "@marktiderman/genesis-ui-native/components";
import { motionSpring, useHaptics, useMotion, useThemeMode, useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { initials } from "./context";

// ---- Colors ------------------------------------------------------------------------------------

/** The chat roles and + list accents for the app's scheme, with the theme's neutral text roles. */
export interface ChatColors {
  scheme: "light" | "dark";
  roles: Record<ChatRole, ColorValue>;
  accents: Record<ChatAccent, ColorValue>;
  /** The face's grey gradient, as a CSS gradient string (`experimental_backgroundImage`). */
  avatarGradient: string;
  label: ColorValue;
  secondaryLabel: ColorValue;
  tertiaryLabel: ColorValue;
  separator: ColorValue;
  destructive: ColorValue;
}

const platformColor = (name: string): ColorValue => PlatformColor(name);

/** Chat's colors for this scheme: the design system's chat roles (iOS system colors on iOS), and the theme's text roles. */
export function chatColors(scheme: "light" | "dark", neutral: Pick<ChatColors, "label" | "secondaryLabel" | "tertiaryLabel" | "separator" | "destructive">): ChatColors {
  const ios = Platform.OS === "ios";
  const { roles, accents } = resolveChatRoles<ColorValue>({ target: ios ? "ios" : Platform.OS === "web" ? "web" : "android", scheme, ...(ios ? { platformColor } : {}) });
  return {
    scheme,
    roles: roles as Record<ChatRole, ColorValue>,
    accents: accents as Record<ChatAccent, ColorValue>,
    // The face's roles are plain strings on every platform (Messages draws its own greys).
    avatarGradient: `linear-gradient(180deg, ${String(roles.avatarTop)}, ${String(roles.avatarBottom)})`,
    ...neutral,
  };
}

/** `chatColors` for the app's light or dark scheme. */
export function useChatColors(): ChatColors {
  const scheme = useThemeMode();
  const theme = useThemeRoles();
  return useMemo(
    () => chatColors(scheme, { label: theme.label, secondaryLabel: theme.secondaryLabel, tertiaryLabel: theme.tertiaryLabel, separator: theme.separator, destructive: theme.destructive }),
    [scheme, theme.label, theme.secondaryLabel, theme.tertiaryLabel, theme.separator, theme.destructive],
  );
}

// ---- Sizes and type ----------------------------------------------------------------------------

/** Messages' sizes on an iPhone, in points. */
export const CHAT_METRICS = {
  margin: 16,
  rowUnreadColumn: 23,
  avatar: 40,
  /** Where an inbox row's text (and its hairline) starts. */
  rowText: 83,
  rowMinHeight: 76,
  pinnedAvatar: 84,
  bubbleRadius: 18,
  bubbleMaxWidth: "75%",
  bubblePadH: 12,
  bubblePadV: 7,
  bubbleGap: 2,
  runGap: 10,
  headerAvatar: 50,
  composerButton: 40,
  sendButton: 30,
  menuWidth: 250,
  menuRow: 42,
  menuRadius: 22,
  detailsAvatar: 96,
  detailsButton: 50,
  cardRadius: 26,
} as const;

/** Messages' type: SF Pro, through the system font. */
export const CHAT_TYPE = {
  body: { fontSize: 17, lineHeight: 22 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: "600" as const },
  preview: { fontSize: 15, lineHeight: 20 },
  meta: { fontSize: 15, lineHeight: 20 },
  status: { fontSize: 11, lineHeight: 13, fontWeight: "600" as const },
  separator: { fontSize: 11, lineHeight: 13 },
} as const;

// ---- Feel --------------------------------------------------------------------------------------

/** Messages' haptics, through Genesis's: a light tap for a choice or tapback, medium when a menu opens, a soft one on send. */
export function useChatFeel() {
  const haptic = useHaptics();
  return useMemo(() => ({ select: () => haptic("select"), menu: () => haptic("medium"), send: () => haptic("light") }), [haptic]);
}

/** Springs and fades from Genesis's motion tokens. Under Reduce Motion `reduced` is true and durations are 0. */
export function useChatMotion() {
  const motion = useMotion();
  return useMemo(
    () => ({
      reduced: motion.reduced,
      spring: (value: Animated.Value, toValue: number, name: "snappy" | "smooth" | "bouncy" = "snappy") =>
        Animated.spring(value, { toValue, useNativeDriver: true, ...motionSpring(motion, name) }),
      fade: (value: Animated.Value, toValue: number) => Animated.timing(value, { toValue, duration: motion.duration.fast, useNativeDriver: true }),
      /** A spring, or a fade under Reduce Motion. */
      settle: (value: Animated.Value, toValue: number, name: "snappy" | "smooth" | "bouncy" = "smooth") =>
        motion.reduced ? Animated.timing(value, { toValue, duration: motion.duration.fast, useNativeDriver: true }) : Animated.spring(value, { toValue, useNativeDriver: true, ...motionSpring(motion, name) }),
    }),
    [motion],
  );
}

// ---- Tap ---------------------------------------------------------------------------------------

/** A Pressable whose look follows the press (`look(pressed)`), kept in state so it works where a function `style` is dropped. */
export function ChatTap({ look, children, onPressIn, onPressOut, ...rest }: Omit<PressableProps, "style" | "children"> & { look: (pressed: boolean) => ViewStyle; children?: ReactNode }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={look(pressed)}
    >
      {children}
    </Pressable>
  );
}

// ---- Symbol and face ---------------------------------------------------------------------------

export interface ChatSymbolProps {
  /** Genesis's semantic icon: the fallback, and the symbol when `sf` is left out. */
  icon: NativeIconName;
  /** The SF Symbol Messages uses (a filled one, say), on iOS with `GenesisModules.symbol`. */
  sf?: string;
  size?: number;
  color: ColorValue;
  weight?: "regular" | "medium" | "semibold" | "bold";
  testID?: string;
}

/** An SF Symbol on iOS, Genesis's icon elsewhere. Decorative: label what it sits in. */
export function ChatSymbol({ icon, sf, size = 17, color, weight = "regular", testID }: ChatSymbolProps) {
  const { symbol: Symbol } = useGenesisModules();
  if (Platform.OS === "ios" && Symbol && sf) {
    return (
      <View testID={testID} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
        <Symbol name={sf} size={size} tintColor={color} weight={weight} fallback={<NativeIcon name={icon} size={size} color={color} />} style={{ width: size, height: size }} />
      </View>
    );
  }
  return <NativeIcon name={icon} size={size} color={color} weight={weight} testID={testID} />;
}

export interface ChatFaceProps {
  /** Their name: its initials show without a picture. Null or empty: a person. */
  name?: string | null;
  src?: string | null;
  size?: number;
  /** Keeps the picture when a list recycles the row. */
  recyclingKey?: string;
  testID?: string;
}

/** A contact's circle as Messages draws it: their picture, else white initials on the grey gradient, else a person. */
export function ChatFace({ name, src, size = CHAT_METRICS.avatar, recyclingKey, testID }: ChatFaceProps) {
  const c = useChatColors();
  const [failed, setFailed] = useState<string | null>(null);
  const letters = name?.trim() ? initials(name) : "";
  const showImage = Boolean(src) && failed !== src;
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: c.roles.avatarFlat, experimental_backgroundImage: c.avatarGradient } as ViewStyle}
    >
      {letters ? (
        <NativeText allowFontScaling={false} style={{ color: c.roles.onAccent, fontSize: Math.round(size * 0.42), lineHeight: Math.round(size * 0.5), fontWeight: "600" }}>
          {letters}
        </NativeText>
      ) : (
        <ChatSymbol icon="user" sf="person.fill" size={Math.round(size * 0.56)} color={c.roles.onAccent} />
      )}
      {showImage && src ? (
        <View style={{ position: "absolute", top: 0, left: 0 }}>
          <NativeImage src={src} width={size} height={size} recyclingKey={recyclingKey ?? src} onError={() => setFailed(src)} alt="" />
        </View>
      ) : null}
    </View>
  );
}

// ---- Glass -------------------------------------------------------------------------------------

export interface ChatGlassPanelProps {
  radius: number;
  style?: ViewStyle;
  children: ReactNode;
  interactive?: boolean;
  testID?: string;
}

/** A floating panel: Liquid Glass where it can be drawn, else Messages' solid panel, with a shadow either way. */
export function ChatGlassPanel({ radius, style, children, interactive = false, testID }: ChatGlassPanelProps) {
  const GlassView = useLiquidGlass();
  const c = useChatColors();
  const shadow: ViewStyle = { shadowColor: c.roles.shadow, shadowOpacity: c.scheme === "dark" ? 0.45 : 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 6 } };
  if (GlassView) {
    return (
      <View testID={testID} style={[{ borderRadius: radius }, shadow, style]}>
        <GlassView style={{ borderRadius: radius, overflow: "hidden" }} glassEffectStyle="regular" colorScheme={c.scheme} isInteractive={interactive}>
          {children}
        </GlassView>
      </View>
    );
  }
  return (
    <View testID={testID} style={[{ borderRadius: radius, backgroundColor: c.roles.panel }, shadow, style]}>
      <View style={{ borderRadius: radius, overflow: "hidden" }}>{children}</View>
    </View>
  );
}

export interface ChatGlassCircleProps {
  size: number;
  onPress: () => void;
  label: string;
  hint?: string;
  disabled?: boolean;
  testID: string;
  children: ReactNode;
}

/** A round glass button (the composer's +, the details' actions, the search field's Cancel). */
export function ChatGlassCircle({ size, onPress, label, hint, disabled = false, testID, children }: ChatGlassCircleProps) {
  return (
    <ChatTap
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      hitSlop={6}
      look={(pressed) => ({ opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] })}
    >
      <ChatGlassPanel radius={size / 2} interactive>
        <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>{children}</View>
      </ChatGlassPanel>
    </ChatTap>
  );
}

// ---- Menu --------------------------------------------------------------------------------------

/** A row of the glass menu (the bubble's long press, the + list). */
export interface ChatMenuItem {
  id: string;
  label: string;
  icon?: NativeIconName;
  /** The SF Symbol for `icon` on iOS. */
  sf?: string;
  /** A picture of its own in the icon's place (the + list's round icons). */
  leading?: ReactNode;
  destructive?: boolean;
  /** A tick on the trailing side. */
  checked?: boolean;
  onPress: () => void;
}

export interface ChatGlassMenuProps {
  items: readonly ChatMenuItem[];
  width?: number;
  /** The + list's larger rows. */
  large?: boolean;
  testID: string;
}

export function ChatGlassMenu({ items, width = CHAT_METRICS.menuWidth, large = false, testID }: ChatGlassMenuProps) {
  const c = useChatColors();
  return (
    <ChatGlassPanel radius={large ? 32 : CHAT_METRICS.menuRadius} style={{ width }} testID={testID}>
      <View accessibilityRole="menu" style={{ paddingVertical: large ? 10 : 6 }}>
        {items.map((item) => {
          const color = item.destructive ? c.destructive : c.label;
          return (
            <ChatTap
              key={item.id}
              testID={`${testID}-${item.id}`}
              accessibilityRole="menuitem"
              accessibilityLabel={item.label}
              accessibilityState={item.checked !== undefined ? { checked: item.checked } : undefined}
              onPress={item.onPress}
              look={(pressed) => ({
                flexDirection: "row",
                alignItems: "center",
                minHeight: large ? 50 : CHAT_METRICS.menuRow,
                paddingHorizontal: large ? 22 : 18,
                gap: large ? 20 : 14,
                marginHorizontal: 6,
                borderRadius: 16,
                backgroundColor: pressed ? c.roles.pressed : undefined,
              })}
            >
              {item.leading ? (
                <View style={{ width: 32, alignItems: "center" }}>{item.leading}</View>
              ) : item.icon ? (
                <View style={{ width: 24, alignItems: "center" }}>
                  <ChatSymbol icon={item.icon} sf={item.sf} size={18} color={color} />
                </View>
              ) : null}
              <NativeText numberOfLines={1} style={{ flex: 1, fontSize: large ? 19 : 17, lineHeight: 22, color }}>
                {item.label}
              </NativeText>
              {item.checked ? <ChatSymbol icon="check" size={15} weight="semibold" color={c.label} /> : null}
            </ChatTap>
          );
        })}
      </View>
    </ChatGlassPanel>
  );
}

/** A round colored icon, as the + list draws one. */
export function ChatAccentIcon({ icon, sf, color }: { icon: NativeIconName; sf?: string; color: ColorValue }) {
  const c = useChatColors();
  return (
    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <ChatSymbol icon={icon} sf={sf} size={16} color={c.roles.onAccent} />
    </View>
  );
}

// ---- Long-press layer --------------------------------------------------------------------------

/** Where the pressed thing is on the window (`measureInWindow`). */
export interface ChatRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChatContextOverlayProps {
  open: boolean;
  onClose: () => void;
  /** Where the preview was; null puts it near the top. */
  anchor: ChatRect | null;
  preview: ReactNode;
  /** The preview's height when there is no anchor. */
  previewHeight?: number;
  /** Over the preview (the tapbacks). */
  above?: ReactNode;
  items: readonly ChatMenuItem[];
  align?: "leading" | "trailing";
  closeLabel?: string;
  testID: string;
}

const GAP = 10;

/**
 * The long-press layer: the screen softens, the pressed thing lifts where it was, `above` sits over
 * it and the glass menu opens under it, moving the preview when there isn't room. A choice runs
 * once the layer has closed (iOS presents nothing over a layer that is still going).
 */
export function ChatContextOverlay({ open, onClose, anchor, preview, previewHeight, above, items, align = "leading", closeLabel = "Close", testID }: ChatContextOverlayProps) {
  const feel = useChatFeel();
  // Read on each draw (it only draws while open), so a turn of the phone is taken into account.
  const { width: W, height: H } = Dimensions.get("window");
  const insets = useSafeAreaInsets();
  const m = useChatMotion();
  const c = useChatColors();
  const progress = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(open);
  if (open && !visible) setVisible(true);
  const [aboveH, setAboveH] = useState(56);
  const [menuH, setMenuH] = useState(items.length * CHAT_METRICS.menuRow + 12);
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (open) {
      feel.menu();
      progress.setValue(0);
      m.settle(progress, 1).start();
    } else if (visible) {
      m.fade(progress, 0).start(() => {
        setVisible(false);
        const run = pending.current;
        pending.current = null;
        run?.();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!visible) return null;

  const top = insets.top + 8;
  const bottom = H - insets.bottom - 8;
  const pH = anchor?.height ?? previewHeight ?? H * 0.55;
  const pW = anchor ? anchor.width + 4 : W - 2 * CHAT_METRICS.margin;
  const pX = anchor ? (align === "trailing" ? anchor.x - 4 : anchor.x) : CHAT_METRICS.margin;
  const aboveSpace = above ? aboveH + GAP : 0;
  let pY = anchor ? anchor.y : top + 8;
  if (pY + pH + GAP + menuH > bottom) pY = bottom - menuH - GAP - pH;
  if (pY - aboveSpace < top) pY = top + aboveSpace;
  const side: ViewStyle = align === "trailing" ? { right: Math.max(CHAT_METRICS.margin, W - (pX + pW)) } : { left: Math.max(CHAT_METRICS.margin, pX) };
  const pop = { opacity: progress, transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [m.reduced ? 1 : 0.7, 1] }) }] };
  const lift = { transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, m.reduced ? 1 : 1.02] }) }] };

  return (
    <NativeFullScreenModal open onOpenChange={(o) => !o && onClose()} tone="none" testID={`${testID}-layer`}>
      <View testID={testID} style={{ flex: 1 }}>
        <Animated.View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: progress, backgroundColor: c.roles.scrim }} />
        <Pressable testID={`${testID}-dismiss`} accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
        {above ? (
          <Animated.View onLayout={(e) => setAboveH(e.nativeEvent.layout.height)} style={[{ position: "absolute", top: pY - GAP - aboveH }, side, pop]}>
            {above}
          </Animated.View>
        ) : null}
        <Animated.View pointerEvents="box-none" style={[{ position: "absolute", top: pY, left: pX, width: pW, height: anchor ? undefined : pH }, lift]}>
          {preview}
        </Animated.View>
        <Animated.View onLayout={(e) => setMenuH(e.nativeEvent.layout.height)} style={[{ position: "absolute", top: pY + pH + GAP }, side, pop]}>
          <ChatGlassMenu
            testID={`${testID}-menu`}
            items={items.map((i) => ({
              ...i,
              onPress: () => {
                pending.current = i.onPress;
                onClose();
              },
            }))}
          />
        </Animated.View>
      </View>
    </NativeFullScreenModal>
  );
}

/** The glass list rising from a corner (the composer's +): rows with round colored icons. */
export function ChatGlassList({ open, onClose, items, bottom, closeLabel = "Close", testID }: { open: boolean; onClose: () => void; items: readonly ChatMenuItem[]; bottom: number; closeLabel?: string; testID: string }) {
  const feel = useChatFeel();
  const { width } = Dimensions.get("window");
  const m = useChatMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!open) return;
    feel.menu();
    progress.setValue(0);
    m.settle(progress, 1).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // A choice runs after the layer has gone: the picker, the camera or a sheet can't open over it.
  useEffect(() => {
    if (open || !pending.current) return;
    const run = pending.current;
    pending.current = null;
    const t = setTimeout(run, 0);
    return () => clearTimeout(t);
  }, [open]);
  return (
    <NativeFullScreenModal open={open} onOpenChange={(o) => !o && onClose()} tone="none" testID={`${testID}-layer`}>
      <View style={{ flex: 1 }}>
        <Pressable testID={`${testID}-dismiss`} accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
        <Animated.View
          style={{
            position: "absolute",
            left: 8,
            bottom,
            opacity: progress,
            transform: [
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [m.reduced ? 0 : 40, 0] }) },
              { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [m.reduced ? 1 : 0.5, 1] }) },
            ],
          }}
        >
          <ChatGlassMenu
            large
            width={Math.min(300, width - 40)}
            testID={testID}
            items={items.map((i) => ({
              ...i,
              onPress: () => {
                pending.current = i.onPress;
                onClose();
              },
            }))}
          />
        </Animated.View>
      </View>
    </NativeFullScreenModal>
  );
}
